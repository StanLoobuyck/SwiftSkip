import { test, expect, openLecture, focusOutsidePlayer, video, BASE } from "./fixtures.js";

const osdLabel = (frame) => frame.locator(".swiftskip-osd-label");

test("a shortcut pressed outside the player iframe controls the player", async ({ context }) => {
  const { page, frame } = await openLecture(context);
  await video.play(frame);
  await focusOutsidePlayer(page);
  const before = await video.time(frame);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => video.time(frame)).toBeGreaterThan(before + 9);
  await expect(osdLabel(frame)).toHaveText("+10s");
});

test("skipping back at the start doesn't count up; near the start it shows the real distance", async ({ context }) => {
  const { page, frame } = await openLecture(context);
  await focusOutsidePlayer(page);

  await video.seek(frame, 0);
  await page.keyboard.press("ArrowLeft");
  await expect(osdLabel(frame)).toHaveText("0s");

  await video.seek(frame, 4);
  await page.keyboard.press("ArrowLeft");
  await expect(osdLabel(frame)).toHaveText("−4s");
  expect(await video.time(frame)).toBeLessThan(0.5);
  await page.keyboard.press("ArrowLeft");
  await expect(osdLabel(frame)).toHaveText("−4s");
});

test("? opens the shortcut sheet and Esc closes it", async ({ context }) => {
  const { page, frame } = await openLecture(context);
  await focusOutsidePlayer(page);
  await page.keyboard.press("Shift+Slash"); // "?"
  await expect(frame.locator(".swiftskip-sheet")).toBeVisible();
  await expect(frame.locator(".swiftskip-sheet-title")).toHaveText("Keyboard shortcuts");
  await page.keyboard.press("Escape");
  await expect(frame.locator(".swiftskip-sheet")).toHaveCount(0);
});

test("speed: ] faster, AZERTY's $ key (same physical key) too, R resets", async ({ context }) => {
  const { page, frame } = await openLecture(context);
  await focusOutsidePlayer(page);
  await page.keyboard.press("BracketRight");
  await expect.poll(() => video.rate(frame)).toBe(1.25);

  // A real key event as an AZERTY keyboard sends it: key "$", code BracketRight.
  const cdp = await context.newCDPSession(page);
  const azerty = { key: "$", code: "BracketRight", windowsVirtualKeyCode: 186 };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: "$", ...azerty });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...azerty });
  await expect.poll(() => video.rate(frame)).toBe(1.5);
  await expect(osdLabel(frame)).toHaveText("1.5×");

  await page.keyboard.press("r");
  await expect.poll(() => video.rate(frame)).toBe(1);
});

test("typing in a text field never triggers shortcuts", async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`);
  await expect(page.locator("#swiftskip-download")).toBeAttached({ timeout: 15_000 });
  await page.evaluate(() => {
    const v = document.querySelector("video");
    v.muted = true;
    return v.play();
  });
  const input = page.locator("input");
  await input.click();
  await input.pressSequentially("km f");
  await page.keyboard.press("ArrowRight");
  await expect(input).toHaveValue("km f");
  const state = await page.evaluate(() => {
    const v = document.querySelector("video");
    return { paused: v.paused, fullscreen: Boolean(document.fullscreenElement) };
  });
  expect(state).toEqual({ paused: false, fullscreen: false });
});

test("a changed shortcut applies right away, without reloading", async ({ context, serviceWorker }) => {
  const { page, frame } = await openLecture(context);
  await serviceWorker.evaluate(async () => {
    const { shortcuts = {} } = await chrome.storage.sync.get("shortcuts");
    await chrome.storage.sync.set({ shortcuts: { ...shortcuts, mute: ["x"] } });
  });
  await focusOutsidePlayer(page);
  await page.keyboard.press("x");
  await expect.poll(() => frame.evaluate(() => document.querySelector("video").muted)).toBe(false); // was muted by the test
  await page.keyboard.press("x");
  await expect.poll(() => frame.evaluate(() => document.querySelector("video").muted)).toBe(true);
});
