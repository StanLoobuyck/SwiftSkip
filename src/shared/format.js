// Progress text shared by the in-page download panel and the popup.

import { errorText, formatNumber, t } from "./i18n.js";

export function formatBytesPerSecond(bytesPerSecond) {
  const mb = bytesPerSecond / 1e6;
  return mb >= 1
    ? `${formatNumber(Math.round(mb * 10) / 10, 1)} MB/s`
    : `${Math.round(bytesPerSecond / 1e3)} kB/s`;
}

export function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return t("secondsLeft", { n: Math.max(1, Math.round(seconds)) });
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? t("minutesLeft", { n: minutes })
    : t("hoursLeft", { h: Math.floor(minutes / 60), m: minutes % 60 });
}

// e.g. "45% · 3.2 MB/s · 2 min left", or the error text when a download failed.
export function formatProgressMeta(state) {
  if (state.error || state.errorCode) return errorText(state);
  const percent = Math.max(0, Math.min(100, Math.round(Number(state.percent) || 0)));
  const parts = [`${percent}%`];
  if (state.phase === "Downloading" && state.speed > 0) {
    parts.push(formatBytesPerSecond(state.speed));
    const eta = formatEta(state.eta);
    if (eta) parts.push(eta);
  }
  return parts.join(" · ");
}
