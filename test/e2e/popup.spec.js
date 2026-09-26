import { test, expect, openLecture, openPopupFor, video } from "./fixtures.js";

test("popup: shows the lecture, changes the speed, downloads", async ({ context, extensionId, serviceWorker }, testInfo) => {
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

test("popup on a site that isn't enabled offers 'Enable on …'", async ({ context, extensionId, serviceWorker }) => {
  await openLecture(context); // any tab, for the popup to point at
  const popup = await openPopupFor(context, extensionId, serviceWorker, "http://localhost:8181/iframe.html");
  await popup.goto(popup.url().replace(/url=[^&]+/, `url=${encodeURIComponent("https://example.edu/course")}`));
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
