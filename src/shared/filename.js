// Download filenames — pure functions (unit-tested in test/).

const MAX_LENGTH = 100;

export function sanitizeFilename(title) {
  const fallback = "lecture";
  let safeTitle = String(title || fallback)
    // eslint-disable-next-line no-control-regex -- control characters are exactly what we strip
    .replace(/[\x00-\x1f]/g, " ") // tabs, newlines, …
    .replace(/\s*:\s*/g, " - ") // "Les 1: intro" reads better as "Les 1 - intro"
    .replace(/[<>"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  if (safeTitle.length > MAX_LENGTH) {
    // Cut at a word boundary when there is one reasonably close.
    const cut = safeTitle.slice(0, MAX_LENGTH);
    const lastSpace = cut.lastIndexOf(" ");
    safeTitle = (lastSpace > MAX_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.-]+$/, "");
  }
  return safeTitle || fallback;
}

// "Digitale signaalverwerking [H01L6a] • ULTRA-B-KUL-H01L6a-2627"
//   → { name: "Digitale signaalverwerking", code: "H01L6a" }
export function parseCourseTitle(text) {
  const match = /^\s*(.+?)\s*\[([A-Z0-9]{4,10})\]/i.exec(String(text || ""));
  return match ? { name: match[1], code: match[2] } : null;
}

// Builds the lecture's file title from what Toledo shows around the player:
//   course    "Digitale signaalverwerking"            (breadcrumb)
//   lecture   "Les 1 (2026-09-23): signaaltransformaties…"   (Toledo item title)
//   recording "Aula A Celestijnenlaan 200C 2026-09-23 08:34" (Kaltura entry name)
// Falls back to whatever is known; adds the recording date if the lecture
// title has none, so files sort and stay distinguishable.
export function buildLectureTitle({ course, lecture, recording } = {}) {
  const dateOf = (text) => /\b(\d{4}-\d{2}-\d{2})\b/.exec(text || "")?.[1];

  let main = lecture || recording || "";
  const recordingDate = dateOf(recording);
  if (lecture && !dateOf(lecture) && recordingDate) {
    main = `${lecture} (${recordingDate})`;
  }

  const parts = [course, main].filter((part) => part && part.trim());
  // Don't repeat the course if the lecture title already starts with it.
  if (parts.length === 2 && parts[1].toLowerCase().startsWith(parts[0].toLowerCase())) {
    parts.shift();
  }
  return parts.join(" - ");
}
