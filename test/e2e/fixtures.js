// Shared Playwright setup: a fresh Chrome profile with SwiftSkip loaded, plus
// helpers for the test pages (test/fixtures/*, served by server.js).

import { test as base, chromium, expect } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BASE = "http://localhost:8181";
export const DEV_BUILD = join(ROOT, "dist-e2e", "dev");
export const RELEASE_BUILD = join(ROOT, "dist-e2e", "release");

export const test = base.extend({
  // Which build to load and extra Chrome flags; tests override with test.use().
  extensionPath: [DEV_BUILD, { option: true }],
  launchArgs: [[], { option: true }],

  context: async ({ extensionPath, launchArgs }, use, testInfo) => {
    const context = await chromium.launchPersistentContext(testInfo.outputPath("profile"), {
      channel: "chromium", // full Chromium: headless-shell can't load extensions
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--autoplay-policy=no-user-gesture-required",
        ...launchArgs,
      ],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
    await use(sw);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export { expect };

// ─── Helpers ──────────────────────────────────────────────────────────────────

// The Toledo-style page: player in an iframe, breadcrumb + toolTitle around it.
export async function openLecture(
  context,
  { slow = false, host = "localhost:8181", title = "Les 2 (2026-09-24): e2e" } = {},
) {
  const page = await context.newPage();
  await page.goto(`http://${host}${slow ? "/slow" : ""}/iframe.html?toolTitle=${encodeURIComponent(title)}`);
  const frame = await playerFrame(page);
  // SwiftSkip's download control appears once the stream has been detected.
  await expect(frame.locator("#swiftskip-download")).toBeAttached({ timeout: 15_000 });
  await frame.evaluate(async () => {
    const v = document.querySelector("video");
    v.muted = true;
    if (v.readyState < 1) await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
  });
  return { page, frame };
}

export async function playerFrame(page) {
  await page.waitForSelector("iframe");
  let frame;
  await expect.poll(() => (frame = page.frames().find((f) => f.url().includes("player.html")))).toBeTruthy();
  await frame.waitForLoadState();
  return frame;
}

export const video = {
  time: (frame) => frame.evaluate(() => document.querySelector("video").currentTime),
  rate: (frame) => frame.evaluate(() => document.querySelector("video").playbackRate),
  seek: (frame, t) =>
    frame.evaluate(
      (to) =>
        new Promise((r) => {
          const v = document.querySelector("video");
          v.addEventListener("seeked", r, { once: true });
          v.currentTime = to;
        }),
      t,
    ),
  play: (frame) =>
    frame.evaluate(() =>
      document
        .querySelector("video")
        .play()
        .then(() => true),
    ),
  pause: (frame) => frame.evaluate(() => document.querySelector("video").pause()),
};

// Clicks the text under the player, so keyboard focus is on the Toledo page
// (not in the player iframe), like a student who clicked somewhere else.
export async function focusOutsidePlayer(page) {
  await page.locator("p").last().click();
}

// The popup, pointed at another tab (dev-build hook: popup.html?tab=&url=).
export async function openPopupFor(context, extensionId, serviceWorker, url) {
  const tabId = await serviceWorker.evaluate(
    async (u) => (await chrome.tabs.query({ url: u })).at(-1)?.id,
    url.replace(/\?.*$/, "").replace(/:\d+\//, "/") + "*",
  );
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 300, height: 420 });
  await popup.goto(
    `chrome-extension://${extensionId}/popup.html?tab=${tabId}&url=${encodeURIComponent(url)}`,
  );
  return popup;
}
