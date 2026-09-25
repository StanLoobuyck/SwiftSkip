// Runs the real downloader against a tiny fake Kaltura server.

import assert from "node:assert/strict";
import { resolveObjectURL } from "node:buffer";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { cancelHlsDownload, runHlsDownload } from "../src/shared/downloader.js";

const SEGMENTS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"];
const FAST = { retryDelay: 1 };
let server;
let base;
let slowSegments = false;
let flakyFailuresLeft = 0;
let realTsDir = null;
const requests = [];

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

before(async () => {
  // Real MPEG-TS segments for the MP4 conversion test (skipped without ffmpeg).
  if (hasFfmpeg()) {
    realTsDir = mkdtempSync(join(tmpdir(), "swiftskip-ts-"));
    execFileSync("ffmpeg", [
      "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=10:duration=6",
      "-f", "lavfi", "-i", "sine=duration=6",
      "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
      "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod",
      join(realTsDir, "index.m3u8"),
    ]);
  }

  server = createServer((req, res) => {
    requests.push(req.url);
    const media = (count) =>
      "#EXTM3U\n" + Array.from({ length: count }, (_, i) => `#EXTINF:6,\nseg${i}.ts`).join("\n") + "\n#EXT-X-ENDLIST\n";
    const routes = {
      "/master.m3u8": "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=900\nhigh.m3u8\n",
      "/high.m3u8": media(SEGMENTS.length),
      "/flaky.m3u8": "#EXTM3U\n#EXTINF:6,\nflaky.ts\n#EXT-X-ENDLIST\n",
      "/broken.m3u8": "#EXTM3U\n#EXTINF:6,\nseg0.ts\n#EXTINF:6,\nmissing.ts\n#EXT-X-ENDLIST\n",
    };

    const seg = /^\/seg(\d)\.ts$/.exec(req.url);
    const real = /^\/real\/(.+)$/.exec(req.url);
    if (routes[req.url]) {
      res.end(routes[req.url]);
    } else if (seg) {
      // Later segments answer faster, so they finish out of order.
      const delay = slowSegments ? 200 : (SEGMENTS.length - Number(seg[1])) * 5;
      setTimeout(() => res.end(SEGMENTS[seg[1]]), delay);
    } else if (req.url === "/flaky.ts") {
      if (flakyFailuresLeft-- > 0) res.writeHead(503).end();
      else res.end("OK!");
    } else if (real && realTsDir && existsSync(join(realTsDir, real[1]))) {
      res.end(readFileSync(join(realTsDir, real[1])));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  if (realTsDir) rmSync(realTsDir, { recursive: true, force: true });
});

function collect() {
  const saved = [];
  const progress = [];
  return {
    saved,
    progress,
    onProgress: (p) => progress.push(p),
    saveFile: async (url, title, extension) => {
      const blob = url.startsWith("blob:") ? resolveObjectURL(url) : null;
      saved.push({ url, title, extension, blob });
    },
  };
}

test("keeps segments in playlist order even when they arrive out of order", async () => {
  const c = collect();
  const result = await runHlsDownload({ url: `${base}/master.m3u8`, title: "HC1", tabId: 7, jobId: "order", ...FAST, ...c });

  // Fake segments aren't real video, so conversion fails and it falls back to .ts.
  assert.deepEqual(result, { ok: true, type: "ts" });
  assert.equal(c.saved.length, 1);
  assert.equal(await c.saved[0].blob.text(), SEGMENTS.join(""));

  const phases = c.progress.map((p) => p.phase);
  assert.equal(phases[0], "Reading playlist");
  assert.equal(phases.at(-1), "Complete");
  assert.ok(c.progress.every((p) => p.jobId === "order" && p.tabId === 7));
});

test("reports download speed and time remaining", async () => {
  const c = collect();
  await runHlsDownload({ url: `${base}/high.m3u8`, title: "HC", tabId: 7, jobId: "speed", ...FAST, ...c });

  const downloading = c.progress.filter((p) => p.phase === "Downloading" && p.downloaded > 0);
  assert.equal(downloading.length, SEGMENTS.length);
  assert.ok(downloading.every((p) => p.speed > 0 && Number.isFinite(p.eta)));
  assert.equal(downloading.at(-1).eta, 0);
});

test("fetches several segments at the same time", async () => {
  slowSegments = true;
  const started = Date.now();
  await runHlsDownload({ url: `${base}/high.m3u8`, title: "HC", tabId: 7, jobId: "parallel", ...FAST, ...collect() });
  slowSegments = false;
  // 6 segments × 200 ms would take 1.2 s one by one; 4 at a time needs 2 rounds.
  assert.ok(Date.now() - started < 800, `took ${Date.now() - started} ms`);
});

test("retries a failing segment before giving up", async () => {
  flakyFailuresLeft = 2;
  const c = collect();
  const result = await runHlsDownload({ url: `${base}/flaky.m3u8`, title: "HC", tabId: 7, jobId: "flaky", ...FAST, ...c });

  assert.equal(result.ok, true);
  assert.equal(await c.saved[0].blob.text(), "OK!");
});

test("a segment that keeps failing gives a clear error and saves nothing", async () => {
  const before = requests.filter((u) => u === "/missing.ts").length;
  const c = collect();
  const result = await runHlsDownload({ url: `${base}/broken.m3u8`, title: "HC", tabId: 7, jobId: "broken", ...FAST, ...c });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Could not fetch segment 2/2 (HTTP 404).");
  assert.equal(requests.filter((u) => u === "/missing.ts").length - before, 4, "1 try + 3 retries");
  assert.equal(c.saved.length, 0);
});

test("cancel stops the download and saves nothing", async () => {
  slowSegments = true;
  const c = collect();
  const running = runHlsDownload({ url: `${base}/high.m3u8`, title: "HC", tabId: 7, jobId: "cancel", ...FAST, ...c });
  await new Promise((r) => setTimeout(r, 50));

  assert.deepEqual(cancelHlsDownload("cancel"), { ok: true, canceled: true });
  assert.deepEqual(await running, { ok: false, canceled: true });
  assert.equal(c.saved.length, 0);
  assert.equal(c.progress.at(-1).phase, "Canceled");
  slowSegments = false;
});

test("no progress is reported without a tab to report to", async () => {
  const c = collect();
  await runHlsDownload({ url: `${base}/high.m3u8`, title: "HC", tabId: null, jobId: "notab", ...FAST, ...c });
  assert.equal(c.progress.length, 0);
  assert.equal(c.saved.length, 1);
});

test("real MPEG-TS is converted to a playable MP4", { skip: !hasFfmpeg() && "ffmpeg not installed" }, async () => {
  // Point a playlist at the real segments ffmpeg made.
  const segs = readdirSync(realTsDir).filter((f) => f.endsWith(".ts")).sort();
  const playlist = "#EXTM3U\n" + segs.map((f) => `#EXTINF:2,\n${f}`).join("\n") + "\n#EXT-X-ENDLIST\n";
  writeFileSync(join(realTsDir, "list.m3u8"), playlist);

  const c = collect();
  const result = await runHlsDownload({ url: `${base}/real/list.m3u8`, title: "HC", tabId: 7, jobId: "mp4", ...FAST, ...c });
  assert.deepEqual(result, { ok: true, type: "mp4" });
  assert.ok(c.progress.some((p) => p.phase === "Converting to MP4"));

  const out = join(realTsDir, "out.mp4");
  writeFileSync(out, Buffer.from(await c.saved[0].blob.arrayBuffer()));
  const probe = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", out,
  ], { encoding: "utf8" });
  const info = JSON.parse(probe);
  assert.deepEqual(info.streams.map((s) => s.codec_type).sort(), ["audio", "video"]);
  assert.ok(Math.abs(Number(info.format.duration) - 6) < 0.5, `duration ${info.format.duration}`);
});
