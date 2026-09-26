// Publishes a new SwiftSkip version for friends:
//
//   npm run release 4.1.0            (add a "## 4.1.0" section to CHANGELOG.md first)
//   npm run release 4.1.0 --dry-run  (checks + builds, publishes nothing)
//
// 1. checks: clean tree on main, up to date, new version, changelog entry
// 2. bumps the version (commit), runs the tests, builds every browser
// 3. has Mozilla sign the Firefox build (unlisted; keys in .env)
// 4. tags + pushes, creates the GitHub Release with
//      swiftskip-firefox.xpi  (signed; also for Zen / LibreWolf)
//      swiftskip-chrome.zip   (Chrome / Edge / Brave: "Load unpacked")
//    Version-less names, so .../releases/latest/download/<name> always works.
// 5. only then points updates.json at the new .xpi (commit + push), so
//    Firefox never sees an update before its file exists.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signFirefox } from "./sign.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "StanLoobuyck/SwiftSkip";
const ADDON_ID = "swiftskip@stanloobuyck.github.io";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const version = args.find((a) => !a.startsWith("--"));

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: opts.quiet ? "pipe" : "inherit",
    ...opts,
  });
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const step = (text) => console.log(`\n▸ ${text}`);
function fail(message) {
  console.error(`\n✘ ${message}`);
  process.exit(1);
}

// ─── 1. Checks ────────────────────────────────────────────────────────────────

if (!/^\d+\.\d+\.\d+$/.test(version || "")) fail("Usage: npm run release <version> [--dry-run], e.g. 4.1.0");

step("Checking the repository");
if (git("status", "--porcelain")) fail("Commit or stash your changes first.");
if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("Release from the main branch.");
git("fetch", "--quiet", "origin");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main"))
  fail("main differs from origin/main: pull/push first.");
if (git("tag", "--list", `v${version}`)) fail(`Tag v${version} already exists.`);

const pkgPath = join(ROOT, "package.json");
const current = JSON.parse(readFileSync(pkgPath, "utf8")).version;
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
const updates = JSON.parse(readFileSync(join(ROOT, "updates.json"), "utf8"));
const published = updates.addons[ADDON_ID].updates.map((u) => u.version);
if (published.includes(version)) fail(`${version} is already published in updates.json.`);
if (published.some((v) => !newer(version, v))) fail(`${version} must be newer than ${published.join(", ")}.`);
if (version !== current && !newer(version, current)) fail(`${version} must be ≥ package.json's ${current}.`);

const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
const section = new RegExp(
  `^## ${version.replace(/\./g, "\\.")}\\b.*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`,
  "m",
).exec(changelog);
if (!section || !section[1].trim()) fail(`Add a "## ${version}" section to CHANGELOG.md first.`);
const notes = section[1].trim();

// ─── 2. Version, tests, builds ────────────────────────────────────────────────

if (version !== current) {
  step(`Setting version ${version}`);
  run("npm", ["version", version, "--no-git-tag-version"], { quiet: true });
  if (!dryRun) git("commit", "-q", "-am", `Release ${version}`);
}

step("Running the tests");
run("npm", ["test", "--silent"], { quiet: true });

step("Building every browser");
run(process.execPath, ["scripts/build.js", "all", "--zip"]);

const assets = join(ROOT, "web-ext-artifacts", "release");
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
copyFileSync(
  join(ROOT, "web-ext-artifacts", `swiftskip-chrome-${version}.zip`),
  join(assets, "swiftskip-chrome.zip"),
);

if (dryRun) {
  if (version !== current) git("checkout", "--", "package.json", "package-lock.json");
  console.log(`\n✔ Dry run OK. "npm run release ${version}" would sign, tag v${version}, publish:`);
  console.log(`  swiftskip-firefox.xpi, swiftskip-chrome.zip\n\n${notes}\n`);
  process.exit(0);
}

// ─── 3. Sign ──────────────────────────────────────────────────────────────────

step("Signing the Firefox build with Mozilla (takes a few minutes)");
let signed;
try {
  signed = await signFirefox();
} catch (error) {
  fail(`${error.message}\nThe version commit is still local; fix the problem and run the release again.`);
}
const xpi = join(assets, "swiftskip-firefox.xpi");
copyFileSync(signed, xpi);
const hash = createHash("sha256").update(readFileSync(xpi)).digest("hex");

// ─── 4. Tag + GitHub Release ──────────────────────────────────────────────────

step(`Tagging v${version} and pushing`);
git("tag", "-a", `v${version}`, "-m", `SwiftSkip ${version}`);
run("git", ["push", "--quiet", "origin", "main", `v${version}`]);

step("Creating the GitHub Release");
const notesFile = join(assets, "NOTES.md");
writeFileSync(
  notesFile,
  `${notes}\n\n---\n**Installeren / Install:** [Nederlands](https://github.com/${REPO}/blob/main/README_NL.md#installeren) · [English](https://github.com/${REPO}/blob/main/README_EN.md#installing)\n`,
);
run("gh", [
  "release",
  "create",
  `v${version}`,
  xpi,
  join(assets, "swiftskip-chrome.zip"),
  "--repo",
  REPO,
  "--title",
  `SwiftSkip ${version}`,
  "--notes-file",
  notesFile,
  "--latest",
]);

// ─── 5. Point Firefox updates at it ───────────────────────────────────────────

step("Publishing the update for Firefox / Zen");
updates.addons[ADDON_ID].updates.push({
  version,
  update_link: `https://github.com/${REPO}/releases/download/v${version}/swiftskip-firefox.xpi`,
  update_hash: `sha256:${hash}`,
});
writeFileSync(join(ROOT, "updates.json"), JSON.stringify(updates, null, 2) + "\n");
git("commit", "-q", "-m", `Firefox updates: ${version}`, "--", "updates.json");
run("git", ["push", "--quiet", "origin", "main"]);

console.log(`\n✔ SwiftSkip ${version} is out: https://github.com/${REPO}/releases/tag/v${version}`);
console.log(
  "  Firefox/Zen installs pick it up automatically (within a day, or via about:addons → ⚙ → Check for Updates).",
);
