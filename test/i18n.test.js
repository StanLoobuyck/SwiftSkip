import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { LANGUAGES, errorText, formatNumber, phaseLabel, resolveLanguage, setLanguage, t } from "../src/shared/i18n.js";

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("English and Dutch have exactly the same keys", () => {
  const en = Object.keys(LANGUAGES.en).sort();
  const nl = Object.keys(LANGUAGES.nl).sort();
  assert.deepEqual(nl.filter((k) => !en.includes(k)), [], "only in nl");
  assert.deepEqual(en.filter((k) => !nl.includes(k)), [], "missing in nl");
});

test("…with the same {placeholders}, and no empty texts", () => {
  for (const [key, text] of Object.entries(LANGUAGES.en)) {
    assert.ok(text.trim(), `en.${key} is empty`);
    assert.ok(LANGUAGES.nl[key].trim(), `nl.${key} is empty`);
    assert.deepEqual(placeholders(LANGUAGES.nl[key]), placeholders(text), key);
  }
});

test("every key used in the code exists", () => {
  const files = [
    "src/popup/popup.js", "src/popup/popup.html", "src/options/options.js", "src/options/options.html",
    "src/welcome/welcome.js", "src/welcome/welcome.html", "src/content/content.js", "src/content/overlays.js",
    "src/shared/format.js", "src/shared/shortcuts.js", "src/shared/i18n.js",
  ];
  const used = new Set();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/\bt\("(\w+)"/g)) used.add(m[1]);
    for (const m of source.matchAll(/data-i18n(?:-title|-aria-label)?="(\w+)"/g)) used.add(m[1]);
    for (const m of source.matchAll(/errorCode: "(\w+)"/g)) used.add(m[1]);
  }
  for (const m of readFileSync("src/shared/shortcuts.js", "utf8").matchAll(/action\("\w+", "(\w+)"/g)) used.add(m[1]);
  for (const m of readFileSync("src/shared/i18n.js", "utf8").matchAll(/: "(phase\w+)"/g)) used.add(m[1]);
  for (const file of ["src/shared/hls.js", "src/shared/downloader.js", "src/offscreen/offscreen.js"]) {
    for (const m of readFileSync(file, "utf8").matchAll(/"(err[A-Z]\w+)"/g)) used.add(m[1]);
  }
  const missing = [...used].filter((key) => !(key in LANGUAGES.en) && !(`${key}_one` in LANGUAGES.en));
  assert.deepEqual(missing, []);
});

test("resolveLanguage: auto follows the browser; only Dutch browsers get Dutch", () => {
  assert.equal(resolveLanguage("auto", "nl-BE"), "nl");
  assert.equal(resolveLanguage("auto", "nl"), "nl");
  assert.equal(resolveLanguage("auto", "fr-BE"), "en");
  assert.equal(resolveLanguage("auto", undefined), "en");
  assert.equal(resolveLanguage("nl", "en-US"), "nl");
  assert.equal(resolveLanguage("en", "nl-BE"), "en");
});

test("t fills placeholders and picks singular/plural", () => {
  setLanguage("en");
  assert.equal(t("resumedAt", { time: "1:05" }), "Resumed at 1:05");
  assert.equal(t("forgetPositions", { count: 1 }), "Forget 1 saved position");
  assert.equal(t("forgetPositions", { count: 3 }), "Forget 3 saved positions");
  assert.equal(t("doesNotExist"), "doesNotExist");
  setLanguage("nl");
  assert.equal(t("resumedAt", { time: "1:05" }), "Verder vanaf 1:05");
  assert.equal(t("forgetPositions", { count: 3 }), "3 opgeslagen posities vergeten");
  setLanguage("en");
});

test("numbers, phases and errors follow the language", () => {
  setLanguage("nl");
  assert.equal(formatNumber(1.5), "1,5");
  assert.equal(phaseLabel("Converting to MP4"), "Omzetten naar MP4");
  assert.equal(
    errorText({ error: "Could not fetch segment 3/80 (HTTP 403).", errorCode: "errFetchSegment", errorParams: { n: 3, total: 80, status: 403 } }),
    "Kon deel 3/80 niet ophalen (HTTP 403).",
  );
  setLanguage("en");
  assert.equal(formatNumber(1.5), "1.5");
  assert.equal(errorText({ error: "Something odd" }), "Something odd", "uncoded errors show as they are");
});
