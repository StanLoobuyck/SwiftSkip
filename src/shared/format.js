// Progress text shared by the in-page download panel and the popup.

export function formatBytesPerSecond(bytesPerSecond) {
  const mb = bytesPerSecond / 1e6;
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${Math.round(bytesPerSecond / 1e3)} kB/s`;
}

export function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s left`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min left` : `${Math.floor(minutes / 60)} h ${minutes % 60} min left`;
}

// e.g. "45% · 3.2 MB/s · 2 min left", or the error text when a download failed.
export function formatProgressMeta(state) {
  if (state.error) return state.error;
  const percent = Math.max(0, Math.min(100, Math.round(Number(state.percent) || 0)));
  const parts = [`${percent}%`];
  if (state.phase === "Downloading" && state.speed > 0) {
    parts.push(formatBytesPerSecond(state.speed));
    const eta = formatEta(state.eta);
    if (eta) parts.push(eta);
  }
  return parts.join(" · ");
}
