// Signs the Firefox build with addons.mozilla.org as an *unlisted* add-on:
// not public on the store, but gives a signed .xpi that installs permanently
// in Firefox/Zen (web-ext-artifacts/*.xpi).
//
//   npm run sign
//
// Needs AMO API credentials (addons.mozilla.org → Tools → Manage API Keys) in
// a .env file in the project root (never committed):
//
//   WEB_EXT_API_KEY=user:12345:67
//   WEB_EXT_API_SECRET=...
//
// Mozilla requires the readable source for bundled code, so the committed
// source (git archive of HEAD) is uploaded along with it. Commit first.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

// Signs the committed Firefox build; returns the path of the signed .xpi.
// Throws with a readable message on anything that stops it.
export async function signFirefox() {
  const envFile = join(ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const { WEB_EXT_API_KEY: apiKey, WEB_EXT_API_SECRET: apiSecret } = process.env;
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Missing AMO API credentials.\n" +
        "Create them at https://addons.mozilla.org/developers/addon/api/key/ and put them in .env:\n\n" +
        "  WEB_EXT_API_KEY=user:...\n  WEB_EXT_API_SECRET=...",
    );
  }
  if (git("status", "--porcelain")) {
    throw new Error("Commit your changes first: the uploaded source must match what gets signed.");
  }

  const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const artifactsDir = join(ROOT, "web-ext-artifacts");
  mkdirSync(artifactsDir, { recursive: true });

  execFileSync(process.execPath, ["scripts/build.js", "firefox"], { cwd: ROOT, stdio: "inherit" });
  const sourceZip = join(artifactsDir, `swiftskip-source-${version}.zip`);
  git("archive", "--format=zip", "-o", sourceZip, "HEAD");

  const webExt = (await import("web-ext")).default;
  const result = await webExt.cmd.sign({
    sourceDir: join(ROOT, "dist", "firefox"),
    artifactsDir,
    apiKey,
    apiSecret,
    // The CLI fills this in by default; the programmatic API doesn't.
    amoBaseUrl: "https://addons.mozilla.org/api/v5/",
    channel: "unlisted",
    uploadSourceCode: sourceZip,
  });

  const [downloaded] = result.downloadedFiles || [];
  if (!downloaded) throw new Error("Signing failed: no signed file was downloaded.");
  // AMO names it after an internal hash; give it a recognisable name.
  const signed = join(artifactsDir, `swiftskip-firefox-${version}-signed.xpi`);
  renameSync(join(artifactsDir, downloaded), signed);
  return signed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const signed = await signFirefox();
    console.log(`\n✔ Signed: ${signed}`);
    console.log(
      "Install it by dragging the .xpi into Firefox/Zen (or about:addons → ⚙ → Install Add-on From File).",
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
