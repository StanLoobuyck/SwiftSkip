// SwiftSkip background — shared by every browser build.
// Tracks the lecture download state per tab and answers messages from the
// content script and popup. Where the download itself runs differs per
// browser, so the entry file (firefox.js / chrome.js / safari.js) passes in
// `runDownload` and `cancelDownload`.

import { buildLectureTitle, sanitizeFilename } from "../shared/filename.js";
import { ext } from "../shared/ext.js";
import { describeError } from "../shared/errors.js";
import { startSiteManagement } from "./sites.js";

export { ext };

// ─── Download state (one per tab) ─────────────────────────────────────────────

const tabStates = new Map();

// Chrome stops the MV3 service worker after ~30 s without events, taking this
// Map with it, while the content script reports the lecture only once. So each
// tab's state is also kept in storage.session (cleared when the browser
// closes) and read back when the worker starts again.
const SESSION_PREFIX = "tab:";

const restored = (async () => {
  try {
    const stored = await ext.storage.session.get(null);
    for (const [key, state] of Object.entries(stored)) {
      if (key.startsWith(SESSION_PREFIX) && !tabStates.has(state.tabId)) tabStates.set(state.tabId, state);
    }
  } catch {
    // No storage.session (older browsers): state only lives in memory.
  }
})();

function persistState(state) {
  ext.storage.session?.set({ [SESSION_PREFIX + state.tabId]: state }).catch(() => {});
}

function forgetState(tabId) {
  ext.storage.session?.remove(SESSION_PREFIX + tabId).catch(() => {});
}

function createState(tabId) {
  return {
    tabId,
    available: false,
    active: false,
    jobId: null,
    url: null,
    title: null, // Kaltura's name for the recording
    context: {}, // { course, lecture } from the Toledo page around the player
    phase: "No lecture detected",
    downloaded: 0,
    total: 0,
    percent: 0,
    speed: 0,
    eta: null,
    type: null,
    downloadId: null,
    error: null, // English, for logs; the UI shows errorCode/errorParams translated
    errorCode: null,
    errorParams: null,
  };
}

function getState(tabId) {
  if (!tabStates.has(tabId)) tabStates.set(tabId, createState(tabId));
  return tabStates.get(tabId);
}

const FINISHED_PHASES = ["Complete", "Canceled", "Download failed"];

function publishDownloadState(state) {
  if (state.tabId && (state.active || FINISHED_PHASES.includes(state.phase))) {
    ext.tabs
      .sendMessage(state.tabId, {
        action: "lectureDownloadProgress",
        ...state,
      })
      .catch(() => {
        /* Tab may have navigated away. */
      });
  }

  ext.runtime
    .sendMessage({
      action: "lectureDownloadStateChanged",
      state: { ...state },
    })
    .catch(() => {
      /* No popup listening. */
    });
}

function setDownloadState(tabId, patch, { persist = true } = {}) {
  const state = Object.assign(getState(tabId), patch);
  if (persist) persistState(state);
  publishDownloadState(state);
  return { ...state };
}

export function reportProgress(progress) {
  if (!progress.tabId) return;
  const state = getState(progress.tabId);
  if (progress.jobId && state.jobId && progress.jobId !== state.jobId) return;

  const numberOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  const phase = progress.phase || state.phase;
  setDownloadState(
    progress.tabId,
    {
      phase,
      downloaded: numberOr(progress.downloaded, state.downloaded),
      total: numberOr(progress.total, state.total),
      percent: numberOr(progress.percent, state.percent),
      speed: numberOr(progress.speed, 0),
      eta: numberOr(progress.eta, null),
      active: !["Complete", "Canceled"].includes(progress.phase),
    },
    // Progress arrives several times a second; storing every step isn't needed.
    { persist: phase !== state.phase },
  );
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
      errorCode: "errNoStream",
      errorParams: {},
    });
  }

  const resolvedTitle = sanitizeFilename(
    buildLectureTitle({ ...state.context, recording: title || state.title }),
  );
  const resolvedJobId = jobId || createJobId();

  setDownloadState(tabId, {
    ...createState(tabId),
    context: state.context,
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
    response = { ok: false, ...describeError(error) };
  }

  if (response && response.canceled) {
    return setDownloadState(tabId, {
      active: false,
      phase: "Canceled",
      percent: 0,
      error: null,
      errorCode: null,
    });
  }

  if (!response || response.ok === false) {
    const error = (response && response.error) || "Download failed.";
    console.error("SwiftSkip download failed:", error);
    return setDownloadState(tabId, {
      active: false,
      phase: "Download failed",
      error,
      errorCode: (response && response.errorCode) || (response && response.error ? null : "errUnknown"),
      errorParams: (response && response.errorParams) || {},
    });
  }

  return setDownloadState(tabId, {
    active: false,
    phase: "Complete",
    percent: 100,
    type: response.type,
    downloadId: response.downloadId ?? null,
    error: null,
    errorCode: null,
  });
}

