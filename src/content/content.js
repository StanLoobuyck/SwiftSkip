// SwiftSkip content script — runs in every frame of Toledo pages.
// Keyboard shortcuts, the on-screen overlay, resume/speed memory, and the
// lecture download button. Shortcuts are configurable (see shared/shortcuts.js).

import { DEFAULT_SETTINGS } from "../shared/settings.js";
import { SUPPORTS_DOWNLOAD } from "../shared/features.js";
import {
  clearResumePosition,
  getResumePosition,
  loadSettings,
  pruneResumePositions,
  setResumePosition,
  watchSettings,
} from "../shared/storage.js";
import { NO_REPEAT, buildShortcutMap, findAction } from "../shared/shortcuts.js";
import { isLectureManifestUrl } from "../shared/hls.js";
import { formatProgressMeta } from "../shared/format.js";
import {
  MAX_SPEED,
  accumulateSkip,
  computeSkip,
  formatSkipTotal,
  formatSpeed,
  formatTime,
  isResumable,
  nextSpeed,
  resumeKey,
} from "../shared/playback.js";
import { parseCourseTitle } from "../shared/filename.js";
import {
  closeShortcutSheet,
  isShortcutSheetOpen,
  openShortcutSheet,
  placeSheetIfOpen,
  placeToastIfOpen,
  showToast,
} from "./overlays.js";

