import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/shared/settings.js";

test("empty storage gives the defaults", () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
});

test("invalid values fall back to defaults", () => {
  const s = normalizeSettings({ skipSeconds: 7, speedStep: 0.3, enabled: "yes", preferredSpeed: 9 });
  assert.equal(s.skipSeconds, 10);
  assert.equal(s.speedStep, 0.25);
  assert.equal(s.enabled, true);
  assert.equal(s.preferredSpeed, 1);
});

test("valid values are kept", () => {
  const s = normalizeSettings({ skipSeconds: 30, speedStep: 0.1, enabled: false, preferredSpeed: 1.75, resumePlayback: false });
  assert.equal(s.skipSeconds, 30);
  assert.equal(s.speedStep, 0.1);
  assert.equal(s.enabled, false);
  assert.equal(s.preferredSpeed, 1.75);
  assert.equal(s.resumePlayback, false);
});

test("old 'keybinds' are migrated when there are no 'shortcuts' yet", () => {
  assert.deepEqual(normalizeSettings({ keybinds: { mute: "q" } }).shortcuts.mute, ["q"]);
  assert.deepEqual(
    normalizeSettings({ keybinds: { mute: "q" }, shortcuts: { mute: ["z"] } }).shortcuts.mute,
    ["z"],
    "new format wins",
  );
});