// ─── Message handler ──────────────────────────────────────────────────────────

// extraHandlers: { [action]: (msg, sender) => response | Promise<response> }
export function startBackground({ runDownload, cancelDownload, extraHandlers = {} }) {
  // The popup (and the offscreen document) pass `tabId`; content scripts
  // don't, and are identified by the tab they run in.
  const tabOf = (msg, sender) => msg.tabId ?? (sender.tab && sender.tab.id);

  const handlers = {
    registerLectureDownloadUrl(msg, sender) {
      const tabId = tabOf(msg, sender);
      const state = getState(tabId);
      return {
        ok: true,
        state: setDownloadState(tabId, {
          available: true,
          url: msg.url,
          title: msg.title || null,
          phase: state.active ? state.phase : "Ready",
          error: state.active ? state.error : null,
        }),
      };
    },

    // From the top-level Toledo page: which course/lecture this tab shows.
    registerLectureContext(msg, sender) {
      const tabId = tabOf(msg, sender);
      const state = getState(tabId);
      state.context = { course: msg.course || null, lecture: msg.lecture || null };
      persistState(state);
      return { ok: true };
    },

    // "Show in folder" for the tab's finished download.
    async showDownload(msg, sender) {
      const { downloadId } = getState(tabOf(msg, sender));
      if (downloadId == null) return { ok: false };
      await ext.downloads.show(downloadId);
      return { ok: true };
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
  // Chrome, Firefox and Safari alike. Every handler waits for the stored tab
  // states, so a worker that just woke up doesn't answer from an empty Map.
  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handler = msg && msg.action && handlers[msg.action];
    if (!handler) return false;

    restored
      .then(() => handler(msg, sender))
      .then(sendResponse, (error) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  });

  ext.tabs.onRemoved.addListener(async (tabId) => {
    await restored;
    const state = tabStates.get(tabId);
    if (state && state.active && state.jobId) {
      Promise.resolve(cancelDownload(state.jobId)).catch(() => {});
    }
    tabStates.delete(tabId);
    forgetState(tabId);
  });

  startSiteManagement();
  if (__DEV_RELOAD__) devReloadTestPages();

  // First install: a short welcome (not for dev builds, which "install" on
  // every npm run dev:*).
  ext.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install" && !__DEV__) ext.tabs.create({ url: ext.runtime.getURL("welcome.html") });
  });
}

// Dev builds (npm run dev:*): after a rebuild, reload open test pages so they
// get the new content script (the old one is cut off when the extension
// reloads). Once per extension load: storage.session is cleared on every
// (re)load but survives Chrome's service worker going idle and waking up.
// A test page opened before SwiftSkip was ready refreshes itself (see
// test/fixtures/index.html), so this doesn't have to catch that case.
async function devReloadTestPages() {
  try {
    const { devTestPageShown } = await ext.storage.session.get("devTestPageShown");
    if (devTestPageShown) return;
    await ext.storage.session.set({ devTestPageShown: true });
  } catch {
    // No storage.session: fine for Firefox's MV2 background page, which only
    // starts once per extension load anyway.
  }

  const tabs = await ext.tabs.query({ url: ["http://localhost/*", "http://127.0.0.1/*"] });
  for (const tab of tabs) ext.tabs.reload(tab.id);
}
