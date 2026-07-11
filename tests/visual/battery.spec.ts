import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// Voice-satellite battery: the tile carries NO battery readout (status, not
// action — it lives in the detail sheet's Controls section), except the one
// fact that IS immediate: "Low battery" joins the status line at ≤25%. The
// sheet shows the self-reported % when a cell is present and hides the row
// entirely when the device reports -1 ("battery slot empty").
test.describe("satellite battery", () => {
  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  test("tile stays readout-free; the sheet shows % and hides when no battery", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });

    // Tile: no battery readout, no low-battery warning at 72%.
    const sat = page.locator("#tile-dev-sat");
    await expect(sat.locator(".readout")).toHaveCount(0);
    await expect(sat.locator(".tile-status")).not.toContainText("battery");

    // Detail sheet: Controls section carries the real %.
    await sat.locator(".tile-edit.iconoir-more-horiz").click();
    const overlay = page.locator(".edit-container");
    await expect(overlay.locator(".status-item", { hasText: "Battery" })).toContainText("72%");

    // The battery-less satellite hides the row in its sheet too.
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    const sat2 = page.locator("#tile-dev-sat2");
    await expect(sat2.locator(".readout")).toHaveCount(0);
    await sat2.locator(".tile-edit.iconoir-more-horiz").click();
    await expect(page.locator(".edit-container .oh-title")).toHaveText("Sala Sat");
    await expect(page.locator(".edit-container .status-item", { hasText: "Battery" })).toHaveCount(0);
  });
});
