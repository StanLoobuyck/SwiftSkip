// Static server for the e2e tests: test/fixtures on http://localhost:8181.
// Supports Range requests (so the <video> can seek). Anything under /slow/
// is the same content, but video segments (.ts) take 600 ms each, so the
// tests can see a download in progress.

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const PORT = Number(process.env.PORT || 8181);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mp4": "video/mp4",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const slow = path.startsWith("/slow/");
  if (slow) path = path.slice("/slow".length);
  if (slow && path.endsWith(".ts")) await new Promise((r) => setTimeout(r, 600));

  const file = normalize(join(ROOT, path.endsWith("/") ? path + "index.html" : path));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const size = statSync(file).size;
  const headers = {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
    "Accept-Ranges": "bytes",
  };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": end - start + 1,
    });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, "Content-Length": size });
    createReadStream(file).pipe(res);
  }
}).listen(PORT, () => console.log(`e2e fixtures on http://localhost:${PORT}`));
