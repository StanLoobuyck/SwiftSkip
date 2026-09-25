// Settings in browser storage (synced between the user's browsers), and
// per-lecture resume positions (local only — they'd blow sync's quota).

import { ext } from "./ext.js";
import { normalizeSettings } from "./settings.js";

export async function loadSettings() {
  const stored = await ext.storage.sync.get(null);
  const settings = normalizeSettings(stored);
  // One-time move from the ≤ 3.2 format.
  if (stored.keybinds && !stored.shortcuts) {
    await ext.storage.sync.set({ shortcuts: settings.shortcuts });
    await ext.storage.sync.remove("keybinds");
  }
  return settings;
}

export function saveSettings(patch) {
  return ext.storage.sync.set(patch);
}

// Calls back with the complete, fresh settings whenever any of them change
// (in any tab, the popup or the settings page).
export function watchSettings(callback) {
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") loadSettings().then(callback, () => {});
  });
}

// ─── Resume positions ─────────────────────────────────────────────────────────

const RESUME_PREFIX = "resume:";
const RESUME_MAX_AGE = 120 * 24 * 3600 * 1000; // a semester and a bit

export async function getResumePosition(key) {
  const entry = (await ext.storage.local.get(RESUME_PREFIX + key))[RESUME_PREFIX + key];
  return entry && Date.now() - entry.at < RESUME_MAX_AGE ? entry : null;
}

export function setResumePosition(key, time, duration) {
  return ext.storage.local.set({ [RESUME_PREFIX + key]: { time, duration, at: Date.now() } });
}

export function clearResumePosition(key) {
  return ext.storage.local.remove(RESUME_PREFIX + key);
}

export async function clearResumePositions({ olderThan = 0 } = {}) {
  const all = await ext.storage.local.get(null);
  const stale = Object.keys(all).filter(
    (k) => k.startsWith(RESUME_PREFIX) && Date.now() - (all[k]?.at || 0) >= olderThan,
  );
  if (stale.length) await ext.storage.local.remove(stale);
  return stale.length;
}

export function pruneResumePositions() {
  return clearResumePositions({ olderThan: RESUME_MAX_AGE });
}

export async function countResumePositions() {
  const all = await ext.storage.local.get(null);
  return Object.keys(all).filter((k) => k.startsWith(RESUME_PREFIX)).length;
}
