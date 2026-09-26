import { test, expect, openLecture, openPopupFor, video } from "./fixtures.js";

test("popup: shows the lecture, changes the speed, downloads", async ({
  context,
  extensionId,
  serviceWorker,
}, testInfo) => {
  const { page, frame } = await openLecture(context);
  const popup = await openPopupFor(context, extensionId, serviceWorker, page.url());

  await expect(popup.locator("#lecture-course")).toHaveText("SwiftSkip Testvak");
  await expect(popup.locator("#lecture-title")).toHaveText("Les 2 (2026-09-24): e2e");
  await expect(popup.locator("#speed-value")).toHaveText("1×");
  await testInfo.attach("popup", { body: await popup.screenshot(), contentType: "image/png" });

  await popup.getByRole("button", { name: "Faster" }).click();
  await expect(popup.locator("#speed-value")).toHaveText("1.25×");
  expect(await video.rate(frame)).toBe(1.25);

  await popup.locator("#download-btn").click();
  await expect(popup.locator("#done")).toBeVisible({ timeout: 30_000 });
});

test("popup on a site that isn't enabled offers 'Enable on …'", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await openLecture(context); // any tab, for the popup to point at
  const popup = await openPopupFor(context, extensionId, serviceWorker, "http://localhost:8181/iframe.html");
  await popup.goto(
    popup.url().replace(/url=[^&]+/, `url=${encodeURIComponent("https://example.edu/course")}`),
  );
  await expect(popup.locator("#lecture-title")).toHaveText("SwiftSkip is off on this site");
  await expect(popup.locator("#site-enable")).toContainText("example.edu");
});

test("popup in Dutch", async ({ context, extensionId, serviceWorker }, testInfo) => {
  await serviceWorker.evaluate(() => chrome.storage.sync.set({ language: "nl" }));
  const { page } = await openLecture(context);
  const popup = await openPopupFor(context, extensionId, serviceWorker, page.url());
  await expect(popup.locator("#download-label")).toHaveText("Downloaden");
  await expect(popup.getByText("Snelheid", { exact: true })).toBeVisible();
  await expect(popup.getByRole("button", { name: "Instellingen" })).toBeVisible();
  await testInfo.attach("popup-nl", { body: await popup.screenshot(), contentType: "image/png" });
});

// Chrome stops an idle service worker after ~30 s; the lecture it was told
// about must still be there when it starts again (for the popup and the filename).
test("the popup still knows the lecture after Chrome stops the service worker", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const { page } = await openLecture(context);
  await serviceWorker.evaluate(() => (self.beforeRestart = true));

  // ServiceWorker.stopAllWorkers acts on the origin of the page it's sent from.
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options.html`);
  const cdp = await context.newCDPSession(extensionPage);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await extensionPage.close();

  // Opening the popup wakes the worker again, as a fresh one.
  const popup = await openPopupFor(context, extensionId, await currentWorker(context), page.url());
  expect(await (await currentWorker(context)).evaluate(() => self.beforeRestart)).toBeUndefined();

  await expect(popup.locator("#lecture-course")).toHaveText("SwiftSkip Testvak");
  await expect(popup.locator("#lecture-title")).toHaveText("Les 2 (2026-09-24): e2e");
  await expect(popup.locator("#download-btn")).toBeVisible();
});

async function currentWorker(context) {
  const alive = async (w) => w.evaluate(() => true).catch(() => false);
  for (const w of context.serviceWorkers()) if (await alive(w)) return w;
  return context.waitForEvent("serviceworker");
}
