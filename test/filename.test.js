import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLectureTitle, parseCourseTitle, sanitizeFilename } from "../src/shared/filename.js";

test("sanitizeFilename replaces characters that are illegal in filenames", () => {
  assert.equal(sanitizeFilename('EBS / "intro"?'), "EBS _ _intro__");
});

test("sanitizeFilename turns 'a: b' into 'a - b'", () => {
  assert.equal(sanitizeFilename("Les 1 (2026-09-23): intro"), "Les 1 (2026-09-23) - intro");
  assert.equal(sanitizeFilename("HC1:intro"), "HC1 - intro");
});

test("sanitizeFilename turns tabs/newlines into spaces", () => {
  assert.equal(sanitizeFilename("HC1\n\tintro"), "HC1 intro");
});

test("sanitizeFilename collapses whitespace", () => {
  assert.equal(sanitizeFilename("  a    b  "), "a b");
});

test("sanitizeFilename caps length at 100, at a word boundary when possible", () => {
  assert.equal(sanitizeFilename("x".repeat(250)).length, 100);
  const long =
    "Digitale signaalverwerking - Les 1 (2026-09-23) - signaaltransformaties en frequentiebeschrijving deel twee";
  const result = sanitizeFilename(long);
  assert.ok(result.length <= 100);
  assert.ok(long.startsWith(result));
  assert.ok(!result.endsWith(" "));
  assert.equal(
    result,
    "Digitale signaalverwerking - Les 1 (2026-09-23) - signaaltransformaties en frequentiebeschrijving",
  );
});

test("sanitizeFilename falls back to 'lecture'", () => {
  assert.equal(sanitizeFilename(""), "lecture");
  assert.equal(sanitizeFilename(null), "lecture");
  assert.equal(sanitizeFilename("   "), "lecture");
});

test("parseCourseTitle reads Toledo's course breadcrumb", () => {
  assert.deepEqual(parseCourseTitle("Digitale signaalverwerking [H01L6a] • ULTRA-B-KUL-H01L6a-2627"), {
    name: "Digitale signaalverwerking",
    code: "H01L6a",
  });
  assert.deepEqual(parseCourseTitle("Elektronische basisschakelingen: hoorcollege [H01M3a]"), {
    name: "Elektronische basisschakelingen: hoorcollege",
    code: "H01M3a",
  });
  assert.equal(parseCourseTitle("Hoorcolleges"), null);
  assert.equal(parseCourseTitle(null), null);
});

test("buildLectureTitle: course + lecture title (which has a date)", () => {
  assert.equal(
    buildLectureTitle({
      course: "Digitale signaalverwerking",
      lecture: "Les 1 (2026-09-23): signaaltransformaties en frequentiebeschrijving",
      recording: "Aula A Celestijnenlaan 200C 2026-09-23 08:34",
    }),
    "Digitale signaalverwerking - Les 1 (2026-09-23): signaaltransformaties en frequentiebeschrijving",
  );
});

test("buildLectureTitle adds the recording date when the lecture title has none", () => {
  assert.equal(
    buildLectureTitle({ course: "EBS", lecture: "HC1", recording: "Aula 200L 00.06 2026-09-22 10:37" }),
    "EBS - HC1 (2026-09-22)",
  );
});

test("buildLectureTitle falls back to what is known", () => {
  assert.equal(buildLectureTitle({ recording: "Aula 200L 2026-09-22 10:37" }), "Aula 200L 2026-09-22 10:37");
  assert.equal(buildLectureTitle({ course: "EBS", recording: "Aula 200L" }), "EBS - Aula 200L");
  assert.equal(buildLectureTitle({}), "");
  assert.equal(buildLectureTitle(), "");
});

test("buildLectureTitle doesn't repeat the course", () => {
  assert.equal(buildLectureTitle({ course: "EBS", lecture: "EBS HC1 (2026-09-22)" }), "EBS HC1 (2026-09-22)");
});

test("the full pipeline gives a clean filename", () => {
  const title = buildLectureTitle({
    course: "Digitale signaalverwerking",
    lecture: "Les 1 (2026-09-23): signaaltransformaties en frequentiebeschrijving",
    recording: "Aula A Celestijnenlaan 200C 2026-09-23 08:34",
  });
  assert.equal(
    sanitizeFilename(title),
    "Digitale signaalverwerking - Les 1 (2026-09-23) - signaaltransformaties en frequentiebeschrijving",
  );
});