(function () {
  // ─── domain check ──────────────────────────────────────────────────────────
  function isKULEnvironment() {
    // Dev builds also run on the local test page (npm run dev:*).
    if (__DEV__ && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      return true;
    }

    const isLocal =
      window.location.hostname.includes("kuleuven.cloud") ||
      window.location.hostname.includes("kuleuven.be");
    if (isLocal) return true;

    try {
      if (
        window.top &&
        (window.top.location.hostname.includes("kuleuven.cloud") ||
          window.top.location.hostname.includes("kuleuven.be"))
      ) {
        return true;
      }
    } catch (e) {
      /* ignore cross-origin error */
    }

    if (window.location.ancestorOrigins) {
      for (let i = 0; i < window.location.ancestorOrigins.length; i++) {
        if (
          window.location.ancestorOrigins[i].includes("kuleuven.cloud") ||
          window.location.ancestorOrigins[i].includes("kuleuven.be")
        ) {
          return true;
        }
      }
    }

    if (
      document.referrer &&
      (document.referrer.includes("kuleuven.cloud") ||
        document.referrer.includes("kuleuven.be"))
    ) {
      return true;
    }

    return false;
  }

  if (!isKULEnvironment()) {
    return;
  }

  if (window.__swiftSkipLoaded) return;
  window.__swiftSkipLoaded = true;
  // Lets the local test page see that the dev build is active.
  if (__DEV__) document.documentElement.dataset.swiftskipDev = "loaded";

  // ─── Settings ──────────────────────────────────────────────────────────────
  // Changes made anywhere (popup, settings page, other tabs) apply immediately.
  let settings = DEFAULT_SETTINGS;
  let shortcutMap = buildShortcutMap(settings.shortcuts);

  function applySettings(next) {
    settings = next;
    shortcutMap = buildShortcutMap(settings.shortcuts);
    if (!settings.enabled) closeShortcutSheet();
  }
  loadSettings().then(applySettings, () => {});
  watchSettings(applySettings);

  // ─── State ─────────────────────────────────────────────────────────────────
  let skipAccumulator = 0;
  let osdTimeout = null;
  let osdFadeTimeout = null;
  let osdEl = null,
    iconEl = null,
    labelEl = null,
    barWrapEl = null,
    barFillEl = null;
  let currentOsdType = null;
  let detectedLectureUrl = null;
  let downloadWrapEl = null;
  let downloadButtonEl = null;
  let downloadDismissButtonEl = null;
  let downloadProgressEl = null;
  let downloadProgressFillEl = null;
  let downloadProgressLabelEl = null;
  let downloadProgressMetaEl = null;
  let downloadResetTimer = null;
  let activeDownloadJobId = null;
  let isLectureDownloading = false;
  let downloadDismissed = false;
  let hlsPerformanceObserver = null;
  let hlsMutationObserver = null;
  let hlsVideoPoll = null;
  let hlsDebounceTimer = null;

  // ─── Video finder (walks Shadow DOM) ───────────────────────────────────────
  function findVideos(root = document) {
    const vids = [...root.querySelectorAll("video")];
    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) vids.push(...findVideos(el.shadowRoot));
    });
    return vids;
  }

  function getVideo() {
    const vids = findVideos();
    if (!vids.length) return null;
    return (
      vids.find((v) => !v.paused && !v.ended && v.readyState > 2) ||
      vids.sort(
        (a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight,
      )[0]
    );
  }

  function stopHlsDetection() {
    if (hlsPerformanceObserver) {
      hlsPerformanceObserver.disconnect();
      hlsPerformanceObserver = null;
    }
    if (hlsMutationObserver) {
      hlsMutationObserver.disconnect();
      hlsMutationObserver = null;
    }
    if (hlsVideoPoll) {
      clearInterval(hlsVideoPoll);
      hlsVideoPoll = null;
    }
    if (hlsDebounceTimer) {
      clearTimeout(hlsDebounceTimer);
      hlsDebounceTimer = null;
    }
  }

  function getPageTitle() {
    try {
      if (window.top && window.top !== window && window.top.document.title) {
        return window.top.document.title;
      }
    } catch (e) {
      /* cross-origin top frame — stick with document.title */
    }
    return document.title;
  }

  function rememberLectureUrl(url) {
    if (!isLectureManifestUrl(url)) return false;

    detectedLectureUrl = url;
    downloadDismissed = false;
    injectDownloadButton();

    chrome.runtime.sendMessage({
      action: "registerLectureDownloadUrl",
      url: detectedLectureUrl,
      title: getPageTitle(),
    });
    stopHlsDetection();
    return true;
  }

  function scanPerformanceEntries(entries) {
    for (const entry of entries) {
      if (rememberLectureUrl(entry.name)) return true;
    }
    return false;
  }

  function scanVideoSources() {
    const videos = findVideos();

    for (const video of videos) {
      const candidates = [
        video.currentSrc,
        video.src,
        ...[...video.querySelectorAll("source")].map((source) => source.src),
      ];

      for (const candidate of candidates) {
        if (rememberLectureUrl(candidate)) return true;
      }
    }

    return false;
  }

  function startHlsDetection() {
    scanPerformanceEntries(performance.getEntriesByType("resource"));
    if (detectedLectureUrl) return;

    try {
      hlsPerformanceObserver = new PerformanceObserver((list) => {
        scanPerformanceEntries(list.getEntries());
      });
      hlsPerformanceObserver.observe({ entryTypes: ["resource"] });
    } catch (e) {
      /* PerformanceObserver can be unavailable in restricted frames. */
    }

    hlsVideoPoll = setInterval(scanVideoSources, 1000);
    hlsMutationObserver = new MutationObserver(() => {
      clearTimeout(hlsDebounceTimer);
      hlsDebounceTimer = setTimeout(scanVideoSources, 500);
    });
    hlsMutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    scanVideoSources();
  }

  function createDownloadJobId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `swiftskip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getDownloadParent() {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs && fs.tagName !== "VIDEO") return fs;

    const video = getVideo();
    return video ? getPlayerContainer(video) : document.body;
  }

  // ─── Positioning over the player ──────────────────────────────────────────
  // On Toledo the player is an iframe, so "the viewport" is the player and the
  // CSS defaults (fixed, relative to the viewport) line up with it. When the
  // player is just part of a bigger page, pin our UI to the player's box.
  function getPlayerRect() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return null;
    const video = getVideo();
    if (!video) return null;
    const rect = getPlayerContainer(video).getBoundingClientRect();
    if (rect.width < 100 || rect.height < 60) return null;
    return rect;
  }

  function positionOverPlayer(el, placement) {
    const rect = getPlayerRect();
    if (!rect) {
      el.style.left = "";
      el.style.top = "";
      return;
    }
    if (placement === "center") {
      el.style.left = `${rect.left + rect.width / 2}px`;
      el.style.top = `${rect.top + rect.height / 2}px`;
    } else if (placement === "bottom") {
      // Above the player's own control bar.
      el.style.left = `${rect.left + rect.width / 2}px`;
      el.style.top = `${rect.bottom - 72}px`;
    } else {
      el.style.left = `${rect.left + 18}px`;
      el.style.top = `${rect.top + 18}px`;
    }
  }

  let positionFrame = null;
  function schedulePositionUpdate() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = null;
      if (downloadWrapEl && downloadWrapEl.isConnected) positionOverPlayer(downloadWrapEl, "top-left");
      if (osdEl && osdEl.isConnected && osdEl.style.display !== "none") positionOverPlayer(osdEl, "center");
      placeSheetIfOpen((el) => positionOverPlayer(el, "center"));
      placeToastIfOpen((el) => positionOverPlayer(el, "bottom"));
    });
  }
  window.addEventListener("scroll", schedulePositionUpdate, { capture: true, passive: true });
  window.addEventListener("resize", schedulePositionUpdate, { passive: true });
  // The player often changes size after we first place things (video loads).
  const playerResizeObserver = new ResizeObserver(schedulePositionUpdate);
  let observedPlayer = null;

  function placeDownloadControl() {
    if (!downloadWrapEl || downloadDismissed) return;

    const parent = getDownloadParent();
    if (parent && downloadWrapEl.parentElement !== parent) {
      parent.appendChild(downloadWrapEl);
    }

    const video = getVideo();
    const player = video && getPlayerContainer(video);
    if (player && player !== observedPlayer) {
      if (observedPlayer) playerResizeObserver.unobserve(observedPlayer);
      playerResizeObserver.observe(player);
      observedPlayer = player;
    }
    positionOverPlayer(downloadWrapEl, "top-left");
  }

  function setDownloadProgress(progress) {
    if (
      progress.jobId &&
      activeDownloadJobId &&
      progress.jobId !== activeDownloadJobId
    ) {
      return;
    }
    if (!downloadProgressEl || !downloadProgressFillEl) return;

    if (progress.jobId && !activeDownloadJobId) {
      activeDownloadJobId = progress.jobId;
    }
    isLectureDownloading = progress.active !== false;
    clearTimeout(downloadResetTimer);
    placeDownloadControl();

    const percent = Math.max(
      0,
      Math.min(100, Math.round(Number(progress.percent) || 0)),
    );
    const phase = progress.phase || "Downloading";
    const failed = phase === "Download failed";

    downloadProgressEl.hidden = false;
    downloadProgressEl.classList.toggle("swiftskip-download-failed", failed);
    downloadProgressFillEl.style.width = `${failed ? 100 : percent}%`;
    downloadProgressLabelEl.textContent = phase;
    downloadProgressMetaEl.textContent = formatProgressMeta(progress);
    downloadProgressEl.title = progress.error || "";

    if (downloadButtonEl) {
      downloadButtonEl.disabled = isLectureDownloading;
      downloadButtonEl.textContent =
        percent > 0 && isLectureDownloading ? `Downloading ${percent}%` : phase;
    }
    if (downloadDismissButtonEl) {
      const label = isLectureDownloading ? "Cancel download" : "Hide download button";
      downloadDismissButtonEl.title = label;
      downloadDismissButtonEl.setAttribute("aria-label", label);
    }

    if (progress.active === false && ["Complete", "Canceled", "Download failed"].includes(phase)) {
      // Errors stay up longer so there's time to read them.
      downloadResetTimer = setTimeout(resetDownloadProgress, failed ? 8000 : 1800);
    }
  }

  function resetDownloadProgress() {
    clearTimeout(downloadResetTimer);
    if (!downloadProgressEl || !downloadProgressFillEl) return;

    downloadProgressEl.hidden = true;
    downloadProgressEl.classList.remove("swiftskip-download-failed");
    downloadProgressEl.title = "";
    downloadProgressFillEl.style.width = "0%";
    downloadProgressLabelEl.textContent = "Preparing";
    downloadProgressMetaEl.textContent = "0%";
    isLectureDownloading = false;
    activeDownloadJobId = null;

    if (downloadButtonEl) {
      downloadButtonEl.disabled = false;
      downloadButtonEl.textContent = "Download Lecture";
    }
    if (downloadDismissButtonEl) {
      downloadDismissButtonEl.title = "Hide download button";
      downloadDismissButtonEl.setAttribute("aria-label", "Hide download button");
    }
  }

  function hideDownloadControl() {
    downloadDismissed = true;
    resetDownloadProgress();
    if (downloadWrapEl && downloadWrapEl.isConnected) {
      downloadWrapEl.remove();
    }
  }

  function cancelActiveDownload() {
    if (!activeDownloadJobId) {
      hideDownloadControl();
      return;
    }

    const jobId = activeDownloadJobId;
    if (downloadButtonEl) {
      downloadButtonEl.disabled = true;
      downloadButtonEl.textContent = "Canceling...";
    }
    setDownloadProgress({ jobId, phase: "Canceling", percent: 0 });

    chrome.runtime.sendMessage(
      {
        action: "cancelLectureDownload",
        jobId,
      },
      () => {
        resetDownloadProgress();
        showOSD("download", null, "Download canceled");
      },
    );
  }

  function injectDownloadButton() {
    if (!SUPPORTS_DOWNLOAD || !detectedLectureUrl || downloadDismissed) return;

    if (!downloadWrapEl) {
      downloadWrapEl = document.createElement("div");
      downloadWrapEl.id = "swiftskip-download-wrap";

      const downloadActionsEl = document.createElement("div");
      downloadActionsEl.className = "swiftskip-download-actions";

      downloadButtonEl = document.createElement("button");
      downloadButtonEl.id = "swiftskip-download-btn";
      downloadButtonEl.type = "button";
      downloadButtonEl.textContent = "Download Lecture";
      downloadButtonEl.title = "Download this Kaltura lecture";

      downloadDismissButtonEl = document.createElement("button");
      downloadDismissButtonEl.id = "swiftskip-download-dismiss";
      downloadDismissButtonEl.type = "button";
      downloadDismissButtonEl.setAttribute("aria-label", "Hide download button");
      downloadDismissButtonEl.title = "Hide download button";
      downloadDismissButtonEl.textContent = "\u00d7";

      downloadProgressEl = document.createElement("div");
      downloadProgressEl.id = "swiftskip-download-progress";
      downloadProgressEl.hidden = true;

      const progressTopEl = document.createElement("div");
      progressTopEl.className = "swiftskip-download-progress-top";

      downloadProgressLabelEl = document.createElement("span");
      downloadProgressLabelEl.className = "swiftskip-download-progress-label";
      downloadProgressLabelEl.textContent = "Preparing";

      downloadProgressMetaEl = document.createElement("span");
      downloadProgressMetaEl.className = "swiftskip-download-progress-meta";
      downloadProgressMetaEl.textContent = "0%";

      const progressTrackEl = document.createElement("div");
      progressTrackEl.className = "swiftskip-download-progress-track";

      downloadProgressFillEl = document.createElement("div");
      downloadProgressFillEl.className = "swiftskip-download-progress-fill";

      progressTopEl.appendChild(downloadProgressLabelEl);
      progressTopEl.appendChild(downloadProgressMetaEl);
      progressTrackEl.appendChild(downloadProgressFillEl);
      downloadProgressEl.appendChild(progressTopEl);
      downloadProgressEl.appendChild(progressTrackEl);

      downloadActionsEl.appendChild(downloadButtonEl);
      downloadActionsEl.appendChild(downloadDismissButtonEl);
      downloadWrapEl.appendChild(downloadActionsEl);
      downloadWrapEl.appendChild(downloadProgressEl);

      downloadButtonEl.addEventListener("click", () => {
        if (isLectureDownloading) return;

        activeDownloadJobId = createDownloadJobId();
        isLectureDownloading = true;
        clearTimeout(downloadResetTimer);
        downloadButtonEl.disabled = true;
        if (downloadDismissButtonEl) {
          downloadDismissButtonEl.title = "Cancel download";
          downloadDismissButtonEl.setAttribute("aria-label", "Cancel download");
        }
        setDownloadProgress({
          jobId: activeDownloadJobId,
          phase: "Preparing",
          percent: 0,
        });
        showOSD("download", null, "Preparing download");

        // Progress (including "Complete" / "Download failed") arrives via
        // lectureDownloadProgress messages; the reply only matters if the
        // background couldn't be reached at all.
        chrome.runtime.sendMessage(
          {
            action: "startLectureDownload",
            jobId: activeDownloadJobId,
            url: detectedLectureUrl,
            title: getPageTitle(),
          },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              setDownloadProgress({
                jobId: activeDownloadJobId,
                phase: "Download failed",
                error: "SwiftSkip's background script didn't respond. Reload the page and try again.",
                active: false,
              });
              return;
            }
            const state = response.state || {};
            if (state.phase === "Complete") showOSD("download", null, "Download saved");
          },
        );
      });

      downloadDismissButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isLectureDownloading) {
          cancelActiveDownload();
          return;
        }

        hideDownloadControl();
      });
    }

    placeDownloadControl();
  }

  // ─── OSD parent: must live inside the fullscreen element to show in fullscreen
  function getOSDParent() {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs && fs.tagName !== "VIDEO") return fs;
    return document.documentElement || document.body;
  }

  // ─── Build OSD element ─────────────────────────────────────────────────────
  function buildOSD() {
    osdEl = document.createElement("div");
    osdEl.id = "swiftskip-osd";

    iconEl = document.createElement("span");
    iconEl.className = "swiftskip-osd-icon";

    const contentEl = document.createElement("div");
    contentEl.className = "swiftskip-osd-content";

    labelEl = document.createElement("span");
    labelEl.className = "swiftskip-osd-label";

    barWrapEl = document.createElement("div");
    barWrapEl.className = "swiftskip-osd-bar";

    barFillEl = document.createElement("div");
    barFillEl.className = "swiftskip-osd-bar-fill";

    barWrapEl.appendChild(barFillEl);
    contentEl.appendChild(labelEl);
    contentEl.appendChild(barWrapEl);
    osdEl.appendChild(iconEl);
    osdEl.appendChild(contentEl);
  }

  function ensureOSD() {
    if (!osdEl) buildOSD();
    const parent = getOSDParent();
    if (osdEl.parentElement !== parent) parent.appendChild(osdEl);
  }

  // Re-parent OSD whenever fullscreen state changes
  ["fullscreenchange", "webkitfullscreenchange"].forEach((evt) => {
    document.addEventListener(evt, () => {
      if (osdEl) getOSDParent().appendChild(osdEl);
      placeDownloadControl();
    });
  });

  // ─── Icons ─────────────────────────────────────────────────────────────────
  const ICONS = {
    forward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
    backward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4"/><line x1="5" y1="19" x2="5" y2="5"/></svg>`,
    faster: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>`,
    slower: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    mute: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
    vol_high: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    vol_low: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    vol_zero: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>`,
    seek: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg>`,
    reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>`,
  };

  // Parsed as SVG (not innerHTML) — the strings above are constants.
  const svgParser = new DOMParser();
  function svgIcon(name) {
    return document.importNode(
      svgParser.parseFromString(ICONS[name].replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '), "image/svg+xml").documentElement,
      true,
    );
  }

  // ─── Show OSD ───────────────────────────────────────────────────────────────
  // barValue: 0–1 fills the progress bar (null = hide bar)
  function showOSD(type, icon, label, barValue = null) {
    ensureOSD();

    const isSameType = currentOsdType === type;
    currentOsdType = type;

    iconEl.replaceChildren();
    if (icon && ICONS[icon]) {
      iconEl.append(svgIcon(icon));
      iconEl.style.display = "flex";
    } else {
      iconEl.style.display = "none";
    }

    labelEl.textContent = label;

    if (barValue !== null) {
      barWrapEl.style.display = "block";
      barFillEl.style.width = `${Math.round(Math.max(0, Math.min(1, barValue)) * 100)}%`;
    } else {
      barWrapEl.style.display = "none";
    }

    if (
      !isSameType ||
      osdEl.style.display === "none" ||
      osdEl.classList.contains("swiftskip-fade-out")
    ) {
      osdEl.classList.remove("swiftskip-fade-out", "swiftskip-bump");
      void osdEl.offsetWidth; // force reflow for re-animation
      osdEl.classList.add("swiftskip-bump");
    }

    osdEl.classList.remove("swiftskip-fade-out");
    osdEl.style.display = "flex";
    positionOverPlayer(osdEl, "center");

    clearTimeout(osdTimeout);
    clearTimeout(osdFadeTimeout);

    osdTimeout = setTimeout(() => {
      osdEl.classList.add("swiftskip-fade-out");
      osdFadeTimeout = setTimeout(() => {
        if (osdEl) osdEl.style.display = "none";
        skipAccumulator = 0;
        currentOsdType = null;
      }, 350);
    }, 1100);
  }

  // ─── Actions ───────────────────────────────────────────────────────────────
  function skip(seconds) {
    const v = getVideo();
    if (!v) return;
    const { time, moved, blocked } = computeSkip(v.currentTime, v.duration, seconds);
    // At the start/end the total simply stays put (e.g. "−4s"), no −10 −20 …
    if (!blocked) {
      v.currentTime = time;
      skipAccumulator = accumulateSkip(skipAccumulator, moved);
    }
    const position = Number.isFinite(v.duration) && v.duration > 0 ? time / v.duration : null;
    showOSD("skip", null, formatSkipTotal(skipAccumulator), position);
  }

  function changeVolume(delta) {
    const v = getVideo();
    if (!v) return;
    if (v.muted) v.muted = false;
    v.volume = Math.max(0, Math.min(1, v.volume + delta));
    const pct = Math.round(v.volume * 100);
    const icon =
      v.volume === 0 ? "vol_zero" : v.volume < 0.5 ? "vol_low" : "vol_high";
    showOSD("volume", icon, `${pct}%`, v.volume);
  }

  function setSpeed(v, rate, icon) {
    v.playbackRate = rate;
    showOSD("speed", icon, formatSpeed(rate), rate / MAX_SPEED);
    if (settings.rememberSpeed && rate !== settings.preferredSpeed) {
      settings = { ...settings, preferredSpeed: rate };
      chrome.storage.sync.set({ preferredSpeed: rate });
    }
  }

  function changeSpeed(direction) {
    const v = getVideo();
    if (!v) return;
    const rate = nextSpeed(v.playbackRate, direction, settings.speedStep);
    setSpeed(v, rate, direction > 0 ? "faster" : "slower");
  }

  function resetSpeed() {
    const v = getVideo();
    if (!v) return;
    setSpeed(v, 1, "reset");
  }

  function togglePause() {
    const v = getVideo();
    if (!v) return;

    const container = getPlayerContainer(v);
    let playBtn = null;
    const btns = container.querySelectorAll('button, [role="button"]');
    for (const b of btns) {
      const label = (
        b.title ||
        b.getAttribute("aria-label") ||
        b.className ||
        ""
      ).toLowerCase();
      if (label.includes("play") || label.includes("pause")) {
        playBtn = b;
        break;
      }
    }

    if (playBtn) {
      playBtn.click();
    } else {
      if (v.paused) {
        v.play();
      } else {
        v.pause();
      }
    }
  }

  function toggleMute() {
    const v = getVideo();
    if (!v) return;
    v.muted = !v.muted;
    if (v.muted) {
      showOSD("mute", "mute", "Muted", 0);
    } else {
      showOSD(
        "volume",
        v.volume < 0.5 ? "vol_low" : "vol_high",
        `${Math.round(v.volume * 100)}%`,
        v.volume,
      );
    }
  }

  function seekPercent(pct) {
    const v = getVideo();
    if (!v || !v.duration) return;
    v.currentTime = (pct / 100) * v.duration;
    showOSD("seek", "seek", formatTime(v.currentTime), pct / 100);
  }

  function getPlayerContainer(v) {
    let curr = v;
    let best = (v.getRootNode && v.getRootNode().host) || v.parentElement || v;
    while (
      curr &&
      curr !== document.body &&
      curr !== document.documentElement
    ) {
      if (curr.nodeType === 1) {
        const tag = curr.tagName.toLowerCase();
        const cls =
          typeof curr.className === "string"
            ? curr.className.toLowerCase()
            : "";
        const id = typeof curr.id === "string" ? curr.id.toLowerCase() : "";
        if (
          tag.includes("player") ||
          cls.includes("player") ||
          cls.includes("video-js") ||
          cls.includes("kaltura") ||
          id.includes("player")
        ) {
          best = curr;
        }
      }
      curr =
        curr.parentNode ||
        (curr instanceof ShadowRoot ? curr.host : null) ||
        (curr.getRootNode && curr.getRootNode().host);
    }
    return best;
  }

  function toggleFullscreen() {
    const v = getVideo();
    if (!v) return;

    const container = getPlayerContainer(v);
    const isFS = document.fullscreenElement || document.webkitFullscreenElement;

    let fsBtn = null;
    let exitBtn = null;
    const btns = container.querySelectorAll('button, [role="button"]');
    for (const b of btns) {
      const label = (
        b.title ||
        b.getAttribute("aria-label") ||
        b.className ||
        ""
      ).toLowerCase();
      if (label.includes("fullscreen") || label.includes("full screen")) {
        if (
          label.includes("exit") ||
          label.includes("close") ||
          label.includes("compress")
        ) {
          exitBtn = b;
        } else {
          fsBtn = b;
        }
      }
    }

    if (!isFS) {
      if (fsBtn) {
        fsBtn.click();
        return;
      }
      const req =
        container.requestFullscreen || container.webkitRequestFullscreen;
      if (req) req.call(container);
    } else {
      if (exitBtn) {
        exitBtn.click();
        return;
      }
      if (fsBtn) {
        fsBtn.click();
        return;
      }
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  }

  // ─── Shortcuts ─────────────────────────────────────────────────────────────
  // Runs one action on this frame's video. Returns false if there's none.
  function runAction(id) {
    if (!getVideo()) return false;
    switch (id) {
      case "play_pause": togglePause(); break;
      case "skip_backward": skip(-settings.skipSeconds); break;
      case "skip_forward": skip(settings.skipSeconds); break;
      case "speed_down": changeSpeed(-1); break;
      case "speed_up": changeSpeed(1); break;
      case "speed_reset": resetSpeed(); break;
      case "volume_down": changeVolume(-0.05); break;
      case "volume_up": changeVolume(0.05); break;
      case "mute": toggleMute(); break;
      case "fullscreen": toggleFullscreen(); break;
      case "show_shortcuts": toggleShortcutSheet(); break;
      default: {
        const seek = /^seek_(\d0?)$/.exec(id || "");
        if (!seek) return false;
        seekPercent(Number(seek[1]));
      }
    }
    return true;
  }

  function toggleShortcutSheet() {
    if (isShortcutSheetOpen()) {
      closeShortcutSheet();
      return;
    }
    openShortcutSheet({
      parent: getOSDParent(),
      place: (el) => positionOverPlayer(el, "center"),
      shortcuts: settings.shortcuts,
      skipSeconds: settings.skipSeconds,
    });
  }

  // Typing in a text field must never trigger shortcuts. composedPath()[0] sees
  // through shadow DOM (event.target is retargeted to the shadow host).
  const NON_TEXT_INPUTS = new Set(["button", "checkbox", "radio", "range", "submit", "reset", "color", "file", "image"]);
  function isTypingTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
    if (target.tagName === "INPUT") return !NON_TEXT_INPUTS.has(target.type);
    return Boolean(target.closest('[role="textbox"], [role="combobox"], [role="searchbox"]'));
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (!settings.enabled) return;
      if (isTypingTarget(e.composedPath?.()[0] || e.target)) return;

      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };

      if (e.key === "Escape") {
        if (isShortcutSheetOpen()) {
          stop();
          closeShortcutSheet();
        } else {
          // The sheet may be open in the player frame; Esc stays the page's too.
          connectedPlayer()?.postMessage({ [RELAY]: "escape" }, "*");
        }
        return;
      }

      const id = findAction(shortcutMap, e);
      if (!id) return;

      if (getVideo()) {
        stop();
        // Holding a key repeats skips/volume/speed, but not toggles.
        if (!(e.repeat && NO_REPEAT.has(id))) runAction(id);
        return;
      }

      // Focus is on the page around the player (the player is an iframe):
      // hand the shortcut to the player frame.
      const player = connectedPlayer();
      if (player) {
        stop();
        if (!(e.repeat && NO_REPEAT.has(id))) player.postMessage({ [RELAY]: "run", action: id }, "*");
      }
    },
    { capture: true, passive: false },
  );

  // ─── Player ↔ page relay ───────────────────────────────────────────────────
  // The frame with the video announces itself to all its ancestor frames;
  // they remember it and forward shortcuts pressed while they have focus.
  const RELAY = "__swiftskip";
  let playerWindow = null;

  function connectedPlayer() {
    try {
      return playerWindow && !playerWindow.closed ? playerWindow : null;
    } catch {
      return null;
    }
  }

  function isAncestor(win) {
    for (let w = window; w !== window.top; ) {
      w = w.parent;
      if (w === win) return true;
    }
    return false;
  }

  function announcePlayer() {
    for (let w = window; w !== window.top; ) {
      w = w.parent;
      w.postMessage({ [RELAY]: "player" }, "*");
    }
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object" || !data[RELAY]) return;
    if (data[RELAY] === "player" && event.source !== window) {
      playerWindow = event.source;
    } else if (data[RELAY] === "hello" && isAncestor(event.source)) {
      if (getVideo()) announcePlayer();
    } else if (data[RELAY] === "run" && isAncestor(event.source)) {
      if (settings.enabled) runAction(data.action);
    } else if (data[RELAY] === "escape" && isAncestor(event.source)) {
      closeShortcutSheet();
    }
  });

  // The top page asks all frames once; a player that loads later announces
  // itself when its video shows up (see trackVideos).
  if (window === window.top) {
    const greet = (win) => {
      for (let i = 0; i < win.frames.length; i++) {
        try {
          win.frames[i].postMessage({ [RELAY]: "hello" }, "*");
          greet(win.frames[i]);
        } catch {
          /* frame went away */
        }
      }
    };
    greet(window);
  }

  // ─── Per-video: resume position + remembered speed ─────────────────────────
  const trackedVideos = new WeakSet();

  function trackVideos() {
    for (const video of findVideos()) {
      if (trackedVideos.has(video)) continue;
      trackedVideos.add(video);
      attachVideo(video);
      if (window !== window.top) announcePlayer();
    }
  }

  function attachVideo(v) {
    let started = false; // first "playing" handled
    let key = null; // resume key, fixed once the video has started
    let lastSave = 0;

    const save = () => {
      if (!started || !key || !settings.enabled || !settings.resumePlayback) return;
      if (isResumable(v.currentTime, v.duration)) {
        setResumePosition(key, v.currentTime, v.duration).catch(() => {});
      } else if (v.currentTime > 0) {
        // Back at the very start, or (nearly) finished: nothing to resume.
        clearResumePosition(key).catch(() => {});
      }
    };

    v.addEventListener("playing", async () => {
      if (started || !settings.enabled) return;
      started = true;
      key = resumeKey({ pageUrl: window.location.href, manifestUrl: detectedLectureUrl, duration: v.duration });

      if (settings.rememberSpeed && settings.preferredSpeed !== 1 && Math.abs(v.playbackRate - 1) < 0.01) {
        v.playbackRate = settings.preferredSpeed;
        showOSD("speed", "faster", formatSpeed(settings.preferredSpeed), settings.preferredSpeed / MAX_SPEED);
      }

      if (!settings.resumePlayback) return;
      pruneResumePositions().catch(() => {});
      const saved = await getResumePosition(key).catch(() => null);
      // Only if the player didn't already start somewhere else itself.
      if (!saved || !isResumable(saved.time, v.duration) || v.currentTime > 5) return;
      v.currentTime = saved.time;
      showToast({
        parent: getOSDParent(),
        place: (el) => positionOverPlayer(el, "bottom"),
        message: `Resumed at ${formatTime(saved.time)}`,
        action: {
          label: "Start over",
          onClick: () => {
            v.currentTime = 0;
            clearResumePosition(key).catch(() => {});
          },
        },
      });
    });

    v.addEventListener("timeupdate", () => {
      if (Date.now() - lastSave < 5000) return;
      lastSave = Date.now();
      save();
    });
    v.addEventListener("pause", save);
    v.addEventListener("seeked", save);
    v.addEventListener("ended", () => key && clearResumePosition(key).catch(() => {}));
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => document.hidden && save());
  }

  trackVideos();
  const videoTimer = setInterval(() => {
    // After an extension update this old copy is cut off; stop quietly.
    if (!chrome.runtime?.id) return clearInterval(videoTimer);
    trackVideos();
  }, 2000);

  startHlsDetection();

  // ─── Lecture context (top-level Toledo page only) ──────────────────────────
  // The player lives in a cross-origin Kaltura iframe that only knows the
  // recording's room/time name. The Toledo page around it knows the course
  // (breadcrumb) and the lecture title (the LTI launch URL's toolTitle), which
  // make a much better download filename.
  function readLectureContext() {
    const lecture = new URLSearchParams(window.location.search).get("toolTitle");
    let course = null;
    for (const link of document.querySelectorAll("nav a")) {
      const parsed = parseCourseTitle(link.textContent);
      if (parsed) {
        course = parsed.name;
        break;
      }
    }
    return { course, lecture: lecture && lecture.trim() };
  }

  if (window === window.top) {
    let lastContext = null;
    const sendLectureContext = () => {
      const context = readLectureContext();
      const key = JSON.stringify(context);
      if (key === lastContext) return;
      lastContext = key;
      // Callback form: works the same in every browser and swallows "no receiver".
      chrome.runtime.sendMessage({ action: "registerLectureContext", ...context }, () => {
        void chrome.runtime.lastError;
      });
    };
    sendLectureContext();
    // Toledo renders the breadcrumb (and changes lecture) without page loads.
    const contextTimer = setInterval(() => {
      // After an extension update this old copy is cut off; stop quietly.
      if (!chrome.runtime?.id) return clearInterval(contextTimer);
      sendLectureContext();
    }, 2000);
  }

  // ─── Messages from the popup / background ─────────────────────────────────
  // Only the frame that has the video answers, so the popup gets its reply.
  function playbackState(v) {
    return { hasVideo: true, rate: v.playbackRate, paused: v.paused };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.action) return false;
    if (msg.action === "lectureDownloadProgress") {
      setDownloadProgress(msg);
      return false;
    }

    const v = getVideo();
    if (!v) return false;
    if (msg.action === "runShortcut") {
      if (settings.enabled) runAction(msg.shortcut);
      sendResponse(playbackState(v));
    } else if (msg.action === "getPlayback") {
      sendResponse(playbackState(v));
    }
    return false;
  });
})();
