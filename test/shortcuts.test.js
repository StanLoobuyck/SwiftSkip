import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTION_IDS,
  DEFAULT_SHORTCUTS,
  bindingParts,
  buildShortcutMap,
  eventToBinding,
  findAction,
  formatBinding,
  migrateLegacyKeybinds,
  normalizeShortcuts,
} from "../src/shared/shortcuts.js";

// Minimal KeyboardEvent stand-in.
const key = (
  k,
  { code = "", ctrl = false, alt = false, shift = false, meta = false, altGraph = false } = {},
) => ({
  key: k,
  code,
  ctrlKey: ctrl,
  altKey: alt,
  shiftKey: shift,
  metaKey: meta,
  getModifierState: (m) => m === "AltGraph" && altGraph,
});

test("letters are lower-cased; Shift counts for letters", () => {
  assert.equal(eventToBinding(key("k")), "k");
  assert.equal(eventToBinding(key("K", { shift: true })), "Shift+k");
  assert.equal(eventToBinding(key("K")), "k", "Caps Lock alone doesn't make it a different shortcut");
});

test("Space and named keys, with modifiers", () => {
  assert.equal(eventToBinding(key(" ")), "Space");
  assert.equal(eventToBinding(key("ArrowRight", { shift: true })), "Shift+ArrowRight");
  assert.equal(eventToBinding(key("m", { ctrl: true, alt: true })), "Ctrl+Alt+m");
});

test("Shift is ignored for symbols and digits (it's how they're typed)", () => {
  assert.equal(eventToBinding(key("?", { shift: true })), "?");
  assert.equal(eventToBinding(key("1", { shift: true })), "1", "AZERTY number row");
  assert.equal(eventToBinding(key(">", { shift: true })), ">");
});

test("AltGr is not treated as Ctrl+Alt (AZERTY [ ] on Windows)", () => {
  assert.equal(eventToBinding(key("[", { ctrl: true, alt: true, altGraph: true })), "[");
});

test("modifier-only and dead keys produce no binding", () => {
  for (const k of ["Shift", "Control", "Alt", "Meta", "Dead", "AltGraph"]) {
    assert.equal(eventToBinding(key(k)), null, k);
  }
});

test("findAction matches the defaults", () => {
  const map = buildShortcutMap(DEFAULT_SHORTCUTS);
  assert.equal(findAction(map, key(" ")), "play_pause");
  assert.equal(findAction(map, key("k")), "play_pause");
  assert.equal(findAction(map, key("ArrowLeft")), "skip_backward");
  assert.equal(findAction(map, key("?", { shift: true })), "show_shortcuts");
  assert.equal(findAction(map, key("5")), "seek_50");
  assert.equal(findAction(map, key("x")), null);
  assert.equal(findAction(map, key("k", { ctrl: true })), null, "Ctrl+K is the browser's, not ours");
});

test("AZERTY: the keys right of P (^ and $) act as [ and ]", () => {
  const map = buildShortcutMap(DEFAULT_SHORTCUTS);
  assert.equal(findAction(map, key("Dead", { code: "BracketLeft" })), "speed_down");
  assert.equal(findAction(map, key("$", { code: "BracketRight" })), "speed_up");
});

test("AZERTY: the number row works without Shift", () => {
  const map = buildShortcutMap(DEFAULT_SHORTCUTS);
  assert.equal(findAction(map, key("&", { code: "Digit1" })), "seek_10");
  assert.equal(findAction(map, key("à", { code: "Digit0" })), "seek_0");
  assert.equal(findAction(map, key("&", { code: "Digit1", ctrl: true })), null);
});

test("normalizeShortcuts fills in missing actions and drops junk", () => {
  const result = normalizeShortcuts({
    mute: ["x", "y", "z"],
    skip_forward: [],
    bogus: ["q"],
    fullscreen: "f",
  });
  assert.deepEqual(Object.keys(result), ACTION_IDS);
  assert.deepEqual(result.mute, ["x", "y"], "max 2 keys per action");
  assert.deepEqual(result.skip_forward, [], "explicitly cleared stays cleared");
  assert.deepEqual(result.fullscreen, ["f"], "malformed → default");
  assert.deepEqual(result.play_pause, ["Space", "k"]);
});

test("migrateLegacyKeybinds keeps the user's changes from ≤ 3.2", () => {
  const result = migrateLegacyKeybinds({ pause_play: "p", mute: null, skip_forward: "L", speed_up_alt: "$" });
  assert.deepEqual(result.play_pause, ["p", "k"]);
  assert.deepEqual(result.mute, []);
  assert.deepEqual(result.skip_forward, ["l"]);
  assert.deepEqual(result.speed_up, ["]", ">"]);
  assert.deepEqual(migrateLegacyKeybinds(undefined), normalizeShortcuts(null));
});

test("formatBinding for display", () => {
  assert.equal(formatBinding("Shift+ArrowRight"), "Shift + →");
  assert.equal(formatBinding("Space"), "Space");
  assert.equal(formatBinding("k"), "K");
  assert.deepEqual(bindingParts("Ctrl++"), ["Ctrl", "+"]);
  assert.deepEqual(bindingParts(""), []);
});
