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
import { patternHost } from "../shared/sites.js";
import { enabledSites } from "../background/sites.js";
import {
  clearResumePositions,
  countResumePositions,
  loadSettings,
  saveSettings,
  watchSettings,
} from "../shared/storage.js";
import { LANGUAGE_NAMES, LANGUAGE_OPTIONS, localizePage, setLanguage, t } from "../shared/i18n.js";
import { radioGroup } from "../shared/radio-group.js";
import { groupLabel } from "../shared/shortcuts.js";

const $ = (id) => document.getElementById(id);
let settings = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ─── General ──────────────────────────────────────────────────────────────────

async function renderForgetPositions() {
  const count = await countResumePositions();
  const button = $("forget-positions");
  button.hidden = count === 0;
  button.textContent = t("forgetPositions", { count });
}

function renderGeneral() {
  $("enabled").checked = settings.enabled;
  $("remember-speed").checked = settings.rememberSpeed;
  $("resume").checked = settings.resumePlayback;
  $("remember-speed-desc").textContent =
    settings.preferredSpeed !== 1
      ? t("rememberSpeedDescNow", { speed: formatSpeed(settings.preferredSpeed) })
      : t("rememberSpeedDesc");

  // Pick → update locally and re-render at once (storage echoes back later).
  const pick = (patch) => {
    settings = { ...settings, ...patch };
    saveSettings(patch);
    render();
  };
  radioGroup(
    $("language-options"),
    LANGUAGE_OPTIONS,
    settings.language,
    (l) => (l === "auto" ? t("languageAuto") : LANGUAGE_NAMES[l]),
    (language) => pick({ language }),
  );
  radioGroup(
    $("skip-options"),
    SKIP_OPTIONS,
    settings.skipSeconds,
    (s) => `${s}s`,
    (skipSeconds) => pick({ skipSeconds }),
  );
  radioGroup(
    $("step-options"),
    SPEED_STEP_OPTIONS,
    settings.speedStep,
    (s) => formatSpeed(s),
    (speedStep) => pick({ speedStep }),
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

const action = (id) => ACTIONS.find((a) => a.id === id);
const actionLabel = (id) => action(id).label;

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
    button.textContent = t("pressAKey");
    button.setAttribute("aria-label", t("recordingAria"));
  } else {
    bindingParts(binding).forEach((part, i) => {
      if (i) button.append(el("span", "plus", "+"));
      button.append(el("kbd", null, part));
    });
    button.title = t("clickToChange");
    button.setAttribute(
      "aria-label",
      `${action(actionId).label}: ${t("bindingAria", { key: formatBinding(binding) })}`,
    );
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
    keys.append(el("span", "binding-empty", t("none")));
  }
  if (bindings.length < MAX_BINDINGS && !addingHere) {
    const add = el("button", "icon-btn add-binding", "+");
    add.type = "button";
    add.title = t("addKey");
    add.setAttribute("aria-label", t("addKeyFor", { action: action.label }));
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
      details.open =
        Boolean(recording && recording.actionId.startsWith("seek_")) ||
        container.querySelector("details.jump")?.open;
      details.append(el("summary", null, t("jumpSummary")));
      actions.forEach((a) => details.append(shortcutRow(a)));
      nodes.push(el("h3", null, groupLabel(group)), details);
    } else {
      nodes.push(el("h3", null, groupLabel(group)), ...actions.map(shortcutRow));
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
      notice(t("reservedKey", { key: formatBinding(binding) }));
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
        message = t("movedKey", {
          key: formatBinding(binding),
          from: action.label,
          to: actionLabel(actionId),
        });
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
  notice(t("resetDone"));
  renderShortcuts();
});

// ─── Sites ────────────────────────────────────────────────────────────────────

async function renderSites() {
  const list = $("site-list");
  const builtIn = el("li");
  builtIn.append(el("span", null, t("sitesBuiltIn")), el("span", "builtin", t("alwaysOn")));
  const rows = [builtIn];
  for (const pattern of await enabledSites()) {
    const row = el("li");
    const remove = el("button", "btn btn-secondary btn-small", t("remove"));
    remove.type = "button";
    remove.setAttribute("aria-label", t("removeSite", { site: patternHost(pattern) }));
    // Takes effect for new page loads; the background unregisters the script.
    remove.addEventListener("click", () => ext.permissions.remove({ origins: [pattern] }));
    row.append(el("span", null, patternHost(pattern)), remove);
    rows.push(row);
  }
  list.replaceChildren(...rows);
}

ext.permissions.onAdded.addListener(renderSites);
ext.permissions.onRemoved.addListener(renderSites);

// ─── Start ────────────────────────────────────────────────────────────────────

function render() {
  setLanguage(settings.language);
  localizePage();
  document.title = t("settingsPageTitle");
  $("version-line").textContent = t("settingsVersion", { version: ext.runtime.getManifest().version });
  renderGeneral();
  renderShortcuts();
  renderForgetPositions();
  renderSites();
}

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
