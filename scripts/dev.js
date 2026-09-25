// Development mode:
//   npm run dev:firefox   (Zen if installed, else Firefox)
//   npm run dev:chrome    (Chromium, Chrome or Brave)
//
// 1. builds dist/<browser> in dev mode and rebuilds on every change in src/
// 2. serves the local test page on http://localhost:8123
// 3. opens the browser with the extension loaded; it reloads on each rebuild
//
// The browser uses its own profile in .profiles/, kept between runs, so you
// only have to log in to Toledo once there.
//
// Override the browser binary with SWIFTSKIP_BROWSER=/path/to/binary.

import { spawn, execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { fixturesExist, generateFixtures } from "./fixtures.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8123;
const target = process.argv[2];

const BINARIES = {
  firefox: ["zen-browser", "zen", "firefox"],
  chrome: ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome", "brave"],
};

if (!BINARIES[target]) {
  console.error("Usage: node scripts/dev.js firefox|chrome");
  process.exit(1);
}

function findBinary() {
  if (process.env.SWIFTSKIP_BROWSER) return process.env.SWIFTSKIP_BROWSER;
  for (const name of BINARIES[target]) {
    try {
      return execFileSync("which", [name], { encoding: "utf8" }).trim();
    } catch {
      /* try next */
    }
  }
  return null;
}

const binary = findBinary();
if (!binary) {
  console.error(
    `No ${target} browser found (looked for ${BINARIES[target].join(", ")}).\n` +
      (target === "chrome" ? "Install one, e.g.: sudo pacman -S chromium\n" : "") +
      "Or point SWIFTSKIP_BROWSER at the binary.",
  );
  process.exit(1);
}

// ─── Test media + static server ───────────────────────────────────────────────

if (!fixturesExist()) {
  console.log("Generating test media (one time)…");
  try {
    generateFixtures();
  } catch {
    console.warn("⚠ Could not generate test media (is ffmpeg installed?). Test page will have no video.");
  }
}

const FIXTURES = join(ROOT, "test", "fixtures");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mp4": "video/mp4",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

// Minimal static server; supports Range requests so the <video> can seek.
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(FIXTURES, path.endsWith("/") ? path + "index.html" : path));
  if (!file.startsWith(FIXTURES) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end("Not found");
    return;
  }

  const size = statSync(file).size;
  const headers = { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Accept-Ranges": "bytes" };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, "Content-Length": size });
    createReadStream(file).pipe(res);
  }
}).listen(PORT, () => console.log(`Test page: http://localhost:${PORT}/`));

// ─── Build (watch) + browser ──────────────────────────────────────────────────

const children = [];
function run(cmd, args) {
  const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    // When the browser is closed (or the build dies), stop everything.
    for (const c of children) if (c !== child) c.kill();
    process.exit(code ?? 0);
  });
  return child;
}

const shutdown = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Initial build first, so the browser never starts from an empty folder.
execFileSync(process.execPath, ["scripts/build.js", target, "--dev"], { cwd: ROOT, stdio: "inherit" });
run(process.execPath, ["scripts/build.js", target, "--dev", "--watch"]);

const profile = join(ROOT, ".profiles", `${target}-dev`);
// web-ext creates the profile folder itself, but not its parent.
mkdirSync(dirname(profile), { recursive: true });
const webExt = join(ROOT, "node_modules", ".bin", "web-ext");
const common = [
  "run",
  "--source-dir", join(ROOT, "dist", target),
  "--start-url", `http://localhost:${PORT}/`,
  "--profile-create-if-missing",
  "--keep-profile-changes",
];

console.log(`Launching ${binary} …`);
if (target === "firefox") {
  run(webExt, [...common, "--target", "firefox-desktop", "--firefox", binary, "--firefox-profile", profile]);
} else {
  run(webExt, [...common, "--target", "chromium", "--chromium-binary", binary, "--chromium-profile", profile]);
}
