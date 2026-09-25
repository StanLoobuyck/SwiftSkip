// SwiftSkip background script — Firefox (MV2)
// HLS download runs directly in the persistent background page.
// No chrome.offscreen API needed.

// ─── Download state ───────────────────────────────────────────────────────────

const lectureDownloadState = {
  available: false,
  active: false,
  jobId: null,
  url: null,
  title: null,
  tabId: null,
  phase: "No lecture detected",
  downloaded: 0,
  total: 0,
  percent: 0,
  fallback: null,
  error: null,
};

// ─── HLS download logic (inlined from offscreen.js) ──────────────────────────

const TS_MIME_TYPE = "video/mp2t";
const downloadJobs = new Map();

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

  const encrypted = lines.some(
    (line) => line.startsWith("#EXT-X-KEY") && !/METHOD=NONE/i.test(line),
  );
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
  setDownloadState({
    jobId: progress.jobId || lectureDownloadState.jobId,
    phase: progress.phase || lectureDownloadState.phase,
    downloaded: Number.isFinite(progress.downloaded) ? progress.downloaded : lectureDownloadState.downloaded,
    total: Number.isFinite(progress.total) ? progress.total : lectureDownloadState.total,
    percent: Number.isFinite(progress.percent) ? progress.percent : lectureDownloadState.percent,
    active: !["Complete", "Canceled"].includes(progress.phase),
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
    chunks.push(await fetchSegment(segmentUrls[i], job.abortController.signal));
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
    reportProgress(tabId, { jobId, phase: "Saving", percent: 100 });
    await downloadFile({
      url: objectUrl,
      filename: `${sanitizeFilename(title)}.${extension}`,
      saveAs: false,
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }
}

async function downloadManifestFallback(url, title) {
  await downloadFile({
    url,
    filename: `${sanitizeFilename(title)}.m3u8`,
    saveAs: false,
  });
}

async function runHlsDownload(url, title, tabId, jobId) {
  const job = { id: jobId, abortController: new AbortController() };
  downloadJobs.set(jobId, job);

  try {
    reportProgress(tabId, { jobId, phase: "Reading playlist", percent: 0 });
    const segmentUrls = await getSegmentUrls(url, job.abortController.signal);
    const tsBlob = await buildTransportStream(segmentUrls, tabId, job);
    await downloadBlob(tsBlob, title, "ts", tabId, jobId);
    reportProgress(tabId, { jobId, phase: "Complete", percent: 100 });
    return { ok: true, type: "ts" };
  } catch (error) {
    if (job.abortController.signal.aborted || (error && error.name === "AbortError")) {
      reportProgress(tabId, { jobId, phase: "Canceled", percent: 0 });
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(title) {
  const fallback = "lecture";
  const safeTitle = String(title || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return safeTitle || fallback;
}

// Firefox downloads.download returns a Promise; Chrome uses a callback.
// This wrapper handles both.
function downloadFile({ url, filename, saveAs = false }) {
  return new Promise((resolve, reject) => {
    const result = browser.downloads.download({ url, filename, saveAs });
    if (result && typeof result.then === "function") {
      // Firefox — returns a Promise
      result.then(resolve).catch(reject);
    } else {
      // Fallback callback path (shouldn't be needed in FF but just in case)
      if (browser.runtime.lastError) {
        reject(new Error(browser.runtime.lastError.message));
      } else {
        resolve(result);
      }
    }
  });
}

function createJobId() {
  return `swiftskip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPublicDownloadState() {
  return { ...lectureDownloadState };
}

function publishDownloadState() {
  const state = getPublicDownloadState();
  const shouldNotifyTab =
    state.active ||
    ["Complete", "Canceled", "Saved playlist", "Download failed"].includes(state.phase);

  if (state.tabId && shouldNotifyTab) {
    browser.tabs.sendMessage(state.tabId, {
      action: "lectureDownloadProgress",
      ...state,
    }).catch(() => {
      /* Tab may have navigated away. */
    });
  }

  browser.runtime.sendMessage({
    action: "lectureDownloadStateChanged",
    state,
  }).catch(() => {
    /* No popup listening. */
  });
}

function setDownloadState(patch, shouldPublish = true) {
  Object.assign(lectureDownloadState, patch);
  if (shouldPublish) publishDownloadState();
  return getPublicDownloadState();
}

// ─── Main download orchestrator ───────────────────────────────────────────────

async function startLectureDownload({ url, title, tabId, jobId }) {
  if (lectureDownloadState.active) {
    return getPublicDownloadState();
  }

  const resolvedUrl = url || lectureDownloadState.url;
  if (!resolvedUrl) {
    return setDownloadState({
      available: false,
      active: false,
      phase: "No lecture detected",
      error: "No lecture stream has been detected yet.",
    });
  }

  const resolvedTitle = sanitizeFilename(title || lectureDownloadState.title);
  const resolvedTabId = tabId || lectureDownloadState.tabId;
  const resolvedJobId = jobId || createJobId();

  setDownloadState({
    available: true,
    active: true,
    jobId: resolvedJobId,
    url: resolvedUrl,
    title: resolvedTitle,
    tabId: resolvedTabId,
    phase: "Preparing",
    downloaded: 0,
    total: 0,
    percent: 0,
    fallback: null,
    error: null,
  });

  const response = await runHlsDownload(resolvedUrl, resolvedTitle, resolvedTabId, resolvedJobId);

  if (response && response.canceled) {
    return setDownloadState({ active: false, phase: "Canceled", percent: 0, error: null });
  }

  if (response && response.fallback) {
    return setDownloadState({
      active: false,
      phase: "Saved playlist",
      percent: 0,
      fallback: response.fallback,
      error: response.error || null,
    });
  }

  if (response && response.ok === false) {
    return setDownloadState({
      active: false,
      phase: "Download failed",
      error: response.error || "Download failed.",
    });
  }

  return setDownloadState({ active: false, phase: "Complete", percent: 100, error: null });
}

// ─── Message handler ──────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.action) return;

  if (msg.action === "registerLectureDownloadUrl") {
    setDownloadState({
      available: true,
      url: msg.url,
      title: sanitizeFilename(msg.title),
      tabId: sender.tab && sender.tab.id,
      phase: lectureDownloadState.active ? lectureDownloadState.phase : "Ready",
      error: null,
    });
    return Promise.resolve({ ok: true, state: getPublicDownloadState() });
  }

  if (msg.action === "getLectureDownloadState") {
    return Promise.resolve({ ok: true, state: getPublicDownloadState() });
  }

  if (msg.action === "relayLectureDownloadProgress") {
    setDownloadState({
      jobId: msg.jobId || lectureDownloadState.jobId,
      tabId: msg.tabId || lectureDownloadState.tabId,
      phase: msg.phase || lectureDownloadState.phase,
      downloaded: Number.isFinite(msg.downloaded) ? msg.downloaded : lectureDownloadState.downloaded,
      total: Number.isFinite(msg.total) ? msg.total : lectureDownloadState.total,
      percent: Number.isFinite(msg.percent) ? msg.percent : lectureDownloadState.percent,
      active: !["Complete", "Canceled"].includes(msg.phase),
    });
    return;
  }

  if (msg.action === "cancelLectureDownload") {
    const job = downloadJobs.get(msg.jobId || lectureDownloadState.jobId);
    if (job) {
      job.abortController.abort();
    }
    setDownloadState({ active: false, phase: "Canceled", percent: 0, error: null });
    return Promise.resolve({ ok: true, canceled: Boolean(job) });
  }

  if (msg.action === "startLectureDownload") {
    return startLectureDownload({
      url: msg.url,
      title: msg.title,
      tabId: (sender.tab && sender.tab.id) || msg.tabId,
      jobId: msg.jobId,
    })
      .then((state) => ({ ok: !state.error, state }))
      .catch((error) => {
        const message = error && error.message ? error.message : String(error);
        console.error("SwiftSkip download failed:", message);
        const state = setDownloadState({
          active: false,
          phase: "Download failed",
          error: message,
          fallback: "m3u8",
        });
        // Best-effort fallback: save the raw playlist
        downloadFile({
          url: msg.url || lectureDownloadState.url,
          filename: `${sanitizeFilename(msg.title || lectureDownloadState.title)}.m3u8`,
          saveAs: false,
        }).catch((e) => console.error("SwiftSkip fallback download failed:", e));
        return { ok: false, error: message, state };
      });
  }

  if (msg.action === "downloadLecture") {
    return startLectureDownload({
      url: msg.url,
      title: msg.title,
      tabId: sender.tab && sender.tab.id,
      jobId: msg.jobId,
    })
      .then((state) => ({
        ok: !state.error,
        fallback: state.fallback,
        canceled: state.phase === "Canceled",
        state,
      }))
      .catch((error) => {
        const message = error && error.message ? error.message : String(error);
        console.error("SwiftSkip download failed:", message);
        return { ok: false, error: message };
      });
  }
});
