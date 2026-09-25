export function sanitizeFilename(title) {
  const fallback = "lecture";
  const safeTitle = String(title || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return safeTitle || fallback;
}
