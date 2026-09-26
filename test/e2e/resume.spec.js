import { test, expect, openLecture, focusOutsidePlayer, video, playerFrame } from "./fixtures.js";

async function reopen(page) {
  await page.reload();
  const frame = await playerFrame(page);
  await expect(frame.locator("#swiftskip-download")).toBeAttached({ timeout: 15_000 });
  await frame.evaluate(() => (document.querySelector("video").muted = true));
  return frame;
}

test("reopening a lecture resumes where you stopped, with Start over", async ({ context }) => {
  const { page, frame } = await openLecture(context);
  await video.play(frame);
  await video.seek(frame, 65);
  await video.pause(frame); // saves the position

  const again = await reopen(page);
  await video.play(again);
  await expect.poll(() => video.time(again)).toBeGreaterThan(64);
  const toast = again.locator(".swiftskip-toast");
  await expect(toast).toContainText("Resumed at 1:05");

  await toast.getByRole("button", { name: "Start over" }).click();
  await expect.poll(() => video.time(again)).toBeLessThan(3);
});

test("the last chosen speed is remembered for the next lecture", async ({ context }) => {
  const { page, frame } = await openLecture(context);
  await focusOutsidePlayer(page);
  await page.keyboard.press("BracketRight");
  await page.keyboard.press("BracketRight");
  await expect.poll(() => video.rate(frame)).toBe(1.5);

  const again = await reopen(page);
  await video.play(again);
  await expect.poll(() => video.rate(again)).toBe(1.5);
});
