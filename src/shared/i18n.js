// Translations. Both languages are bundled (rather than the browser's i18n
// API) so the language can be switched in SwiftSkip's settings, not only via
// the browser's own language. Texts: src/i18n/<lang>.json.
//
//   t("resumedAt", { time: "1:05" })          → "Resumed at 1:05"
//   t("forgetPositions", { count: 3 })        → uses forgetPositions_one/_other

import en from "../i18n/en.json" with { type: "json" };
import nl from "../i18n/nl.json" with { type: "json" };

export const LANGUAGES = { en, nl };
export const LANGUAGE_OPTIONS = ["auto", "en", "nl"];
export const LANGUAGE_NAMES = { en: "English", nl: "Nederlands" };

let messages = en;
let current = "en";

// "auto" follows the browser's language; anything not Dutch gets English.
export function resolveLanguage(preference, browserLanguage) {
  if (preference === "en" || preference === "nl") return preference;
  return String(browserLanguage || "").toLowerCase().startsWith("nl") ? "nl" : "en";
}

function browserLanguage() {
  const api = globalThis.browser ?? globalThis.chrome;
  return api?.i18n?.getUILanguage?.() || globalThis.navigator?.language || "en";
}

export function setLanguage(preference) {
  current = resolveLanguage(preference, browserLanguage());
  messages = LANGUAGES[current];
  return current;
}

export function getLanguage() {
  return current;
}

export function t(key, params = {}) {
  const pluralKey = typeof params.count === "number" ? `${key}_${params.count === 1 ? "one" : "other"}` : null;
  const text =
    (pluralKey && (messages[pluralKey] ?? en[pluralKey])) ?? messages[key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Number formatting in the current language (1.5 → "1,5" in Dutch).
export function formatNumber(value, maxDecimals = 2) {
  return new Intl.NumberFormat(current === "nl" ? "nl-BE" : "en-US", {
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

// Fills in [data-i18n] (text), [data-i18n-title], [data-i18n-aria-label]
// in static HTML.
export function localizePage(root = document) {
  document.documentElement.lang = current;
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  }
}

// ─── Download phases + errors ─────────────────────────────────────────────────
// The background reports phases by their English name and errors as
// { errorCode, errorParams } (+ an English `error` as fallback).

const PHASE_KEYS = {
  Preparing: "phasePreparing",
  "Reading playlist": "phaseReading",
  Downloading: "phaseDownloading",
  "Converting to MP4": "phaseConverting",
  Saving: "phaseSaving",
  Complete: "phaseComplete",
  Canceled: "phaseCanceled",
  Canceling: "phaseCanceling",
  "Download failed": "phaseFailed",
};

export function phaseLabel(phase) {
  return PHASE_KEYS[phase] ? t(PHASE_KEYS[phase]) : phase || "";
}

export function errorText(state) {
  if (!state) return "";
  if (state.errorCode) return t(state.errorCode, state.errorParams || {});
  return state.error || "";
}
