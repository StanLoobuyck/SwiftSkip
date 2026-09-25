// Downloads an HLS lecture and saves it as a single .ts file.
// Runs where blob URLs are available: the Firefox background page, or the
// Chrome offscreen document (Chrome's service worker can't create blob URLs).

import { chooseBestVariant, parseMediaPlaylist } from "./hls.js";

const TS_MIME_TYPE = "video/mp2t";
const downloadJobs = new Map();

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

async function buildTransportStream(segmentUrls, job, report) {
  const chunks = [];
  const total = segmentUrls.length;
  let lastReportedPercent = -1;

  report({ phase: "Downloading", downloaded: 0, total, percent: 0 });

  for (let i = 0; i < segmentUrls.length; i++) {
    if (job.abortController.signal.aborted) {
      throw new DOMException("Download canceled.", "AbortError");
    }
    chunks.push(await fetchSegment(segmentUrls[i], job.abortController.signal));
    const downloaded = i + 1;
    const percent = Math.round((downloaded / total) * 100);
    if (percent !== lastReportedPercent) {
      lastReportedPercent = percent;
      report({ phase: "Downloading", downloaded, total, percent });
    }
  }

  if (!chunks.length) {
    throw new Error("No media data was downloaded.");
  }

  return new Blob(chunks, { type: TS_MIME_TYPE });
}

// onProgress(progress) receives { jobId, tabId, phase, downloaded?, total?, percent }.
// saveFile(url, title, extension) must start a browser download and resolve once it has.
export async function runHlsDownload({ url, title, tabId, jobId, onProgress, saveFile }) {
  const job = { id: jobId, abortController: new AbortController() };
  downloadJobs.set(jobId, job);
  const report = (progress) => {
    if (tabId) onProgress({ jobId, tabId, ...progress });
  };

  try {
    report({ phase: "Reading playlist", percent: 0 });
    const segmentUrls = await getSegmentUrls(url, job.abortController.signal);
    const tsBlob = await buildTransportStream(segmentUrls, job, report);

    const objectUrl = URL.createObjectURL(tsBlob);
    try {
      report({ phase: "Saving", percent: 100 });
      await saveFile(objectUrl, title, "ts");
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }

    report({ phase: "Complete", percent: 100 });
    return { ok: true, type: "ts" };
  } catch (error) {
    if (job.abortController.signal.aborted || (error && error.name === "AbortError")) {
      report({ phase: "Canceled", percent: 0 });
      return { ok: false, canceled: true };
    }
    console.error("SwiftSkip video download failed, falling back to m3u8:", error);
    await saveFile(url, title, "m3u8");
    return {
      ok: false,
      fallback: "m3u8",
      error: error && error.message ? error.message : String(error),
    };
  } finally {
    downloadJobs.delete(jobId);
  }
}

export function cancelHlsDownload(jobId) {
  const job = downloadJobs.get(jobId);
  if (job) job.abortController.abort();
  return { ok: true, canceled: Boolean(job) };
}
