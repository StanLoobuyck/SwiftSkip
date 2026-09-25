import assert from "node:assert/strict";
import { test } from "node:test";
import { accumulateSkip, computeSkip, formatSkipTotal } from "../src/shared/playback.js";

test("a normal skip moves the full amount", () => {
  assert.deepEqual(computeSkip(60, 600, -10), { time: 50, moved: -10, blocked: false, edge: null });
  assert.deepEqual(computeSkip(60, 600, 10), { time: 70, moved: 10, blocked: false, edge: null });
});

test("skipping back near the start stops at 0 and reports the real distance", () => {
  assert.deepEqual(computeSkip(4, 600, -10), { time: 0, moved: -4, blocked: false, edge: "start" });
});

test("skipping back at the very start is blocked", () => {
  assert.equal(computeSkip(0, 600, -10).blocked, true);
  assert.equal(computeSkip(0.01, 600, -10).blocked, true);
  assert.equal(computeSkip(0, 600, -10).edge, "start");
});

test("skipping forward at the end is blocked; near the end it stops at the end", () => {
  assert.equal(computeSkip(600, 600, 10).blocked, true);
  assert.deepEqual(computeSkip(595, 600, 10), { time: 600, moved: 5, blocked: false, edge: "end" });
});

test("unknown duration (still loading / live) doesn't clamp forward skips", () => {
  assert.deepEqual(computeSkip(30, NaN, 10), { time: 40, moved: 10, blocked: false, edge: null });
  assert.deepEqual(computeSkip(30, Infinity, 10), { time: 40, moved: 10, blocked: false, edge: null });
});

test("chained skips add up, and start over when the direction changes", () => {
  let total = 0;
  total = accumulateSkip(total, 10);
  total = accumulateSkip(total, 10);
  assert.equal(total, 20);
  total = accumulateSkip(total, -10);
  assert.equal(total, -10);
  total = accumulateSkip(total, -4);
  assert.equal(total, -14);
});

test("formatSkipTotal", () => {
  assert.equal(formatSkipTotal(20), "+20s");
  assert.equal(formatSkipTotal(-4.4), "−4s");
  assert.equal(formatSkipTotal(0.3), "0s");
});
