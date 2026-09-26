// Toolbar popup: what's playing in this tab (+ download), speed, skip
// interval, and links to the settings page. Everything else lives there.

import { ext } from "../shared/ext.js";
import { SUPPORTS_DOWNLOAD } from "../shared/features.js";
import { formatProgressMeta } from "../shared/format.js";
import { formatSpeed } from "../shared/playback.js";
import { SKIP_OPTIONS } from "../shared/settings.js";
import { isBuiltInSite, originPattern, patternHost } from "../shared/sites.js";
import { loadSettings, saveSettings } from "../shared/storage.js";
import { errorText, localizePage, phaseLabel, setLanguage, t } from "../shared/i18n.js";
import { radioGroup } from "../shared/radio-group.js";

const $ = (id) => document.getElementById(id);

let tabId = null;
let tabUrl = "";
let siteActive = true; // SwiftSkip runs on this tab's site
let settings = null;
let download = null; // this tab's download state from the background

// ─── Tab messaging ────────────────────────────────────────────────────────────

// Only the frame with the video answers; null if the page has no player.
async function askPlayer(message) {
  if (tabId == null) return null;
  try {
    return (await ext.tabs.sendMessage(tabId, message)) || null;
  } catch {
    return null;
  }
}

function askBackground(message) {
  return ext.runtime.sendMessage({ ...message, tabId }).catch(() => null);
}

// ─── On / off ─────────────────────────────────────────────────────────────────

function renderEnabled() {
  $("enabled").checked = settings.enabled;
  $("popup").classList.toggle("is-off", !settings.enabled);
}

$("enabled").addEventListener("change", (event) => {
  settings.enabled = event.target.checked;
  saveSettings({ enabled: settings.enabled });
  renderEnabled();
});

// ─── Lecture + download ───────────────────────────────────────────────────────

function renderLecture() {
  const state = download || {};
  const context = state.context || {};
  const available = Boolean(state.available);
  const title = context.lecture || state.title;

  $("lecture-course").textContent = context.course || "";
  $("lecture-course").hidden = !(available && context.course);
  const pattern = originPattern(tabUrl);
  $("site-off").hidden = siteActive || !pattern;
  if (!siteActive && pattern) {
    $("site-host").textContent = patternHost(pattern);
    $("lecture-title").textContent = t("siteOffTitle");
    $("lecture-hint").textContent = t("siteOffHint");
  } else {
    $("lecture-title").textContent = available ? title || t("lectureRecording") : t("noLecture");
    $("lecture-hint").textContent = t("noLectureHint");
  }
  $("lecture-hint").hidden = available;

  const phase = state.phase;
  const active = Boolean(state.active);
  const done = !active && phase === "Complete";
  const failed = !active && phase === "Download failed";
  const canDownload = SUPPORTS_DOWNLOAD && available;

  $("download-btn").hidden = !canDownload || active || done;
  $("download-label").textContent = failed ? t("tryAgain") : t("downloadLecture");

  $("progress").hidden = !active;
  if (active) {
    const percent = Math.max(0, Math.min(100, Math.round(Number(state.percent) || 0)));
    $("progress-phase").textContent = phaseLabel(phase || "Preparing");
    $("progress-fill").style.width = `${percent}%`;
    $("progress-bar").setAttribute("aria-valuenow", String(percent));
    $("progress-meta").textContent = formatProgressMeta(state);
  }

  $("done").hidden = !done;
  $("show-file").hidden = state.downloadId == null;
  $("error").hidden = !failed;
  $("error").textContent = failed ? errorText(state) || t("errUnknown") : "";
}

$("download-btn").addEventListener("click", async () => {
  download = { ...download, active: true, phase: "Preparing", percent: 0, error: null };
  renderLecture();
  const response = await askBackground({ action: "startLectureDownload" });
  if (response && response.state) {
    download = response.state;
  } else {
    download = { ...download, active: false, phase: "Download failed", errorCode: "errNoBackground" };
  }
  renderLecture();
});

$("cancel-btn").addEventListener("click", () => {
  askBackground({ action: "cancelLectureDownload", jobId: download && download.jobId });
});

$("show-file").addEventListener("click", () => {
  askBackground({ action: "showDownload" });
});

ext.runtime.onMessage.addListener((msg) => {
  if (msg && msg.action === "lectureDownloadStateChanged" && msg.state && msg.state.tabId === tabId) {
    download = msg.state;
    renderLecture();
  }
});

// ─── Other sites ──────────────────────────────────────────────────────────────

async function checkSiteActive() {
  const pattern = originPattern(tabUrl);
  if (!pattern || isBuiltInSite(tabUrl)) return true;
  return ext.permissions.contains({ origins: [pattern] }).catch(() => false);
}

$("site-enable").addEventListener("click", async () => {
  const pattern = originPattern(tabUrl);
  // The background registers + injects SwiftSkip when the permission is added
  // (Firefox closes this popup while its permission prompt is open).
  const granted = await ext.permissions.request({ origins: [pattern] }).catch(() => false);
  if (!granted) return;
  siteActive = true;
  renderLecture();
  setTimeout(async () => renderSpeed(await askPlayer({ action: "getPlayback" })), 800);
});

// ─── Speed ────────────────────────────────────────────────────────────────────

function renderSpeed(playback) {
  const has = Boolean(playback && playback.hasVideo);
  $("speed-value").textContent = has ? formatSpeed(playback.rate) : "–";
  $("speed-down").disabled = !has;
  $("speed-up").disabled = !has;
}

async function stepSpeed(shortcut) {
  renderSpeed(await askPlayer({ action: "runShortcut", shortcut }));
}

$("speed-down").addEventListener("click", () => stepSpeed("speed_down"));
$("speed-up").addEventListener("click", () => stepSpeed("speed_up"));

// ─── Skip interval ────────────────────────────────────────────────────────────

function renderSkip() {
  radioGroup(
    $("skip-options"),
    SKIP_OPTIONS,
    settings.skipSeconds,
    (s) => `${s}s`,
    (seconds) => {
      settings.skipSeconds = seconds;
      saveSettings({ skipSeconds: seconds });
      renderSkip();
    },
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function openSettings(hash = "") {
  ext.tabs.create({ url: ext.runtime.getURL(`options.html${hash}`) });
  window.close();
}

$("open-settings").addEventListener("click", () => openSettings());
$("open-shortcuts").addEventListener("click", () => openSettings("#shortcuts"));

// ─── Start ────────────────────────────────────────────────────────────────────

(async () => {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  tabId = tab ? tab.id : null;
  tabUrl = (tab && tab.url) || "";
  // Dev builds: popup.html?tab=<id>&url=<url> shows another tab, for automated UI tests.
  const devParams = new URLSearchParams(location.search);
  if (__DEV__ && devParams.has("tab")) {
    tabId = Number(devParams.get("tab"));
    tabUrl = devParams.get("url") || "";
  }
  settings = await loadSettings();
  setLanguage(settings.language);
  localizePage();
  siteActive = await checkSiteActive();
  renderEnabled();
  renderSkip();
  renderSpeed(null);
  renderLecture();

  const [state, playback] = await Promise.all([
    askBackground({ action: "getLectureDownloadState" }),
    askPlayer({ action: "getPlayback" }),
  ]);
  download = state && state.state;
  renderLecture();
  renderSpeed(playback);
})();
