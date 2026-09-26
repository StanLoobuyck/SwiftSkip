// Downloads an HLS lecture and saves it as one .mp4 (or .ts if converting fails).
// Runs where blob URLs are available: the Firefox background page, or the
// Chrome offscreen document (Chrome's service worker can't create blob URLs).
//
// Memory: every segment is turned into a Blob as soon as it arrives, so the
// browser can keep it outside the JS heap (and on disk for large amounts).

// Only the TS→MP4 transmuxer, not all of mux.js (FLV, inspectors, …).
import { Transmuxer } from "mux.js/cjs/mp4/transmuxer.js";
import { chooseBestVariant, parseMediaPlaylist } from "./hls.js";
import { CodedError, describeError } from "./errors.js";

const downloadJobs = new Map();

const DEFAULTS = {
  concurrency: 4, // segments fetched at the same time
  retries: 3, // extra attempts per request
  retryDelay: 500, // ms, doubled after every failed attempt
};

function abortError() {
  return new DOMException("Download canceled.", "AbortError");
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

// what: { code, params, label } — e.g. errFetchSegment { n: 3, total: 80 }.
async function fetchWithRetry(url, what, signal, { retries, retryDelay }) {
  // Cookies are sent where SwiftSkip has host access (Toledo, Kaltura). On
  // other CDNs a cookie request is blocked by CORS, while Kaltura's signed
  // URLs work fine without — so on a network error, try once without cookies.
  let credentials = "include";
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { credentials, signal });
      if (!response.ok) {
        throw new CodedError(
          what.code,
          { ...what.params, status: response.status },
          `Could not fetch ${what.label} (HTTP ${response.status}).`,
        );
      }
      return response;
    } catch (error) {
      if (signal.aborted || error.name === "AbortError") throw abortError();
      if (error instanceof TypeError && credentials === "include") {
        credentials = "omit";
        attempt--; // doesn't count as a retry
        continue;
      }
      if (attempt >= retries) throw error;
      await sleep(retryDelay * 2 ** attempt, signal);
    }
  }
}

async function getSegmentUrls(manifestUrl, signal, opts) {
  const playlist = { code: "errFetchPlaylist", params: {}, label: "playlist" };
  const manifestText = await (await fetchWithRetry(manifestUrl, playlist, signal, opts)).text();
  const variant = chooseBestVariant(manifestText, manifestUrl);
  if (!variant) {
    return parseMediaPlaylist(manifestText, manifestUrl);
  }
  const mediaText = await (await fetchWithRetry(variant.url, playlist, signal, opts)).text();
  return parseMediaPlaylist(mediaText, variant.url);
}

// Fetches all segments, `concurrency` at a time, keeping them in playlist order.
async function downloadSegments(segmentUrls, signal, opts, report) {
  const total = segmentUrls.length;
  const blobs = new Array(total);
  const started = Date.now();
  let next = 0;
  let done = 0;
  let bytes = 0;
  let failure = null;

  report({ phase: "Downloading", downloaded: 0, total, percent: 0 });

  async function worker() {
    while (next < total && !failure) {
      const index = next++;
      try {
        const segment = {
          code: "errFetchSegment",
          params: { n: index + 1, total },
          label: `segment ${index + 1}/${total}`,
        };
        const response = await fetchWithRetry(segmentUrls[index], segment, signal, opts);
        const data = await response.arrayBuffer();
        blobs[index] = new Blob([data]);
        bytes += data.byteLength;
      } catch (error) {
        failure = failure || error;
        return;
      }
      done++;
      const seconds = (Date.now() - started) / 1000;
      const speed = seconds > 0 ? bytes / seconds : 0;
      report({
        phase: "Downloading",
        downloaded: done,
        total,
        percent: Math.round((done / total) * 100),
        speed,
        // Remaining segments × average segment size ÷ speed.
        eta: speed > 0 ? ((total - done) * (bytes / done)) / speed : null,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(opts.concurrency, total) }, worker));
  if (failure) throw failure;
  return blobs;
}

// Remuxes MPEG-TS segments into one fragmented MP4, one segment at a time.
export async function remuxToMp4(tsBlobs, signal, report = () => {}) {
  const transmuxer = new Transmuxer();
  const parts = [];
  let hasInit = false;

  transmuxer.on("data", (segment) => {
    if (!hasInit) {
      parts.push(new Blob([segment.initSegment]));
      hasInit = true;
    }
    parts.push(new Blob([segment.data]));
  });

  for (let i = 0; i < tsBlobs.length; i++) {
    if (signal.aborted) throw abortError();
    transmuxer.push(new Uint8Array(await tsBlobs[i].arrayBuffer()));
    transmuxer.flush();
    report({ phase: "Converting to MP4", percent: Math.round(((i + 1) / tsBlobs.length) * 100) });
  }

  if (!hasInit) {
    throw new Error("No audio/video found to convert.");
  }
  return new Blob(parts, { type: "video/mp4" });
}

// onProgress(progress) receives { jobId, tabId, phase, percent, downloaded?, total?, speed?, eta? }.
// saveFile(url, title, extension) must start a browser download and resolve (to its id) once it has.
// Resolves to { ok: true, type, downloadId } | { ok: false, canceled: true }
//           | { ok: false, error, errorCode, errorParams } (see shared/errors.js).
export async function runHlsDownload({ url, title, tabId, jobId, onProgress, saveFile, ...options }) {
  const opts = { ...DEFAULTS, ...options };
  const job = { id: jobId, abortController: new AbortController() };
  const { signal } = job.abortController;
  downloadJobs.set(jobId, job);
  const report = (progress) => {
    if (tabId) onProgress({ jobId, tabId, ...progress });
  };

  try {
    report({ phase: "Reading playlist", percent: 0 });
    const segmentUrls = await getSegmentUrls(url, signal, opts);
    const tsBlobs = await downloadSegments(segmentUrls, signal, opts, report);

    let file;
    let type = "mp4";
    try {
      file = await remuxToMp4(tsBlobs, signal, report);
    } catch (error) {
      if (signal.aborted) throw abortError();
      // Still a usable video (VLC plays it) — better than nothing.
      console.warn("SwiftSkip: MP4 conversion failed, saving .ts instead:", error);
      file = new Blob(tsBlobs, { type: "video/mp2t" });
      type = "ts";
    }

    const objectUrl = URL.createObjectURL(file);
    let downloadId;
    try {
      report({ phase: "Saving", percent: 100 });
      downloadId = await saveFile(objectUrl, title, type);
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }

    report({ phase: "Complete", percent: 100 });
    return { ok: true, type, downloadId };
  } catch (error) {
    if (signal.aborted || (error && error.name === "AbortError")) {
      report({ phase: "Canceled", percent: 0 });
      return { ok: false, canceled: true };
    }
    console.error("SwiftSkip download failed:", error);
    return { ok: false, ...describeError(error) };
  } finally {
    downloadJobs.delete(jobId);
  }
}

export function cancelHlsDownload(jobId) {
  const job = downloadJobs.get(jobId);
  if (job) job.abortController.abort();
  return { ok: true, canceled: Boolean(job) };
}
