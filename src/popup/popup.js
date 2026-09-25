import { DEFAULT_KEYBINDS, DEFAULT_SKIP, SUPPORTS_DOWNLOAD } from "../shared/settings.js";
import { formatProgressMeta } from "../shared/format.js";

const KEYBIND_LABELS = {
  skip_forward: "Skip Forward",
  skip_backward: "Skip Backward",
  volume_up: "Volume Up",
  volume_down: "Volume Down",
  speed_up: "Speed Up",
  speed_down: "Speed Down",
  speed_up_alt: "Speed Up (Alt)",
  speed_down_alt: "Speed Down (Alt)",
  pause_play: "Play/Pause",
  mute: "Mute/Unmute",
  reset_speed: "Reset Speed",
  fullscreen: "Fullscreen",
  seek_0: "Seek 0%",
  seek_10: "Seek 10%",
  seek_20: "Seek 20%",
  seek_30: "Seek 30%",
  seek_40: "Seek 40%",
  seek_50: "Seek 50%",
  seek_60: "Seek 60%",
  seek_70: "Seek 70%",
  seek_80: "Seek 80%",
  seek_90: "Seek 90%",
};

let currentKeybinds = { ...DEFAULT_KEYBINDS };
let recordingKeybind = null;
let currentDownloadState = {
  available: false,
  active: false,
  phase: "No lecture detected",
  percent: 0,
};

// ── Load saved settings ──────────────────────────────────────────────────────
chrome.storage.sync.get(["skipSeconds", "enabled", "keybinds"], (data) => {
  const skip = data.skipSeconds ?? DEFAULT_SKIP;
  const en = data.enabled ?? true;

  document.getElementById("toggle-enabled").checked = en;

  const preset = document.querySelector(`.skip-preset[data-val="${skip}"]`);
  if (preset) {
    preset.classList.add("active");
  }

  // Load custom keybinds
  if (data.keybinds) {
    currentKeybinds = { ...DEFAULT_KEYBINDS, ...data.keybinds };
  }

  updateSkipHints(skip);
  applyEnabledState(en);
  renderKeybindsPreview();
});

// ── Keybinds UI ──────────────────────────────────────────────────────────────
function renderKeybindsPreview() {
  const preview = document.getElementById("keybinds-preview");
  preview.innerHTML = "";

  const keyOrder = [
    "skip_forward",
    "skip_backward",
    "pause_play",
    "mute",
    "volume_up",
    "volume_down",
    "speed_up",
    "speed_down",
    "reset_speed",
    "fullscreen",
  ];

  keyOrder.forEach((key) => {
    if (currentKeybinds[key]) {
      const entry = document.createElement("div");
      entry.className = "keybind-entry";
      entry.innerHTML = `
        <span class="keybind-action">${KEYBIND_LABELS[key]}</span>
        <span class="keybind-keys">${formatKeyDisplay(currentKeybinds[key])}</span>
      `;
      preview.appendChild(entry);
    }
  });
}

function renderKeybindsEditor() {
  const editor = document.getElementById("keybinds-editor");
  editor.innerHTML = "";

  Object.keys(KEYBIND_LABELS).forEach((key) => {
    const row = document.createElement("div");
    row.className = "keybind-editor-row";
    row.innerHTML = `
      <div class="keybind-editor-action">${KEYBIND_LABELS[key]}</div>
      <div 
        class="keybind-record-display" 
        data-keybind="${key}"
        title="Click to record new keybind"
      >
        ${currentKeybinds[key] ? formatKeyDisplay(currentKeybinds[key]) : "None"}
      </div>
      <button class="keybind-clear-btn" data-keybind="${key}" title="Clear this keybind">
        Clear
      </button>
    `;
    editor.appendChild(row);
  });

  // Add event listeners
  editor.querySelectorAll(".keybind-record-display").forEach((el) => {
    el.addEventListener("click", () => startRecording(el));
  });

  editor.querySelectorAll(".keybind-clear-btn").forEach((el) => {
    el.addEventListener("click", () => clearKeybind(el.dataset.keybind));
  });
}

function formatKeyDisplay(key) {
  const map = {
    " ": "Space",
    "ArrowUp": "↑",
    "ArrowDown": "↓",
    "ArrowLeft": "←",
    "ArrowRight": "→",
    "[": "[",
    "]": "]",
    "^": "^",
    $: "$",
  };
  return map[key] || key.toUpperCase();
}

