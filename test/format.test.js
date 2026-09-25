import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBytesPerSecond, formatEta, formatProgressMeta } from "../src/shared/format.js";

test("formatBytesPerSecond", () => {
  assert.equal(formatBytesPerSecond(3_240_000), "3.2 MB/s");
  assert.equal(formatBytesPerSecond(640_000), "640 kB/s");
});

test("formatEta", () => {
  assert.equal(formatEta(0.2), "1 s left");
  assert.equal(formatEta(42), "42 s left");
  assert.equal(formatEta(125), "2 min left");
  assert.equal(formatEta(3 * 3600 + 5 * 60), "3 h 5 min left");
  assert.equal(formatEta(null), "");
  assert.equal(formatEta(NaN), "");
});

test("formatProgressMeta shows speed and time left only while downloading", () => {
  assert.equal(
    formatProgressMeta({ phase: "Downloading", percent: 45.4, speed: 3_200_000, eta: 130 }),
    "45% · 3.2 MB/s · 2 min left",
  );
  assert.equal(formatProgressMeta({ phase: "Converting to MP4", percent: 80, speed: 3_200_000 }), "80%");
  assert.equal(formatProgressMeta({ phase: "Downloading", percent: 0, speed: 0 }), "0%");
});

test("formatProgressMeta shows the error when there is one", () => {
  assert.equal(
    formatProgressMeta({ phase: "Download failed", percent: 30, error: "Could not fetch segment 3/80 (HTTP 403)." }),
    "Could not fetch segment 3/80 (HTTP 403).",
  );
});
