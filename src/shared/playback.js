// Playback math — pure functions, no DOM (unit-tested in test/).

// Where a skip of `seconds` from `currentTime` lands, clamped to the video.
// `moved` is how far it actually went (less than `seconds` near the edges).
export function computeSkip(currentTime, duration, seconds) {
  const end = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  const time = Math.min(end, Math.max(0, currentTime + seconds));
  const moved = time - currentTime;
  return {
    time,
    moved,
    // Already at the edge in the skip direction: nothing to do.
    blocked: Math.abs(moved) < 0.05,
    edge: time <= 0 ? "start" : time >= end ? "end" : null,
  };
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
