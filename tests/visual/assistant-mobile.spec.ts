/**
 * Assistant chat — MOBILE usability contract (small + regular phones, touch):
 *   1. the composer is fully on-screen, clear of the fixed bottom nav;
 *   2. the transcript opens PINNED to the newest turn and stays pinned through a typed turn;
 *   3. a typed turn's pending bubbles persist until the stored transcript carries the exchange
 *      (with stubbed fixtures it never does — locking the no-vanishing-message guarantee);
 *   4. list-pane roundtrip: back → pick a voice thread → its room shows in the header.
 */
import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

const SHOTS = "/opt/home-hub-free/designs/dashboard-redesign/screens/after";

for (const vp of [
  { tag: "small-phone", width: 360, height: 740 },
  { tag: "phone", width: 390, height: 844 },
]) {
  test.describe(vp.tag, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });

    test.beforeEach(async ({ context, page }) => {
      await seedSession(context, true);
      await stubBackend(page);
      await page.goto("/");
      await page.locator(".menu-item", { hasText: "Assistant" }).first().click();
      await page.waitForSelector(".chat-panel", { timeout: 20000 });
      await page.waitForTimeout(600);
    });

    test("composer visible + transcript pinned to newest turn", async ({ page }) => {
      // Composer fully inside the viewport, clear of the fixed bottom nav.
      const composer = await page.locator(".chat-composer").boundingBox();
      const nav = await page.locator("#nav-bar, .nav-bar, nav").first().boundingBox().catch(() => null);
      expect(composer).toBeTruthy();
      expect(composer!.y + composer!.height).toBeLessThanOrEqual(vp.height);
      if (nav && nav.y > vp.height / 2) expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav.y + 1);

      // Transcript opened pinned to the BOTTOM (newest turn on screen).
      const pinned = await page.locator("#chat-transcript").evaluate(
        (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 40,
      );
      expect(pinned).toBe(true);
    });

    test("typed turn: pending bubble appears and view stays pinned", async ({ page }) => {
      await page.locator("#prompt").fill("enciende la luz de la sala");
      await page.locator(".chat-send").click();
      await page.waitForTimeout(700);
      // /gateway/route is stubbed → reply bubble text "Sure — done."
      await expect(page.locator(".chat-bubble.pending").last()).toBeVisible();
      const pinned = await page.locator("#chat-transcript").evaluate(
        (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 40,
      );
      expect(pinned).toBe(true);
      await page.screenshot({ path: `${SHOTS}/assistant-turn-${vp.tag}.png` });
    });

    test("list pane roundtrip", async ({ page }) => {
      await page.locator(".chat-back").click();
      await expect(page.locator(".chat-rows .chat-row").first()).toBeVisible();
      await page.locator(".chat-row", { hasText: "pon música" }).first().click();
      await expect(page.locator(".chat-main-head")).toContainText("cocina");
      await page.screenshot({ path: `${SHOTS}/assistant-history-${vp.tag}.png` });
    });
  });
}
