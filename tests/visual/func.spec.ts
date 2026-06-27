import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// Functional smoke: the redesign is CSS/markup-only, so every interaction must
// still work. These guard the highest-value paths after the restyle.
test.describe("functionality intact", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  test("tapping a light tile writes to the device", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });

    // First tile is the Ceiling light; tapping the tile is the one-tap toggle.
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/device-update") && r.method() === "POST"),
      page.locator("#devices .device-tile").first().click(),
    ]);
    const body = req.postDataJSON();
    expect(body.id).toBe("dev-ceiling");
    expect(body).toHaveProperty("channel");
    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("all three menus mount their views without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });

    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await expect(page.locator(".effects-list")).toBeVisible();
    await expect(page.locator(".effect-container").first()).toBeVisible();

    await page.locator(".menu-item", { hasText: "Assistant" }).first().click();
    await expect(page.locator(".assistant-view")).toBeVisible();
    await expect(page.locator(".voice-talk")).toBeVisible();

    await page.locator(".menu-item", { hasText: "Home" }).first().click();
    await expect(page.locator("#home-status .hs-thesis")).toBeVisible();
    await expect(page.locator("#devices .device-tile").first()).toBeVisible();

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("discovery cards are readable and the Automate action fires", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.waitForSelector(".discovery-card", { timeout: 20_000 });

    // Guard the reported bug: card text must not render black-on-dark.
    const color = await page
      .locator(".discovery-line")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe("rgb(0, 0, 0)");

    // Accepting a suggestion still records it on memory-service.
    const accepts: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("candidates/accept")) accepts.push(r.url());
    });
    await page.locator(".discovery-accept").first().click();
    await page.waitForTimeout(1000);
    expect(accepts.length, "accept POST fired").toBeGreaterThan(0);
  });

  test("opening and reading a device overlay works", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".device-tile .tile-edit").first().click();
    await expect(page.locator(".oh-title")).toBeVisible();
    await expect(page.locator(".edit-container")).toBeVisible();
  });
});
