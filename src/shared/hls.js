// HLS playlist parsing — pure functions, no browser APIs (unit-tested in test/).

import { CodedError } from "./errors.js";

export function resolveUrl(baseUrl, value) {
  return new URL(value.trim().replace(/^"|"$/g, ""), baseUrl).toString();
}

export function parseAttributes(line) {
  const attrs = {};
  const attrText = line.slice(line.indexOf(":") + 1);
  const parts = attrText.match(/(?:[^,"]+|"[^"]*")+/g) || [];
  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    if (!key || !rest.length) continue;
    attrs[key.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
  }
  return attrs;
}

function getLines(manifestText) {
  return manifestText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// Returns the highest-bandwidth variant of a master playlist, or null if the
// text is already a media playlist.
export function chooseBestVariant(manifestText, manifestUrl) {
  const lines = getLines(manifestText);
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
    const nextLine = lines.slice(i + 1).find((line) => !line.startsWith("#"));
    if (!nextLine) continue;
    const attrs = parseAttributes(lines[i]);
    variants.push({
      bandwidth: Number(attrs.BANDWIDTH || attrs["AVERAGE-BANDWIDTH"] || 0),
      url: resolveUrl(manifestUrl, nextLine),
    });
  }
  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return variants[0] || null;
}

export function parseMediaPlaylist(manifestText, manifestUrl) {
  const lines = getLines(manifestText);

  const encrypted = lines.some(
    (line) => line.startsWith("#EXT-X-KEY") && !/METHOD=NONE/i.test(line),
  );
  if (encrypted) {
    throw new CodedError("errEncrypted", {}, "Encrypted HLS streams are not supported by the in-browser remuxer.");
  }

  if (lines.some((line) => line.startsWith("#EXT-X-MAP"))) {
    throw new CodedError("errFmp4", {}, "Fragmented MP4 HLS streams are not supported by the TS downloader.");
  }

  const segments = lines
    .filter((line) => !line.startsWith("#"))
    .map((line) => resolveUrl(manifestUrl, line));

  if (!segments.length) {
    throw new CodedError("errNoSegments", {}, "No media segments were found in the HLS playlist.");
  }

  return segments;
}

export function isLectureManifestUrl(url) {
  if (!url || typeof url !== "string") return false;
  const lowerUrl = url.toLowerCase();

  return (
    lowerUrl.includes(".m3u8") ||
    (lowerUrl.includes("playmanifest") && lowerUrl.includes("format/applehttp"))
  );
}
