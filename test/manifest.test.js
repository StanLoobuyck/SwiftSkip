import assert from "node:assert/strict";
import { test } from "node:test";
import { buildManifest } from "../scripts/manifest.js";

const opts = { version: "1.2.3", dev: false };

test("firefox manifest is MV2 with a persistent background and a gecko id", () => {
  const m = buildManifest("firefox", opts);
  assert.equal(m.manifest_version, 2);
  assert.equal(m.background.persistent, true);
  assert.equal(m.browser_specific_settings.gecko.id, "swiftskip@kuleuven");
  assert.ok(m.browser_action);
});

test("chrome manifest is MV3 with a service worker and the offscreen permission", () => {
  const m = buildManifest("chrome", opts);
  assert.equal(m.manifest_version, 3);
  assert.equal(m.background.service_worker, "background.js");
  assert.ok(m.permissions.includes("offscreen"));
  assert.ok(m.action);
});

test("safari manifest has no downloads permission (unsupported there)", () => {
  const m = buildManifest("safari", opts);
  assert.equal(m.manifest_version, 3);
  assert.ok(!m.permissions.includes("downloads"));
});

test("dev builds are labelled so they're distinguishable from the release", () => {
  assert.equal(buildManifest("chrome", { ...opts, dev: true }).name, "SwiftSkip (dev)");
  assert.equal(buildManifest("chrome", opts).version, "1.2.3");
});
