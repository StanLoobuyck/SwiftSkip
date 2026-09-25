const TS_MIME_TYPE = "video/mp2t";
const downloadJobs = new Map();

function sanitizeFilename(title) {
  const fallback = "lecture";
  const safeTitle = String(title || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

  return safeTitle || fallback;
}

function resolveUrl(baseUrl, value) {
  return new URL(value.trim().replace(/^"|"$/g, ""), baseUrl).toString();
}

function parseAttributes(line) {
  const attrs = {};
  const attrText = line.slice(line.indexOf(":") + 1);
  const parts = attrText.match(/(?:[^,"]+|"[^"]*")+/g) || [];

  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    if (!key || !rest.length) continue;
    attrs[key.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
  }

  return attrs;
}

function getLines(manifestText) {
  return manifestText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function chooseBestVariant(manifestText, manifestUrl) {
  const lines = getLines(manifestText);
  const variants = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;

    const nextLine = lines.slice(i + 1).find((line) => !line.startsWith("#"));
    if (!nextLine) continue;

    const attrs = parseAttributes(lines[i]);
    variants.push({
      bandwidth: Number(attrs.BANDWIDTH || attrs["AVERAGE-BANDWIDTH"] || 0),
      url: resolveUrl(manifestUrl, nextLine),
    });
  }

  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return variants[0] || null;
}

function parseMediaPlaylist(manifestText, manifestUrl) {
  const lines = getLines(manifestText);

  const encrypted = lines.some((line) => {
    return line.startsWith("#EXT-X-KEY") && !/METHOD=NONE/i.test(line);
  });

  if (encrypted) {
    throw new Error("Encrypted HLS streams are not supported by the in-browser remuxer.");
  }

  if (lines.some((line) => line.startsWith("#EXT-X-MAP"))) {
    throw new Error("Fragmented MP4 HLS streams are not supported by the TS downloader.");
  }

  const segments = lines
    .filter((line) => !line.startsWith("#"))
    .map((line) => resolveUrl(manifestUrl, line));

  if (!segments.length) {
    throw new Error("No media segments were found in the HLS playlist.");
  }

  return segments;
}

async function fetchText(url, signal) {
  const response = await fetch(url, { credentials: "include", signal });
  if (!response.ok) {
    throw new Error(`Could not fetch manifest (${response.status}).`);
  }
  return response.text();
}

async function getSegmentUrls(manifestUrl, signal) {
  const manifestText = await fetchText(manifestUrl, signal);
  const variant = chooseBestVariant(manifestText, manifestUrl);

  if (!variant) {
    return parseMediaPlaylist(manifestText, manifestUrl);
  }

  const mediaManifestText = await fetchText(variant.url, signal);
  return parseMediaPlaylist(mediaManifestText, variant.url);
}

async function fetchSegment(url, signal) {
  const response = await fetch(url, { credentials: "include", signal });
  if (!response.ok) {
    throw new Error(`Could not fetch media segment (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function reportProgress(tabId, progress) {
  if (!tabId) return;

  chrome.runtime.sendMessage({
    action: "relayLectureDownloadProgress",
    tabId,
    ...progress,
  });
}

async function buildTransportStream(segmentUrls, tabId, job) {
  const chunks = [];
  const total = segmentUrls.length;
  let lastReportedPercent = -1;

  reportProgress(tabId, {
    jobId: job.id,
    phase: "Downloading",
    downloaded: 0,
    total,
    percent: 0,
  });

  for (let i = 0; i < segmentUrls.length; i++) {
    if (job.abortController.signal.aborted) {
      throw new DOMException("Download canceled.", "AbortError");
    }

    const segmentUrl = segmentUrls[i];
    chunks.push(await fetchSegment(segmentUrl, job.abortController.signal));
    const downloaded = i + 1;
    const percent = Math.round((downloaded / total) * 100);

    if (percent !== lastReportedPercent) {
      lastReportedPercent = percent;
      reportProgress(tabId, {
        jobId: job.id,
        phase: "Downloading",
        downloaded,
        total,
        percent,
      });
    }
  }

  if (!chunks.length) {
    throw new Error("No media data was downloaded.");
  }

  return new Blob(chunks, { type: TS_MIME_TYPE });
}

async function downloadBlob(blob, title, extension, tabId, jobId) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    reportProgress(tabId, {
      jobId,
      phase: "Saving",
      percent: 100,
    });

    const response = await chrome.runtime.sendMessage({
      action: "downloadGeneratedFile",
      url: objectUrl,
      title: sanitizeFilename(title),
      extension,
    });

    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Chrome did not start the download.");
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }
}

async function downloadManifestFallback(url, title) {
  const response = await chrome.runtime.sendMessage({
    action: "downloadGeneratedFile",
    url,
    title: sanitizeFilename(title),
    extension: "m3u8",
  });

  if (!response || !response.ok) {
    throw new Error(response && response.error ? response.error : "Chrome did not start the playlist download.");
  }
}

async function downloadLecture(url, title, tabId, jobId) {
  const job = {
    id: jobId,
    abortController: new AbortController(),
  };
  downloadJobs.set(jobId, job);

  try {
    reportProgress(tabId, {
      jobId,
      phase: "Reading playlist",
      percent: 0,
    });

    const segmentUrls = await getSegmentUrls(url, job.abortController.signal);
    const tsBlob = await buildTransportStream(segmentUrls, tabId, job);
    await downloadBlob(tsBlob, title, "ts", tabId, jobId);

    reportProgress(tabId, {
      jobId,
      phase: "Complete",
      percent: 100,
    });

    return { ok: true, type: "ts" };
  } catch (error) {
    if (
      job.abortController.signal.aborted ||
      (error && error.name === "AbortError")
    ) {
      reportProgress(tabId, {
        jobId,
        phase: "Canceled",
        percent: 0,
      });

      return { ok: false, canceled: true };
    }

    console.error("SwiftSkip video download failed, falling back to m3u8:", error);
    await downloadManifestFallback(url, title);
    return {
      ok: false,
      fallback: "m3u8",
      error: error && error.message ? error.message : String(error),
    };
  } finally {
    downloadJobs.delete(jobId);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) {
    return false;
  }

  if (msg.action === "offscreenCancelLectureDownload") {
    const job = downloadJobs.get(msg.jobId);
    if (job) {
      job.abortController.abort();
    }

    sendResponse({ ok: true, canceled: Boolean(job) });
    return false;
  }

  if (msg.action !== "offscreenDownloadLecture") {
    return false;
  }

  downloadLecture(msg.url, msg.title, msg.tabId, msg.jobId)
    .then(sendResponse)
    .catch((error) => {
      const message = error && error.message ? error.message : String(error);
      console.error("SwiftSkip download failed:", error);
      sendResponse({ ok: false, error: message });
    });

  return true;
});
