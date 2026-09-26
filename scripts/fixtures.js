// Generates the local test media in test/fixtures/media/ (needs ffmpeg).
// A 2-minute test video with a running clock (so skips are easy to verify),
// as a plain MP4 for the <video> and as an HLS stream for the downloader.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MEDIA = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "media");

export function fixturesExist() {
  return existsSync(join(MEDIA, "lecture.mp4")) && existsSync(join(MEDIA, "hls", "index.m3u8"));
}

export function generateFixtures() {
  mkdirSync(join(MEDIA, "hls"), { recursive: true });
  const input = [
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=25:duration=120",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=120",
  ];
  const encode = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-c:a", "aac", "-b:a", "64k"];
  const run = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

  run([...input, ...encode, "-movflags", "+faststart", join(MEDIA, "lecture.mp4")]);
  run([
    ...input,
    ...encode,
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    join(MEDIA, "hls", "seg%03d.ts"),
    join(MEDIA, "hls", "index.m3u8"),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateFixtures();
  console.log(`✔ test media written to ${MEDIA}`);
}
