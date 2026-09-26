import assert from "node:assert/strict";
import { test } from "node:test";
import { accumulateSkip, computeSkip, formatSkipTotal } from "../src/shared/playback.js";

test("a normal skip moves the full amount", () => {
  assert.deepEqual(computeSkip(60, 600, -10), { time: 50, moved: -10, blocked: false });
  assert.deepEqual(computeSkip(60, 600, 10), { time: 70, moved: 10, blocked: false });
});

test("skipping back near the start stops at 0 and reports the real distance", () => {
  assert.deepEqual(computeSkip(4, 600, -10), { time: 0, moved: -4, blocked: false });
});

test("skipping back at the very start is blocked", () => {
  assert.equal(computeSkip(0, 600, -10).blocked, true);
  assert.equal(computeSkip(0.01, 600, -10).blocked, true);
});

test("skipping forward at the end is blocked; near the end it stops at the end", () => {
  assert.equal(computeSkip(600, 600, 10).blocked, true);
  assert.deepEqual(computeSkip(595, 600, 10), { time: 600, moved: 5, blocked: false });
});

test("unknown duration (still loading / live) doesn't clamp forward skips", () => {
  assert.deepEqual(computeSkip(30, NaN, 10), { time: 40, moved: 10, blocked: false });
  assert.deepEqual(computeSkip(30, Infinity, 10), { time: 40, moved: 10, blocked: false });
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

import {
  formatSpeed,
  formatTime,
  isResumable,
  kalturaEntryId,
  nextSpeed,
  resumeKey,
} from "../src/shared/playback.js";

test("nextSpeed steps on a 0.25 grid, within 0.25–4", () => {
  assert.equal(nextSpeed(1, +1, 0.25), 1.25);
  assert.equal(nextSpeed(1.25, -1, 0.25), 1);
  assert.equal(nextSpeed(3.75, +1, 0.25), 4);
  assert.equal(nextSpeed(4, +1, 0.25), 4);
  assert.equal(nextSpeed(0.25, -1, 0.25), 0.25);
});

test("nextSpeed with 0.1 steps has no floating-point drift", () => {
  let rate = 1;
  for (let i = 0; i < 7; i++) rate = nextSpeed(rate, +1, 0.1);
  assert.equal(rate, 1.7);
  for (let i = 0; i < 7; i++) rate = nextSpeed(rate, -1, 0.1);
  assert.equal(rate, 1);
});

test("nextSpeed snaps an off-grid speed to the next grid value", () => {
  assert.equal(nextSpeed(1.3, +1, 0.25), 1.5);
  assert.equal(nextSpeed(1.3, -1, 0.25), 1.25);
  assert.equal(nextSpeed(NaN, +1, 0.25), 1.25);
});

test("formatSpeed", () => {
  assert.equal(formatSpeed(1), "1×");
  assert.equal(formatSpeed(1.5), "1.5×");
  assert.equal(formatSpeed(1.25), "1.25×");
  assert.equal(formatSpeed(1.7000000000000002), "1.7×");
});

test("formatTime", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(75.9), "1:15");
  assert.equal(formatTime(3723), "1:02:03");
});

test("isResumable skips the first and last 30 s", () => {
  assert.equal(isResumable(10, 6000), false);
  assert.equal(isResumable(600, 6000), true);
  assert.equal(isResumable(5980, 6000), false);
  assert.equal(isResumable(600, NaN), true);
});

test("resumeKey prefers Kaltura's entry id", () => {
  assert.equal(
    resumeKey({
      pageUrl:
        "https://kaltura-kaf.edu.kuleuven.cloud/browseandembed/index/media-redirect/entryid/1_u30ck2k0/show",
      duration: 6821,
    }),
    "kaltura:1_u30ck2k0",
  );
  assert.equal(
    resumeKey({
      pageUrl: "https://x.example/player",
      manifestUrl: "https://cdn/p/1/playManifest/entryId/0_AbC123/format/applehttp/a.m3u8",
    }),
    "kaltura:0_abc123",
  );
  assert.equal(
    resumeKey({ pageUrl: "http://localhost:8123/?toolTitle=x", duration: 120.08 }),
    "page:localhost:8123/:120",
  );
});

test("kalturaEntryId finds the recording in page and stream URLs", () => {
  assert.equal(
    kalturaEntryId("https://cdn/p/1/playManifest/entryId/0_AbC123/format/applehttp/a.m3u8"),
    "0_abc123",
  );
  assert.equal(
    kalturaEntryId(
      "https://cfvod.kaltura.com/hls/p/1/sp/100/serveFlavor/entryId/1_x9/v/1/flavorId/0_f/index.m3u8",
    ),
    "1_x9",
  );
  assert.equal(kalturaEntryId("https://example.edu/video/index.m3u8"), null);
  assert.equal(kalturaEntryId(null), null);
});
