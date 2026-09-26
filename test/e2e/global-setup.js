// Before the e2e tests: test media + two Chrome builds of SwiftSkip.
//   dist-e2e/dev      dev build (also runs on localhost, popup test hook)
//   dist-e2e/release  release build (only Toledo/KU Leuven/Kaltura)

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixturesExist, generateFixtures } from "../../scripts/fixtures.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export default function globalSetup() {
  if (!fixturesExist()) generateFixtures();
  const build = (...args) => execFileSync(process.execPath, ["scripts/build.js", "chrome", ...args], { cwd: ROOT, stdio: "inherit" });
  build("--dev", "--no-dev-reload", "--out", "dist-e2e/dev");
  build("--out", "dist-e2e/release");
}
