// Playback math — pure functions, no DOM (unit-tested in test/).

// Where a skip of `seconds` from `currentTime` lands, clamped to the video.
// `moved` is how far it actually went (less than `seconds` near the edges).
export function computeSkip(currentTime, duration, seconds) {
  const end = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  const time = Math.min(end, Math.max(0, currentTime + seconds));
  const moved = time - currentTime;
  // Already at the edge in the skip direction: nothing to do.
  return { time, moved, blocked: Math.abs(moved) < 0.05 };
}

// Running total shown while skips are chained (+10s, +20s, …). Starts over
// when the direction changes, like YouTube.
export function accumulateSkip(total, moved) {
  if (total !== 0 && Math.sign(total) !== Math.sign(moved)) return moved;
  return total + moved;
}

// "+20s" / "−4s" (typographic minus, rounded to whole seconds).
export function formatSkipTotal(total) {
  const rounded = Math.round(total);
  if (rounded === 0) return "0s";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}s`;
}

// ─── Speed ────────────────────────────────────────────────────────────────────

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

// One step faster/slower on a grid of `step` (0.25 or 0.1). A speed that's
// off the grid (e.g. 1.3× set by the player) first snaps to the next grid value.
export function nextSpeed(current, direction, step) {
  const rate = Number.isFinite(current) && current > 0 ? current : 1;
  const onGrid = Math.round(rate / step) * step;
  let next;
  if (direction > 0) next = onGrid > rate + 1e-6 ? onGrid : onGrid + step;
  else next = onGrid < rate - 1e-6 ? onGrid : onGrid - step;
  next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, next));
  return Math.round(next * 100) / 100;
}

// 1 → "1×", 1.5 → "1.5×", 1.25 → "1.25×"
export function formatSpeed(rate) {
  return `${Number((Math.round(rate * 100) / 100).toFixed(2))}×`;
}

// ─── Resume ───────────────────────────────────────────────────────────────────

// 75 → "1:15", 3723 → "1:02:03"
export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const RESUME_MIN = 30; // don't bother resuming the first 30 s …
const RESUME_END_MARGIN = 30; // … or the last 30 s (treated as finished)

// Is `time` worth remembering / resuming to, in a video of `duration`?
export function isResumable(time, duration) {
  if (!Number.isFinite(time) || time < RESUME_MIN) return false;
  if (Number.isFinite(duration) && duration > 0 && time > duration - RESUME_END_MARGIN) return false;
  return true;
}

// Stable per-lecture key: Kaltura's entry id when we can find it (the same
// lecture opened from different pages), else this page + the video's length.
export function resumeKey({ pageUrl, manifestUrl, duration }) {
  const entry = /entry_?id[/=]([01]_[a-z0-9]+)/i.exec(`${pageUrl} ${manifestUrl || ""}`);
  if (entry) return `kaltura:${entry[1].toLowerCase()}`;
  const url = new URL(pageUrl);
  return `page:${url.host}${url.pathname}:${Math.round(duration || 0)}`;
}
