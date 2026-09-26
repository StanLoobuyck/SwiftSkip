import { test, expect, openLecture, focusOutsidePlayer, video } from "./fixtures.js";

test("skip interval from the settings page is used by the shortcuts", async ({ context, extensionId }) => {
  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${extensionId}/options.html`);
  await settings.locator("#skip-options").getByRole("radio", { name: "30s" }).click();
  await expect(settings.locator("#skip-options").getByRole("radio", { name: "30s" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  const { page, frame } = await openLecture(context);
  await focusOutsidePlayer(page);
  const before = await video.time(frame);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => video.time(frame)).toBeGreaterThan(before + 29);
});

test("keybind editor: record a key; taking another action's key moves it", async ({
  context,
  extensionId,
}, testInfo) => {
  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${extensionId}/options.html#shortcuts`);
  const muteRow = settings.locator(".shortcut", { hasText: "Mute" });

  await muteRow.locator(".binding").first().click();
  await expect(muteRow.locator(".binding.is-recording")).toHaveText("Press a key…");
  await settings.keyboard.press("f"); // currently Fullscreen's key
  await expect(muteRow.locator("kbd")).toHaveText("F");
  await expect(settings.locator("#shortcut-notice")).toContainText("was used for “Fullscreen”");
  await expect(settings.locator(".shortcut", { hasText: "Fullscreen" }).locator(".binding-empty")).toHaveText(
    "None",
  );
  await testInfo.attach("settings", {
    body: await settings.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await settings.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(muteRow.locator("kbd")).toHaveText("M");
});
