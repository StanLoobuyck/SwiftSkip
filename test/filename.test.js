import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeFilename } from "../src/shared/filename.js";

test("sanitizeFilename replaces characters that are illegal in filenames", () => {
  assert.equal(sanitizeFilename('HC1: EBS / "intro"?'), "HC1_ EBS _ _intro__");
});

test("sanitizeFilename collapses whitespace and caps length at 100", () => {
  assert.equal(sanitizeFilename("  a    b  "), "a b");
  assert.equal(sanitizeFilename("x".repeat(250)).length, 100);
});

test("sanitizeFilename falls back to 'lecture'", () => {
  assert.equal(sanitizeFilename(""), "lecture");
  assert.equal(sanitizeFilename(null), "lecture");
  assert.equal(sanitizeFilename("   "), "lecture");
});
