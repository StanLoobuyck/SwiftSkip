// Settings page: general options + the keyboard shortcut editor.

import { ext } from "../shared/ext.js";
import { SKIP_OPTIONS, SPEED_STEP_OPTIONS } from "../shared/settings.js";
import {
  ACTIONS,
  DEFAULT_SHORTCUTS,
  MAX_BINDINGS,
  RESERVED_BINDINGS,
  bindingParts,
  eventToBinding,
  formatBinding,
} from "../shared/shortcuts.js";
import { formatSpeed } from "../shared/playback.js";
import {
  clearResumePositions,
  countResumePositions,
  loadSettings,
  saveSettings,
  watchSettings,
} from "../shared/storage.js";

const $ = (id) => document.getElementById(id);
let settings = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ─── General ──────────────────────────────────────────────────────────────────

function segmented(container, options, current, label, onPick) {
  container.replaceChildren(
    ...options.map((value) => {
      const button = el("button", null, label(value));
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(value === current));
      button.addEventListener("click", () => onPick(value));
      return button;
    }),
  );
}

async function renderForgetPositions() {
  const count = await countResumePositions();
  const button = $("forget-positions");
  button.hidden = count === 0;
  button.textContent = `Forget ${count} saved position${count === 1 ? "" : "s"}`;
}

function renderGeneral() {
  $("enabled").checked = settings.enabled;
  $("remember-speed").checked = settings.rememberSpeed;
  $("resume").checked = settings.resumePlayback;
  $("remember-speed-desc").textContent =
    settings.preferredSpeed !== 1
      ? `New lectures start at the speed you last chose (now ${formatSpeed(settings.preferredSpeed)}).`
      : "New lectures start at the speed you last chose.";

  segmented($("skip-options"), SKIP_OPTIONS, settings.skipSeconds, (s) => `${s}s`, (skipSeconds) =>
    saveSettings({ skipSeconds }),
  );
  segmented($("step-options"), SPEED_STEP_OPTIONS, settings.speedStep, (s) => formatSpeed(s), (speedStep) =>
    saveSettings({ speedStep }),
  );
}

$("enabled").addEventListener("change", (e) => saveSettings({ enabled: e.target.checked }));
$("remember-speed").addEventListener("change", (e) => saveSettings({ rememberSpeed: e.target.checked }));
$("resume").addEventListener("change", (e) => saveSettings({ resumePlayback: e.target.checked }));
$("forget-positions").addEventListener("click", async () => {
  await clearResumePositions();
  renderForgetPositions();
});

// ─── Shortcut editor ──────────────────────────────────────────────────────────

let recording = null; // { actionId, index } while waiting for a key press

function notice(message) {
  $("shortcut-notice").textContent = message;
  $("shortcut-notice").hidden = !message;
}

function bindingButton(actionId, binding, index) {
  const button = el("button", "binding");
  button.type = "button";
  if (recording && recording.actionId === actionId && recording.index === index) {
    button.classList.add("is-recording");
    button.textContent = "Press a key…";
    button.setAttribute("aria-label", "Recording — press a key, Esc to cancel");
  } else {
    bindingParts(binding).forEach((part, i) => {
      if (i) button.append(el("span", "plus", "+"));
      button.append(el("kbd", null, part));
    });
    button.title = "Click to change";
    button.setAttribute("aria-label", `${formatBinding(binding)} — click to change`);
  }
  button.addEventListener("click", () => startRecording(actionId, index));
  return button;
}

function shortcutRow(action) {
  const row = el("div", "shortcut");
  row.append(el("span", "shortcut-label", action.label));

  const keys = el("div", "shortcut-keys");
  const bindings = settings.shortcuts[action.id] || [];
  bindings.forEach((binding, index) => keys.append(bindingButton(action.id, binding, index)));

  const addingHere = recording && recording.actionId === action.id && recording.index === bindings.length;
  if (addingHere) {
    keys.append(bindingButton(action.id, null, bindings.length));
  } else if (!bindings.length) {
    keys.append(el("span", "binding-empty", "None"));
  }
  if (bindings.length < MAX_BINDINGS && !addingHere) {
    const add = el("button", "icon-btn add-binding", "+");
    add.type = "button";
    add.title = "Add a key";
    add.setAttribute("aria-label", `Add a key for ${action.label}`);
    add.addEventListener("click", () => startRecording(action.id, bindings.length));
    keys.append(add);
  }
  row.append(keys);
  return row;
}

