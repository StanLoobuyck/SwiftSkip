// Builds dist/<browser>/ from src/.
//
//   node scripts/build.js [firefox|chrome|safari|all] [--dev] [--watch] [--zip]
//
// --dev    also runs the content script on localhost (for the test page)
// --watch  rebuild whenever something in src/ changes
// --watch-only  like --watch, but skip the initial build (dev.js already did it)
// --zip    write web-ext-artifacts/swiftskip-<browser>-<version>.zip

import { watch } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { buildManifest } from "./manifest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
export const TARGETS = ["firefox", "chrome", "safari"];

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const targetArg = args.find((a) => !a.startsWith("--")) || "all";
const dev = flags.has("--dev");
const watching = flags.has("--watch") || flags.has("--watch-only");

const targets = targetArg === "all" ? TARGETS : [targetArg];
for (const t of targets) {
  if (!TARGETS.includes(t)) {
    console.error(`Unknown target "${t}". Use one of: ${TARGETS.join(", ")}, all`);
    process.exit(1);
  }
}

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

let firstBuild = true;

async function buildTarget(target) {
  const out = join(ROOT, "dist", target);
  // Only wipe on the first build: in watch mode a running browser is loading
  // from this folder, and a briefly missing manifest would break its reload.
  if (firstBuild) await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const entries = {
    background: `background/${target}.js`,
    content: "content/content.js",
    popup: "popup/popup.js",
  };
  if (target === "chrome") entries.offscreen = "offscreen/offscreen.js";

  await esbuild.build({
    entryPoints: Object.fromEntries(
      Object.entries(entries).map(([name, file]) => [name, join(SRC, file)]),
    ),
    outdir: out,
    bundle: true,
    format: "iife",
    target: ["firefox109", "chrome110", "safari16"],
    // Readable output: store reviewers (especially Mozilla) reject minified code.
    minify: false,
    sourcemap: dev ? "inline" : false,
    define: {
      __BROWSER__: JSON.stringify(target),
      __DEV__: JSON.stringify(dev),
    },
    logLevel: "warning",
  });

  const statics = [
    ["popup/popup.html", "popup.html"],
    ["popup/popup.css", "popup.css"],
    ["content/style.css", "style.css"],
    ["icons", "icons"],
  ];
  if (target === "chrome") statics.push(["offscreen/offscreen.html", "offscreen.html"]);
  for (const [from, to] of statics) {
    await cp(join(SRC, from), join(out, to), { recursive: true });
  }

  const manifest = buildManifest(target, { version: pkg.version, dev });
  await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  if (flags.has("--zip")) {
    const webExt = await import("web-ext");
    const result = await webExt.default.cmd.build(
      {
        sourceDir: out,
        artifactsDir: join(ROOT, "web-ext-artifacts"),
        filename: `swiftskip-${target}-${pkg.version}.zip`,
        overwriteDest: true,
      },
      { showReadyMessage: false },
    );
    console.log(`  zipped → ${result.extensionPath}`);
  }
}

async function buildAll() {
  const started = Date.now();
  try {
    for (const target of targets) await buildTarget(target);
    firstBuild = false;
    console.log(
      `✔ built ${targets.join(", ")}${dev ? " (dev)" : ""} in ${Date.now() - started} ms`,
    );
  } catch (error) {
    console.error(`✘ build failed: ${error.message}`);
    if (!watching) process.exit(1);
  }
}

if (flags.has("--watch-only")) firstBuild = false;
else await buildAll();

if (watching) {
  let timer = null;
  watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(buildAll, 100);
  });
  console.log("  watching src/ for changes…");
}
