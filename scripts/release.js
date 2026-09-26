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
//
// If a release stops halfway (signing, network, gh), fix the cause and run
// the same command again: it picks up from where it stopped.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
git("fetch", "--quiet", "--tags", "origin");
// Commits on main that aren't on origin yet: only this release's own version
// commit is fine (left behind by an earlier run that stopped).
const unpushed = git("log", "--format=%s", "origin/main..HEAD").split("\n").filter(Boolean);
const behind = git("rev-list", "--count", "HEAD..origin/main") !== "0";
if (behind || unpushed.some((subject) => subject !== `Release ${version}`))
  fail("main differs from origin/main: pull/push first.");

// An earlier run of this release that got as far as tagging: carry on, as
// long as the tag is this commit and the GitHub Release doesn't exist yet.
const tagged = Boolean(git("tag", "--list", `v${version}`));
if (tagged) {
  if (git("rev-parse", `v${version}^{commit}`) !== git("rev-parse", "HEAD"))
    fail(`Tag v${version} already exists (on another commit).`);
  if (released(version)) fail(`SwiftSkip ${version} is already released.`);
}

function released(v) {
  try {
    execFileSync("gh", ["release", "view", `v${v}`, "--repo", REPO], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

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

// ─── 2. Tests, version, builds ────────────────────────────────────────────────

// Before the version commit, so failing tests leave nothing behind.
step("Running the tests");
run("npm", ["test", "--silent"], { quiet: true });

if (version !== current) {
  step(`Setting version ${version}`);
  run("npm", ["version", version, "--no-git-tag-version"], { quiet: true });
  if (!dryRun) git("commit", "-q", "-am", `Release ${version}`);
}

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

// Mozilla signs a version only once, so a signed file from an earlier run of
// this release is reused.
let signed = join(ROOT, "web-ext-artifacts", `swiftskip-firefox-${version}-signed.xpi`);
if (existsSync(signed)) {
  step("Using the Firefox build Mozilla already signed");
} else {
  step("Signing the Firefox build with Mozilla (takes a few minutes)");
  try {
    signed = await signFirefox();
  } catch (error) {
    fail(`${error.message}\nFix the problem and run "npm run release ${version}" again.`);
  }
}
const xpi = join(assets, "swiftskip-firefox.xpi");
copyFileSync(signed, xpi);
const hash = createHash("sha256").update(readFileSync(xpi)).digest("hex");

// ─── 4. Tag + GitHub Release ──────────────────────────────────────────────────

step(`Tagging v${version} and pushing`);
if (!tagged) git("tag", "-a", `v${version}`, "-m", `SwiftSkip ${version}`);
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
