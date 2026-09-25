// SwiftSkip Video Controller v3 — content script
// ← → skip | ↑ ↓ volume | [ ] speed | Space/K pause | M mute | F fullscreen | 0-9 seek%

import { DEFAULT_KEYBINDS, DEFAULT_SKIP, SUPPORTS_DOWNLOAD } from "../shared/settings.js";
import { isLectureManifestUrl } from "../shared/hls.js";
import { formatProgressMeta } from "../shared/format.js";
import { accumulateSkip, computeSkip, formatSkipTotal } from "../shared/playback.js";

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

  // ─── Config ────────────────────────────────────────────────────────────────
  const config = { skipSeconds: DEFAULT_SKIP, enabled: true };

  let keybinds = { ...DEFAULT_KEYBINDS };

  chrome.storage.sync.get(["skipSeconds", "enabled", "keybinds"], (s) => {
    if (s.skipSeconds !== undefined) config.skipSeconds = s.skipSeconds;
    if (s.enabled !== undefined) config.enabled = s.enabled;
    if (s.keybinds) {
      keybinds = { ...DEFAULT_KEYBINDS, ...s.keybinds };
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.skipSeconds) config.skipSeconds = changes.skipSeconds.newValue;
    if (changes.enabled) config.enabled = changes.enabled.newValue;
  });

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

  // ─── Show OSD ───────────────────────────────────────────────────────────────
  // barValue: 0–1 fills the progress bar (null = hide bar)
  function showOSD(type, icon, label, barValue = null) {
    ensureOSD();

    const isSameType = currentOsdType === type;
    currentOsdType = type;

    if (icon) {
      iconEl.innerHTML = ICONS[icon] || "";
      iconEl.style.display = "flex";
    } else {
      iconEl.innerHTML = "";
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
    const { time, moved, blocked, edge } = computeSkip(v.currentTime, v.duration, seconds);
    const position = Number.isFinite(v.duration) && v.duration > 0 ? time / v.duration : null;

    if (blocked) {
      // Already at the start/end: say so instead of counting up −10, −20, …
      skipAccumulator = 0;
      showOSD(
        "skip-edge",
        seconds < 0 ? "backward" : "forward",
        seconds < 0 ? "Start of video" : "End of video",
        position,
      );
      return;
    }

    v.currentTime = time;
    skipAccumulator = accumulateSkip(skipAccumulator, moved);
    const edgeNote = edge === "start" ? " \u00b7 Start" : edge === "end" ? " \u00b7 End" : "";
    showOSD("skip", null, `${formatSkipTotal(skipAccumulator)}${edgeNote}`, position);
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

  const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

  function changeSpeed(delta) {
    const v = getVideo();
    if (!v) return;
    const idx = SPEED_STEPS.findIndex((s) => s >= v.playbackRate - 0.01);
    const safe = idx === -1 ? (delta > 0 ? SPEED_STEPS.length - 1 : 0) : idx;
    const next =
      delta > 0
        ? Math.min(safe + 1, SPEED_STEPS.length - 1)
        : Math.max(safe - 1, 0);
    v.playbackRate = SPEED_STEPS[next];
    // bar shows speed relative to max (3×)
    const label = v.playbackRate === 1 ? "1× (normal)" : `${v.playbackRate}×`;
    showOSD(
      "speed",
      delta > 0 ? "faster" : "slower",
      label,
      v.playbackRate / 3,
    );
  }

  function resetSpeed() {
    const v = getVideo();
    if (!v) return;
    v.playbackRate = 1;
    showOSD("speed", "reset", "1× (normal)", 1 / 3);
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
    showOSD("seek", "seek", `${pct}%`, pct / 100);
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

  // ─── Keyboard handler ──────────────────────────────────────────────────────
  window.addEventListener(
    "keydown",
    (e) => {
      if (!config.enabled) return;
      const tag = e.target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.target?.isContentEditable
      )
        return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const hasVideo = !!getVideo();
      const go = (fn) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        fn();
      };

      // Check against keybinds
      if (keybinds.skip_forward && e.key === keybinds.skip_forward) {
        return go(() => skip(config.skipSeconds));
      }
      if (keybinds.skip_backward && e.key === keybinds.skip_backward) {
        return go(() => skip(-config.skipSeconds));
      }
      if (keybinds.volume_up && e.key === keybinds.volume_up) {
        if (hasVideo) return go(() => changeVolume(0.05));
      }
      if (keybinds.volume_down && e.key === keybinds.volume_down) {
        if (hasVideo) return go(() => changeVolume(-0.05));
      }
      if (
        (keybinds.speed_up && e.key === keybinds.speed_up) ||
        (keybinds.speed_up_alt && e.key === keybinds.speed_up_alt)
      ) {
        if (hasVideo) return go(() => changeSpeed(1));
      }
      if (
        (keybinds.speed_down && e.key === keybinds.speed_down) ||
        (keybinds.speed_down_alt && e.key === keybinds.speed_down_alt)
      ) {
        if (hasVideo) return go(() => changeSpeed(-1));
      }
      if (keybinds.pause_play && e.key === keybinds.pause_play) {
        if (hasVideo) return go(togglePause);
      }
      // Support 'k' as alternate for pause/play (not overridable)
      if (e.key === "k") {
        if (hasVideo) return go(togglePause);
      }
      if (keybinds.mute && e.key === keybinds.mute) {
        if (hasVideo) return go(toggleMute);
      }
      if (keybinds.reset_speed && e.key === keybinds.reset_speed) {
        if (hasVideo) return go(resetSpeed);
      }
      if (keybinds.fullscreen && e.key === keybinds.fullscreen) {
        if (hasVideo) return go(toggleFullscreen);
      }
      // Handle seek keybinds
      if (e.key >= "0" && e.key <= "9" && hasVideo) {
        const seekKey = `seek_${parseInt(e.key) * 10}`;
        if (keybinds[seekKey] && e.key === keybinds[seekKey]) {
          return go(() => seekPercent(parseInt(e.key) * 10));
        }
      }
    },
    { capture: true, passive: false },
  );

  startHlsDetection();

  // ─── Messages from popup ───────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (
      !config.enabled &&
      msg.action !== "toggle" &&
      msg.action !== "updateKeybinds" &&
      msg.action !== "lectureDownloadProgress"
    )
      return;
    switch (msg.action) {
      case "lectureDownloadProgress":
        setDownloadProgress(msg);
        break;
      case "skip":
        skip(msg.seconds);
        break;
      case "volume":
        changeVolume(msg.delta);
        break;
      case "speed":
        changeSpeed(msg.delta);
        break;
      case "resetSpeed":
        resetSpeed();
        break;
      case "pause":
        togglePause();
        break;
      case "mute":
        toggleMute();
        break;
      case "toggle":
        config.enabled = msg.enabled;
        break;
      case "updateKeybinds":
        keybinds = msg.keybinds;
        break;
    }
  });
})();
