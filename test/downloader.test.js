// Runs the real downloader against a tiny fake Kaltura server.

import assert from "node:assert/strict";
import { resolveObjectURL } from "node:buffer";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

import { cancelHlsDownload, runHlsDownload } from "../src/shared/downloader.js";

const SEGMENTS = ["AAA", "BBB", "CCC"];
let server;
let base;
let slowSegments = false;

before(async () => {
  server = createServer((req, res) => {
    const routes = {
      "/master.m3u8": "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=900\nhigh.m3u8\n",
      "/high.m3u8": "#EXTM3U\n" + SEGMENTS.map((_, i) => `#EXTINF:6,\nseg${i}.ts`).join("\n") + "\n#EXT-X-ENDLIST\n",
      "/broken.m3u8": "#EXTM3U\n#EXTINF:6,\nmissing.ts\n#EXT-X-ENDLIST\n",
    };
    const seg = /^\/seg(\d)\.ts$/.exec(req.url);
    if (routes[req.url]) {
      res.end(routes[req.url]);
    } else if (seg) {
      setTimeout(() => res.end(SEGMENTS[seg[1]]), slowSegments ? 200 : 0);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

function collect() {
  const saved = [];
  const progress = [];
  return {
    saved,
    progress,
    onProgress: (p) => progress.push(p),
    saveFile: async (url, title, extension) => {
      const blob = url.startsWith("blob:") ? resolveObjectURL(url) : null;
      saved.push({ url, title, extension, text: blob ? await blob.text() : null });
    },
  };
}

test("downloads the best variant and concatenates segments in order", async () => {
  const c = collect();
  const result = await runHlsDownload({ url: `${base}/master.m3u8`, title: "HC1", tabId: 7, jobId: "j1", ...c });

  assert.deepEqual(result, { ok: true, type: "ts" });
  assert.equal(c.saved.length, 1);
  assert.equal(c.saved[0].extension, "ts");
  assert.equal(c.saved[0].text, "AAABBBCCC");

  const phases = c.progress.map((p) => p.phase);
  assert.equal(phases[0], "Reading playlist");
  assert.equal(phases.at(-1), "Complete");
  assert.ok(c.progress.every((p) => p.jobId === "j1" && p.tabId === 7));
});

test("falls back to saving the .m3u8 when a segment fails", async () => {
  const c = collect();
  const result = await runHlsDownload({ url: `${base}/broken.m3u8`, title: "HC2", tabId: 7, jobId: "j2", ...c });

  assert.equal(result.fallback, "m3u8");
  assert.match(result.error, /404/);
  assert.deepEqual(c.saved.map((s) => [s.url, s.extension]), [[`${base}/broken.m3u8`, "m3u8"]]);
});

test("cancel stops the download and saves nothing", async () => {
  slowSegments = true;
  const c = collect();
  const running = runHlsDownload({ url: `${base}/high.m3u8`, title: "HC3", tabId: 7, jobId: "j3", ...c });
  await new Promise((r) => setTimeout(r, 50));

  assert.deepEqual(cancelHlsDownload("j3"), { ok: true, canceled: true });
  assert.deepEqual(await running, { ok: false, canceled: true });
  assert.equal(c.saved.length, 0);
  assert.equal(c.progress.at(-1).phase, "Canceled");
  slowSegments = false;
});

test("no progress is reported without a tab to report to", async () => {
  const c = collect();
  await runHlsDownload({ url: `${base}/high.m3u8`, title: "HC4", tabId: null, jobId: "j4", ...c });
  assert.equal(c.progress.length, 0);
  assert.equal(c.saved.length, 1);
});
