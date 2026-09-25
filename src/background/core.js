// SwiftSkip background — shared by every browser build.
// Tracks the lecture download state and answers messages from the content
// script and popup. Where the download itself runs differs per browser, so the
// entry file (firefox.js / chrome.js / safari.js) passes in `runDownload` and
// `cancelDownload`.

import { sanitizeFilename } from "../shared/filename.js";

export const ext = globalThis.browser ?? globalThis.chrome;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function downloadFile({ url, filename, saveAs = false }) {
  return ext.downloads.download({ url, filename, saveAs });
}

export function saveFile(url, title, extension) {
  return downloadFile({
    url,
    filename: `${sanitizeFilename(title)}.${extension}`,
    saveAs: false,
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
    ext.tabs.sendMessage(state.tabId, {
      action: "lectureDownloadProgress",
      ...state,
    }).catch(() => {
      /* Tab may have navigated away. */
    });
  }

  ext.runtime.sendMessage({
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

export function reportProgress(progress) {
  setDownloadState({
    jobId: progress.jobId || lectureDownloadState.jobId,
    tabId: progress.tabId || lectureDownloadState.tabId,
    phase: progress.phase || lectureDownloadState.phase,
    downloaded: Number.isFinite(progress.downloaded) ? progress.downloaded : lectureDownloadState.downloaded,
    total: Number.isFinite(progress.total) ? progress.total : lectureDownloadState.total,
    percent: Number.isFinite(progress.percent) ? progress.percent : lectureDownloadState.percent,
    active: !["Complete", "Canceled"].includes(progress.phase),
  });
}

// ─── Main download orchestrator ───────────────────────────────────────────────

async function startLectureDownload({ url, title, tabId, jobId }, runDownload) {
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

  const response = await runDownload({
    url: resolvedUrl,
    title: resolvedTitle,
    tabId: resolvedTabId,
    jobId: resolvedJobId,
  });

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

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

// extraHandlers: { [action]: (msg, sender) => response | Promise<response> }
export function startBackground({ runDownload, cancelDownload, extraHandlers = {} }) {
  const handlers = {
    registerLectureDownloadUrl(msg, sender) {
      setDownloadState({
        available: true,
        url: msg.url,
        title: sanitizeFilename(msg.title),
        tabId: sender.tab && sender.tab.id,
        phase: lectureDownloadState.active ? lectureDownloadState.phase : "Ready",
        error: null,
      });
      return { ok: true, state: getPublicDownloadState() };
    },

    getLectureDownloadState() {
      return { ok: true, state: getPublicDownloadState() };
    },

    relayLectureDownloadProgress(msg) {
      reportProgress(msg);
    },

    async cancelLectureDownload(msg) {
      const response = await cancelDownload(msg.jobId || lectureDownloadState.jobId);
      setDownloadState({ active: false, phase: "Canceled", percent: 0, error: null });
      return response || { ok: true };
    },

    startLectureDownload(msg, sender) {
      return startLectureDownload(
        {
          url: msg.url,
          title: msg.title,
          tabId: (sender.tab && sender.tab.id) || msg.tabId,
          jobId: msg.jobId,
        },
        runDownload,
      )
        .then((state) => ({ ok: !state.error, state }))
        .catch((error) => {
          const message = errorMessage(error);
          console.error("SwiftSkip download failed:", message);
          const state = setDownloadState({
            active: false,
            phase: "Download failed",
            error: message,
            fallback: "m3u8",
          });
          // Best-effort fallback: save the raw playlist
          saveFile(msg.url || lectureDownloadState.url, msg.title || lectureDownloadState.title, "m3u8")
            .catch((e) => console.error("SwiftSkip fallback download failed:", e));
          return { ok: false, error: message, state };
        });
    },

    downloadLecture(msg, sender) {
      return startLectureDownload(
        {
          url: msg.url,
          title: msg.title,
          tabId: sender.tab && sender.tab.id,
          jobId: msg.jobId,
        },
        runDownload,
      )
        .then((state) => ({
          ok: !state.error,
          fallback: state.fallback,
          canceled: state.phase === "Canceled",
          state,
        }))
        .catch((error) => {
          const message = errorMessage(error);
          console.error("SwiftSkip download failed:", message);
          return { ok: false, error: message };
        });
    },

    ...extraHandlers,
  };

  // sendResponse + `return true` is the one async-reply style that works in
  // Chrome, Firefox and Safari alike.
  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handler = msg && msg.action && handlers[msg.action];
    if (!handler) return false;

    let result;
    try {
      result = handler(msg, sender);
    } catch (error) {
      sendResponse({ ok: false, error: errorMessage(error) });
      return false;
    }

    if (result && typeof result.then === "function") {
      result.then(sendResponse, (error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }
    if (result !== undefined) sendResponse(result);
    return false;
  });
}
