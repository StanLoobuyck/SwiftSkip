// Keyboard shortcuts: the actions, their default keys, and turning key events
// into comparable "bindings" — pure functions (unit-tested in test/).
//
// A binding is a string like "k", "Space", "ArrowRight", "Shift+ArrowRight",
// "Ctrl+m" or "?". Shift is only part of a binding for letters and named keys:
// for digits and symbols it's simply how the character is typed ("?" is
// Shift+, on AZERTY, "1" is Shift+& there), so it's ignored.

import { t } from "./i18n.js";

// `group` is a stable id; `label` / groupLabel() are translated on use.
function action(id, labelKey, group, params) {
  return { id, group, get label() { return t(labelKey, params); } };
}

export const ACTIONS = [
  action("play_pause", "actionPlayPause", "Playback"),
  action("skip_backward", "actionSkipBackward", "Playback"),
  action("skip_forward", "actionSkipForward", "Playback"),
  action("speed_down", "actionSpeedDown", "Speed"),
  action("speed_up", "actionSpeedUp", "Speed"),
  action("speed_reset", "actionSpeedReset", "Speed"),
  action("volume_down", "actionVolumeDown", "Volume"),
  action("volume_up", "actionVolumeUp", "Volume"),
  action("mute", "actionMute", "Volume"),
  action("fullscreen", "actionFullscreen", "View"),
  action("show_shortcuts", "actionShowShortcuts", "View"),
  ...Array.from({ length: 10 }, (_, i) => action(`seek_${i * 10}`, "actionJump", "Jump", { percent: i * 10 })),
];

export function groupLabel(group) {
  return t(`group${group}`);
}

export const ACTION_IDS = ACTIONS.map((action) => action.id);

// Actions that shouldn't fire again while a key is held down.
export const NO_REPEAT = new Set(["play_pause", "mute", "fullscreen", "show_shortcuts"]);

export const MAX_BINDINGS = 2;

export const DEFAULT_SHORTCUTS = {
  play_pause: ["Space", "k"],
  skip_backward: ["ArrowLeft"],
  skip_forward: ["ArrowRight"],
  speed_down: ["[", "<"],
  speed_up: ["]", ">"],
  speed_reset: ["r"],
  volume_down: ["ArrowDown"],
  volume_up: ["ArrowUp"],
  mute: ["m"],
  fullscreen: ["f"],
  show_shortcuts: ["?"],
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`seek_${i * 10}`, [String(i)]])),
};

const IGNORED_KEYS = new Set([
  "Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "NumLock",
  "Dead", "Unidentified", "Process", "Compose",
]);

// Keys that can't be bound: they're needed to move around / cancel.
export const RESERVED_BINDINGS = new Set(["Tab", "Shift+Tab", "Escape", "Enter"]);

export function eventToBinding(event) {
  if (!event.key || IGNORED_KEYS.has(event.key)) return null;

  let key = event.key === " " ? "Space" : event.key;
  const isLetter = /^[a-z]$/i.test(key);
  const isNamed = key.length > 1; // ArrowLeft, Space, Home, F5, …
  if (isLetter) key = key.toLowerCase();

  // AltGr (AZERTY [ ] { } …) reports Ctrl+Alt on Windows; it's not a shortcut modifier.
  const altGraph = event.getModifierState?.("AltGraph");
  const modifiers = [];
  if (event.ctrlKey && !altGraph) modifiers.push("Ctrl");
  if (event.altKey && !altGraph) modifiers.push("Alt");
  if (event.shiftKey && (isLetter || isNamed)) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Meta");
  return [...modifiers, key].join("+");
}

// Layout-independent fallback for keys whose character depends on the
// keyboard layout: the number row (AZERTY needs Shift for digits) and the two
// keys right of P, which are [ ] on QWERTY but ^ $ on AZERTY.
const CODE_FALLBACK = {
  BracketLeft: "[",
  BracketRight: "]",
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Digit${i}`, String(i)])),
};

export function eventFallbackBinding(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return CODE_FALLBACK[event.code] || null;
}

// { binding: actionId } for fast lookup on every key press.
export function buildShortcutMap(shortcuts) {
  const map = new Map();
  for (const id of ACTION_IDS) {
    for (const binding of shortcuts[id] || []) {
      if (binding && !map.has(binding)) map.set(binding, id);
    }
  }
  return map;
}

export function findAction(map, event) {
  const binding = eventToBinding(event);
  if (binding && map.has(binding)) return map.get(binding);
  const fallback = eventFallbackBinding(event);
  return fallback && map.has(fallback) ? map.get(fallback) : null;
}

// Fills in defaults for actions that are missing (e.g. added in an update)
// and drops anything unknown or malformed.
export function normalizeShortcuts(stored) {
  const result = {};
  for (const id of ACTION_IDS) {
    const value = stored && stored[id];
    result[id] = Array.isArray(value)
      ? value.filter((b) => typeof b === "string" && b).slice(0, MAX_BINDINGS)
      : [...DEFAULT_SHORTCUTS[id]];
  }
  return result;
}

// Settings from SwiftSkip ≤ 3.2 stored only the keybinds that differed from
// that version's defaults, one key per action (+ "_alt" for speed).
const LEGACY_DEFAULTS = {
  skip_forward: "ArrowRight", skip_backward: "ArrowLeft", volume_up: "ArrowUp",
  volume_down: "ArrowDown", speed_up: "]", speed_down: "[", speed_up_alt: "$",
  speed_down_alt: "^", pause_play: " ", mute: "m", reset_speed: "r", fullscreen: "f",
};
const LEGACY_NAMES = { pause_play: "play_pause", reset_speed: "speed_reset" };

export function migrateLegacyKeybinds(legacy) {
  const shortcuts = normalizeShortcuts(null);
  if (!legacy || typeof legacy !== "object") return shortcuts;

  for (const [oldId, value] of Object.entries(legacy)) {
    if (oldId.endsWith("_alt")) continue; // superseded by the new defaults' second key
    if (oldId in LEGACY_DEFAULTS && value === LEGACY_DEFAULTS[oldId]) continue;
    const id = LEGACY_NAMES[oldId] || oldId;
    if (!(id in shortcuts)) continue;
    if (value === null) {
      shortcuts[id] = shortcuts[id].slice(1);
    } else if (typeof value === "string" && value) {
      const binding = value === " " ? "Space" : /^[A-Z]$/.test(value) ? value.toLowerCase() : value;
      shortcuts[id] = [binding, ...shortcuts[id].slice(1).filter((b) => b !== binding)];
    }
  }
  return shortcuts;
}

// For display: "Shift+ArrowRight" → ["Shift", "→"].
const KEY_LABELS = {
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
  Space: "Space", Escape: "Esc", PageUp: "Page Up", PageDown: "Page Down",
  Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Meta: "⌘",
};

export function bindingParts(binding) {
  if (!binding) return [];
  // Split on "+" separators but keep a literal "+" key ("Shift++" is not produced,
  // since Shift is dropped for symbols, but "Ctrl++" is possible).
  const parts = binding.endsWith("++") ? [...binding.slice(0, -2).split("+"), "+"] : binding.split("+");
  return parts.map((part) =>
    part === "Space" ? t("keySpace") : KEY_LABELS[part] || (part.length === 1 ? part.toUpperCase() : part),
  );
}

export function formatBinding(binding) {
  return bindingParts(binding).join(" + ");
}