function renderShortcuts() {
  const container = $("shortcut-groups");
  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  const nodes = [];
  for (const group of groups) {
    const actions = ACTIONS.filter((a) => a.group === group);
    if (group === "Jump") {
      const details = el("details", "jump");
      details.open = Boolean(recording && recording.actionId.startsWith("seek_")) || container.querySelector("details.jump")?.open;
      details.append(el("summary", null, "Jump to 0% – 90%"));
      actions.forEach((a) => details.append(shortcutRow(a)));
      nodes.push(el("h3", null, "Jump"), details);
    } else {
      nodes.push(el("h3", null, group), ...actions.map(shortcutRow));
    }
  }
  container.replaceChildren(...nodes);
}

function startRecording(actionId, index) {
  recording = { actionId, index };
  notice("");
  renderShortcuts();
  document.querySelector(".binding.is-recording")?.focus();
}

function stopRecording() {
  recording = null;
  renderShortcuts();
}

function saveShortcuts(shortcuts) {
  settings.shortcuts = shortcuts;
  saveSettings({ shortcuts });
}

document.addEventListener(
  "keydown",
  (event) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();

    const { actionId, index } = recording;
    const shortcuts = structuredClone(settings.shortcuts);
    const current = shortcuts[actionId];

    if (event.key === "Escape") return stopRecording();
    if (event.key === "Backspace" || event.key === "Delete") {
      current.splice(index, 1);
      saveShortcuts(shortcuts);
      return stopRecording();
    }

    const binding = eventToBinding(event);
    if (!binding) return; // a modifier on its own — wait for the actual key
    if (RESERVED_BINDINGS.has(binding)) {
      notice(`${formatBinding(binding)} can't be used — it's needed to move around the page.`);
      return;
    }

    // Already this action's other key: nothing to change.
    if (current.includes(binding) && current.indexOf(binding) !== index) return stopRecording();

    // Taken by another action? Move it here and say so.
    let message = "";
    for (const action of ACTIONS) {
      const list = shortcuts[action.id];
      const at = list.indexOf(binding);
      if (at === -1 || (action.id === actionId && at === index)) continue;
      list.splice(at, 1);
      if (action.id !== actionId) {
        const label = ACTIONS.find((a) => a.id === actionId).label;
        message = `${formatBinding(binding)} was used for “${action.label}”. It now does “${label}”.`;
      }
    }

    const target = shortcuts[actionId];
    target.splice(Math.min(index, target.length), index < target.length ? 1 : 0, binding);
    shortcuts[actionId] = target.slice(0, MAX_BINDINGS);
    saveShortcuts(shortcuts);
    notice(message);
    stopRecording();
  },
  true,
);

// Clicking elsewhere cancels recording.
document.addEventListener("click", (event) => {
  if (recording && !event.target.closest(".binding, .add-binding")) stopRecording();
});

$("reset-shortcuts").addEventListener("click", () => {
  recording = null;
  saveShortcuts(structuredClone(DEFAULT_SHORTCUTS));
  notice("Shortcuts reset to the defaults.");
  renderShortcuts();
});

// ─── Start ────────────────────────────────────────────────────────────────────

function render() {
  renderGeneral();
  renderShortcuts();
  renderForgetPositions();
}

$("version").textContent = ext.runtime.getManifest().version;

loadSettings().then((loaded) => {
  settings = loaded;
  render();
  if (location.hash === "#shortcuts") $("shortcuts").scrollIntoView();
});

// Changes from the popup, another settings tab, or a synced browser.
watchSettings((next) => {
  settings = next;
  render();
});
