// User settings: defaults and validation — pure (unit-tested in test/).
// Reading/writing browser storage lives in storage.js.

import { migrateLegacyKeybinds, normalizeShortcuts } from "./shortcuts.js";

export const SKIP_OPTIONS = [5, 10, 15, 30];
export const SPEED_STEP_OPTIONS = [0.25, 0.1];

export const DEFAULT_SETTINGS = {
  enabled: true,
  skipSeconds: 10,
  speedStep: 0.25,
  rememberSpeed: true,
  preferredSpeed: 1,
  resumePlayback: true,
  shortcuts: normalizeShortcuts(null),
};

const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === "boolean" ? value : fallback);

// Whatever is in storage (possibly from an older version) → complete settings.
export function normalizeSettings(stored = {}) {
  const d = DEFAULT_SETTINGS;
  const speed = Number(stored.preferredSpeed);
  return {
    enabled: bool(stored.enabled, d.enabled),
    skipSeconds: oneOf(stored.skipSeconds, SKIP_OPTIONS, d.skipSeconds),
    speedStep: oneOf(stored.speedStep, SPEED_STEP_OPTIONS, d.speedStep),
    rememberSpeed: bool(stored.rememberSpeed, d.rememberSpeed),
    preferredSpeed: speed >= 0.25 && speed <= 4 ? speed : d.preferredSpeed,
    resumePlayback: bool(stored.resumePlayback, d.resumePlayback),
    shortcuts: stored.shortcuts
      ? normalizeShortcuts(stored.shortcuts)
      : migrateLegacyKeybinds(stored.keybinds), // ≤ 3.2 stored "keybinds"
  };
}
