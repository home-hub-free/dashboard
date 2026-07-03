import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// Voice-satellite battery readout: shows the self-reported % (with a level icon)
// when a cell is present, and disappears entirely when the device reports -1
// ("battery slot empty") or hasn't reported at all.
test.describe("satellite battery", () => {
  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  test("readout shows % and hides when no battery", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });

    const sat = page.locator("#tile-dev-sat");
    await expect(sat.locator(".readout .readout-val")).toContainText("72%");
    await expect(sat.locator(".readout .readout-label")).toHaveText("Battery");
    // 72% → the 75-bar glyph (level icon is picked from literal class names).
    await expect(sat.locator(".readout .iconoir-battery-75")).toHaveCount(1);

    // The battery-less satellite renders no battery readout at all.
    const sat2 = page.locator("#tile-dev-sat2");
    await expect(sat2.locator(".tile-controls")).toBeVisible();
    await expect(sat2.locator(".readout")).toHaveCount(0);
  });
});
