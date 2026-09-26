// The release build: where it runs, and what happens to open tabs on an update.
// *.kaltura.com is pointed at the local test server, so the release build
// (which only runs on Toledo/KU Leuven/Kaltura) can be tested here.

import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { test, expect, openLecture, focusOutsidePlayer, video, RELEASE_BUILD } from "./fixtures.js";

const hosts = ["--host-resolver-rules=MAP *.kaltura.com 127.0.0.1, MAP example.test 127.0.0.1"];

test.describe("release build", () => {
  test.use({ extensionPath: RELEASE_BUILD, launchArgs: hosts });

  test("runs on a Kaltura player, not on other sites", async ({ context }) => {
    await openLecture(context, { host: "lecture.kaltura.com:8181" });
    const other = await context.newPage();
    await other.goto("http://example.test:8181/player.html");
    await other.waitForTimeout(2000);
    await expect(other.locator("#swiftskip-download")).toHaveCount(0);
  });
});

// Loads (or reloads) an unpacked extension through Chrome's DevTools protocol,
// the way chrome://extensions → ↻ does. (chrome.runtime.reload() would
// disable an extension that was loaded with --load-extension.)
const DEBUG_PORT = 9555;
async function loadUnpacked(path) {
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
  const reply = new Promise((resolve) => (ws.onmessage = (m) => resolve(JSON.parse(m.data))));
  ws.send(JSON.stringify({ id: 1, method: "Extensions.loadUnpacked", params: { path } }));
  const result = await reply;
  ws.close();
  if (result.error) throw new Error(result.error.message);
}

test.describe("after an update", () => {
  // A private copy we can "update": bump its version and load it again.
  const copy = `${RELEASE_BUILD}-update`;
  test.beforeAll(() => {
    rmSync(copy, { recursive: true, force: true });
    cpSync(RELEASE_BUILD, copy, { recursive: true });
  });
  test.use({
    extensionPath: copy,
    launchArgs: [...hosts, `--remote-debugging-port=${DEBUG_PORT}`, "--enable-unsafe-extension-debugging"],
  });

  test("open lectures keep working without a reload, with one copy of SwiftSkip", async ({ context }) => {
    const { page, frame } = await openLecture(context, { host: "lecture.kaltura.com:8181" });
    await video.play(frame);
    await frame.locator("#swiftskip-download").evaluate((el) => (el.dataset.old = "1"));

    const manifestPath = `${copy}/manifest.json`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const [a, b, c] = manifest.version.split(".").map(Number);
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: `${a}.${b}.${c + 1}` }));
    await loadUnpacked(copy);

    // The new copy builds its own control; the old one is gone.
    await expect(frame.locator("#swiftskip-download:not([data-old])")).toHaveCount(1, { timeout: 15_000 });
    await expect(frame.locator("#swiftskip-download")).toHaveCount(1);

    await focusOutsidePlayer(page);
    const before = await video.time(frame);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => video.time(frame)).toBeGreaterThan(before + 9);
    expect(await video.time(frame)).toBeLessThan(before + 15); // once, not twice
  });
});
