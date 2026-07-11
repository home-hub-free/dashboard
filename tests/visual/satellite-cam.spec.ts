import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// Camera-equipped voice satellite (dev-sat declares a stream block; dev-sat2 is
// audio-only): the tile shows the slim live banner with an expand affordance that
// opens the fullscreen live lightbox. The tile keeps ONLY the mic chip — volume,
// camera Flip and eco live in the detail sheet's Controls section, where the
// Flip row gates on the value blob carrying the key (audio-only units never
// report it).
test.describe("satellite camera tile", () => {
  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  test("tile = banner + mic chip; Flip lives in the sheet, gated on the blob", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });

    // Camera satellite: banner + expand pill; mic is the only tile chip.
    const sat = page.locator("#tile-dev-sat");
    await expect(sat.locator(".cam-wrap")).toBeVisible();
    await expect(sat.locator(".cam-expand")).toBeVisible();
    await expect(sat.locator(".chip", { hasText: "Mic" })).toHaveCount(1);
    await expect(sat.locator(".chip", { hasText: "Flip" })).toHaveCount(0);
    await expect(sat.locator(".tile-slider")).toHaveCount(0);

    // Its detail sheet carries the demoted controls: volume, flip (blob has the
    // key), and the mic toggle.
    await sat.locator(".tile-edit.iconoir-more-horiz").click();
    const overlay = page.locator(".edit-container");
    await expect(overlay.locator(".form-group", { hasText: "Volume" })).toBeVisible();
    await expect(overlay.locator(".form-group", { hasText: "Flip camera" })).toBeVisible();
    await expect(overlay.locator(".form-group", { hasText: "Microphone" })).toBeVisible();

    // Audio-only satellite: no banner; sheet shows Controls but no Flip row
    // (the value blob never carries the key).
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    const sat2 = page.locator("#tile-dev-sat2");
    await expect(sat2.locator(".cam-wrap")).toHaveCount(0);
    await expect(sat2.locator(".chip", { hasText: "Mic" })).toHaveCount(1);
    await sat2.locator(".tile-edit.iconoir-more-horiz").click();
    const overlay2 = page.locator(".edit-container");
    await expect(overlay2.locator(".form-group", { hasText: "Volume" })).toBeVisible();
    await expect(overlay2.locator(".form-group", { hasText: "Flip camera" })).toHaveCount(0);

    // Banner tap → the fullscreen live lightbox, titled after the satellite.
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await sat.locator(".cam-wrap").click();
    const live = page.locator(".cam-live");
    await expect(live).toBeVisible();
    await expect(live.locator(".cam-live-title")).toContainText("Oficina");
  });
});
