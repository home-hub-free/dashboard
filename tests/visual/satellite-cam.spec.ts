import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// Camera-equipped voice satellite (dev-sat declares a stream block; dev-sat2 is
// audio-only): the tile shows the slim live banner with an expand affordance that
// opens the fullscreen live lightbox, and a Flip chip (camera 180° — the board
// mounts its DVP connector opposite the ESP32-CAM's). Audio-only satellites get
// neither: no banner, and no Flip chip (the value blob never carries the key).
test.describe("satellite camera tile", () => {
  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  test("banner expands to the live lightbox and the Flip chip gates on the blob", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });

    // Camera satellite: banner + expand pill + Flip chip (on — fixture flip:true).
    const sat = page.locator("#tile-dev-sat");
    await expect(sat.locator(".cam-wrap")).toBeVisible();
    await expect(sat.locator(".cam-expand")).toBeVisible();
    const flipChip = sat.locator(".chip", { hasText: "Flip" });
    await expect(flipChip).toHaveCount(1);
    await expect(flipChip).toHaveClass(/\bon\b/);

    // Audio-only satellite: no banner, no Flip chip — its other controls intact.
    const sat2 = page.locator("#tile-dev-sat2");
    await expect(sat2.locator(".cam-wrap")).toHaveCount(0);
    await expect(sat2.locator(".chip", { hasText: "Flip" })).toHaveCount(0);
    await expect(sat2.locator(".chip", { hasText: "Mic" })).toHaveCount(1);

    // Banner tap → the fullscreen live lightbox, titled after the satellite.
    await sat.locator(".cam-wrap").click();
    const live = page.locator(".cam-live");
    await expect(live).toBeVisible();
    await expect(live.locator(".cam-live-title")).toContainText("Oficina");
  });
});