function startRecording(element) {
  if (recordingKeybind) return;
  recordingKeybind = element.dataset.keybind;
  element.classList.add("recording");
  element.textContent = "Press a key...";

  const handler = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    const key = e.key;
    if (key === "Escape") {
      stopRecording();
      return;
    }

    // Ignore modifier-only keys
    if (["Control", "Shift", "Alt", "Meta"].includes(key)) return;

    // Save the new keybind
    currentKeybinds[recordingKeybind] = key;
    saveKeybinds();

    stopRecording();
    renderKeybindsEditor();
  };

  document.addEventListener("keydown", handler, true);

  function stopRecording() {
    document.removeEventListener("keydown", handler, true);
    element.classList.remove("recording");
    recordingKeybind = null;
  }
}

function clearKeybind(key) {
  currentKeybinds[key] = null;
  saveKeybinds();
  renderKeybindsEditor();
}

function saveKeybinds() {
  const keybindsToSave = {};
  Object.keys(currentKeybinds).forEach((key) => {
    if (currentKeybinds[key] !== DEFAULT_KEYBINDS[key]) {
      keybindsToSave[key] = currentKeybinds[key];
    }
  });
  chrome.storage.sync.set({ keybinds: keybindsToSave });
  sendToTab({ action: "updateKeybinds", keybinds: currentKeybinds });
}

// ── Toggle keybinds editor ────────────────────────────────────────────────────
document.querySelector(".toggle-keybinds-btn").addEventListener("click", () => {
  const preview = document.getElementById("keybinds-preview");
  const editor = document.getElementById("keybinds-editor");
  const closeBtn = document.getElementById("close-keybinds-btn");

  if (editor.style.display === "none") {
    preview.style.display = "none";
    renderKeybindsEditor();
    editor.style.display = "flex";
    closeBtn.style.display = "block";
  } else {
    preview.style.display = "flex";
    editor.style.display = "none";
    closeBtn.style.display = "none";
  }
});

document.getElementById("close-keybinds-btn").addEventListener("click", () => {
  const preview = document.getElementById("keybinds-preview");
  const editor = document.getElementById("keybinds-editor");
  const closeBtn = document.getElementById("close-keybinds-btn");

  preview.style.display = "flex";
  editor.style.display = "none";
  closeBtn.style.display = "none";
});


// ── Skip presets ─────────────────────────────────────────────────────────────
document.querySelectorAll(".skip-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    const val = parseInt(btn.dataset.val);
    saveSkip(val);
    document
      .querySelectorAll(".skip-preset")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

function saveSkip(val) {
  chrome.storage.sync.set({ skipSeconds: val });
  updateSkipHints(val);
  // Keep skip button data-seconds in sync
  document.querySelectorAll('[data-action="skip"]').forEach((btn) => {
    const cur = parseInt(btn.dataset.seconds);
    btn.dataset.seconds = cur < 0 ? -val : val;
  });
}

function updateSkipHints(val) {
  document
    .querySelectorAll(".skip-hint")
    .forEach((el) => (el.textContent = val));
}

// ── Enable toggle ─────────────────────────────────────────────────────────────
document.getElementById("toggle-enabled").addEventListener("change", (e) => {
  const en = e.target.checked;
  chrome.storage.sync.set({ enabled: en });
  sendToTab({ action: "toggle", enabled: en });
  applyEnabledState(en);
});

function applyEnabledState(enabled) {
  const popup = document.querySelector(".popup");
  popup.style.opacity = enabled ? "1" : "0.55";

  // Disable all controls except the main enable toggle
  popup.querySelectorAll("button, input:not(#toggle-enabled)").forEach((el) => {
    el.disabled = !enabled;
  });
  // Keep enabled toggle itself always interactive
  document.getElementById("toggle-enabled").disabled = false;
  document.querySelector("header").style.opacity = "1";
  renderDownloadState(currentDownloadState);
}

// ── Status helper ───────────────────────────────────────────────────────────
let statusTimer = null;
function setStatus(message, isError = false) {
  const statusEl = document.getElementById("status-message");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("status-error", isError);
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    statusEl.textContent = "";
    statusEl.classList.remove("status-error");
  }, 3000);
}

// ── Lecture download ────────────────────────────────────────────────────────
function getDownloadElements() {
  return {
    button: document.getElementById("popup-download-btn"),
    cancel: document.getElementById("popup-download-cancel"),
    progress: document.getElementById("popup-download-progress"),
    label: document.getElementById("popup-download-label"),
    meta: document.getElementById("popup-download-meta"),
    fill: document.getElementById("popup-download-fill"),
  };
}

