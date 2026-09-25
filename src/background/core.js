// SwiftSkip background — shared by every browser build.
// Tracks the lecture download state per tab and answers messages from the
// content script and popup. Where the download itself runs differs per
// browser, so the entry file (firefox.js / chrome.js / safari.js) passes in
// `runDownload` and `cancelDownload`.

import { sanitizeFilename } from "../shared/filename.js";

export const ext = globalThis.browser ?? globalThis.chrome;

// ─── Download state (one per tab) ─────────────────────────────────────────────

const tabStates = new Map();

function createState(tabId) {
  return {
    tabId,
    available: false,
    active: false,
    jobId: null,
    url: null,
    title: null,
    phase: "No lecture detected",
    downloaded: 0,
    total: 0,
    percent: 0,
    speed: 0,
    eta: null,
    type: null,
    error: null,
  };
}

function getState(tabId) {
  if (!tabStates.has(tabId)) tabStates.set(tabId, createState(tabId));
  return tabStates.get(tabId);
}

const FINISHED_PHASES = ["Complete", "Canceled", "Download failed"];

function publishDownloadState(state) {
  if (state.tabId && (state.active || FINISHED_PHASES.includes(state.phase))) {
    ext.tabs.sendMessage(state.tabId, {
      action: "lectureDownloadProgress",
      ...state,
    }).catch(() => {
      /* Tab may have navigated away. */
    });
  }

  ext.runtime.sendMessage({
    action: "lectureDownloadStateChanged",
    state: { ...state },
  }).catch(() => {
    /* No popup listening. */
  });
}

function setDownloadState(tabId, patch) {
  const state = Object.assign(getState(tabId), patch);
  publishDownloadState(state);
  return { ...state };
}

export function reportProgress(progress) {
  if (!progress.tabId) return;
  const state = getState(progress.tabId);
  if (progress.jobId && state.jobId && progress.jobId !== state.jobId) return;

  const numberOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  setDownloadState(progress.tabId, {
    phase: progress.phase || state.phase,
    downloaded: numberOr(progress.downloaded, state.downloaded),
    total: numberOr(progress.total, state.total),
    percent: numberOr(progress.percent, state.percent),
    speed: numberOr(progress.speed, 0),
    eta: numberOr(progress.eta, null),
    active: !["Complete", "Canceled"].includes(progress.phase),
  });
}

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

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

// ─── Main download orchestrator ───────────────────────────────────────────────

async function startLectureDownload({ tabId, url, title, jobId }, runDownload) {
  const state = getState(tabId);
  if (state.active) {
    return { ...state };
  }

  const resolvedUrl = url || state.url;
  if (!resolvedUrl) {
    return setDownloadState(tabId, {
      available: false,
      phase: "No lecture detected",
      error: "No lecture stream has been detected yet.",
    });
  }

  const resolvedTitle = sanitizeFilename(title || state.title);
  const resolvedJobId = jobId || createJobId();

  setDownloadState(tabId, {
    ...createState(tabId),
    available: true,
    active: true,
    jobId: resolvedJobId,
    url: resolvedUrl,
    title: resolvedTitle,
    phase: "Preparing",
  });

  let response;
  try {
    response = await runDownload({
      url: resolvedUrl,
      title: resolvedTitle,
      tabId,
      jobId: resolvedJobId,
    });
  } catch (error) {
    response = { ok: false, error: errorMessage(error) };
  }

  if (response && response.canceled) {
    return setDownloadState(tabId, { active: false, phase: "Canceled", percent: 0, error: null });
  }

  if (!response || response.ok === false) {
    const error = (response && response.error) || "Download failed.";
    console.error("SwiftSkip download failed:", error);
    return setDownloadState(tabId, { active: false, phase: "Download failed", error });
  }

  return setDownloadState(tabId, {
    active: false,
    phase: "Complete",
    percent: 100,
    type: response.type,
    error: null,
  });
}

// ─── Message handler ──────────────────────────────────────────────────────────

// extraHandlers: { [action]: (msg, sender) => response | Promise<response> }
export function startBackground({ runDownload, cancelDownload, extraHandlers = {} }) {
  // Messages from content scripts carry their tab; the popup passes `tabId`.
  const tabOf = (msg, sender) => (sender.tab && sender.tab.id) || msg.tabId;

  const handlers = {
    registerLectureDownloadUrl(msg, sender) {
      const tabId = tabOf(msg, sender);
      const state = getState(tabId);
      return {
        ok: true,
        state: setDownloadState(tabId, {
          available: true,
          url: msg.url,
          title: sanitizeFilename(msg.title),
          phase: state.active ? state.phase : "Ready",
          error: state.active ? state.error : null,
        }),
      };
    },

    getLectureDownloadState(msg, sender) {
      return { ok: true, state: { ...getState(tabOf(msg, sender)) } };
    },

    relayLectureDownloadProgress(msg) {
      reportProgress(msg);
    },

    async cancelLectureDownload(msg, sender) {
      const tabId = tabOf(msg, sender);
      const response = await cancelDownload(msg.jobId || getState(tabId).jobId);
      setDownloadState(tabId, { active: false, phase: "Canceled", percent: 0, error: null });
      return response || { ok: true };
    },

    async startLectureDownload(msg, sender) {
      const state = await startLectureDownload(
        { tabId: tabOf(msg, sender), url: msg.url, title: msg.title, jobId: msg.jobId },
        runDownload,
      );
      return { ok: !state.error, state };
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

  ext.tabs.onRemoved.addListener((tabId) => {
    const state = tabStates.get(tabId);
    if (state && state.active && state.jobId) {
      Promise.resolve(cancelDownload(state.jobId)).catch(() => {});
    }
    tabStates.delete(tabId);
  });

  // Dev builds (npm run dev:*): open the local test page ourselves once loaded,
  // so it always has the content script; after a rebuild, reload it instead.
  if (__DEV__) {
    ext.runtime.onInstalled.addListener(async () => {
      const tabs = await ext.tabs.query({ url: ["http://localhost/*", "http://127.0.0.1/*"] });
      if (tabs.length) {
        for (const tab of tabs) ext.tabs.reload(tab.id);
      } else {
        ext.tabs.create({ url: __DEV_TEST_URL__ });
      }
    });
  }
}