function renderDownloadState(state = currentDownloadState) {
  currentDownloadState = { ...currentDownloadState, ...state };

  const { button, cancel, progress, label, meta, fill } = getDownloadElements();
  if (!button || !cancel || !progress || !label || !meta || !fill) return;

  const percent = Math.max(
    0,
    Math.min(100, Math.round(Number(currentDownloadState.percent) || 0)),
  );
  const enabled = document.getElementById("toggle-enabled").checked;
  const failed = currentDownloadState.phase === "Download failed";

  fill.style.width = `${failed ? 100 : percent}%`;
  progress.classList.toggle("failed", failed);
  label.textContent = currentDownloadState.phase || "Ready";
  meta.textContent = formatProgressMeta(currentDownloadState);
  meta.title = currentDownloadState.error || "";

  const row = button.closest(".download-row");

  if (currentDownloadState.active) {
    button.textContent = percent > 0 ? `Downloading ${percent}%` : "Preparing";
    button.disabled = true;
    cancel.hidden = false;
    if (row) row.classList.add("has-cancel");
    progress.hidden = false;
    return;
  }

  cancel.hidden = true;
  if (row) row.classList.remove("has-cancel");
  button.disabled = !enabled || !currentDownloadState.available;

  if (!currentDownloadState.available) {
    button.textContent = "No Lecture Found";
    progress.hidden = true;
    return;
  }

  button.textContent = "Download Lecture";
  progress.hidden = !["Complete", "Download failed"].includes(
    currentDownloadState.phase,
  );
}

// Download state is tracked per tab; the popup shows the tab it was opened on.
let activeTabId = null;
const activeTabReady = new Promise((resolve) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    activeTabId = tabs[0]?.id ?? null;
    resolve(activeTabId);
  });
});

async function requestDownloadState() {
  const tabId = await activeTabReady;
  chrome.runtime.sendMessage({ action: "getLectureDownloadState", tabId }, (response) => {
    if (chrome.runtime.lastError || !response || !response.state) {
      renderDownloadState({ available: false, phase: "No lecture detected" });
      return;
    }

    renderDownloadState(response.state);
  });
}

document.getElementById("popup-download-btn").addEventListener("click", async () => {
  const { button } = getDownloadElements();
  button.disabled = true;
  button.textContent = "Preparing";
  renderDownloadState({
    ...currentDownloadState,
    active: true,
    phase: "Preparing",
    percent: 0,
  });

  const tabId = await activeTabReady;
  chrome.runtime.sendMessage({ action: "startLectureDownload", tabId }, (response) => {
    if (chrome.runtime.lastError || !response || !response.state) {
      renderDownloadState({
        active: false,
        phase: "Download failed",
        error: chrome.runtime.lastError?.message || "Download failed.",
      });
      setStatus("Download failed.", true);
      return;
    }

    renderDownloadState(response.state);
    if (response.state.error) {
      setStatus("Download failed.", true);
    }
  });
});

document.getElementById("popup-download-cancel").addEventListener("click", async () => {
  const tabId = await activeTabReady;
  chrome.runtime.sendMessage(
    {
      action: "cancelLectureDownload",
      tabId,
      jobId: currentDownloadState.jobId,
    },
    (response) => {
      if (chrome.runtime.lastError || (response && response.ok === false)) {
        setStatus("Could not cancel download.", true);
      }
      requestDownloadState();
    },
  );
});

chrome.runtime.onMessage.addListener((msg) => {
  if (
    msg &&
    msg.action === "lectureDownloadStateChanged" &&
    msg.state &&
    msg.state.tabId === activeTabId
  ) {
    renderDownloadState(msg.state);
  }
});

if (SUPPORTS_DOWNLOAD) {
  requestDownloadState();
} else {
  document.getElementById("download-section").hidden = true;
}

// ── Control buttons ───────────────────────────────────────────────────────────
document.querySelectorAll("[data-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    const msg = { action };
    if (action === "skip") msg.seconds = parseInt(btn.dataset.seconds);
    if (action === "speed") msg.delta = parseInt(btn.dataset.delta);
    if (action === "volume") msg.delta = parseFloat(btn.dataset.delta);

    sendToTab(msg);
  });
});

// ── Send message to active tab ─────────────────────────────────────────────────
function sendToTab(msg, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      if (callback) callback({ success: false, message: "No active tab found." });
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, msg, (response) => {
      if (callback) callback(response);
    });
  });
}
