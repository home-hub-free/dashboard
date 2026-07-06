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

  test("all menus mount their views without errors", async ({ page }) => {
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

    // Settings (household/account) is now its own destination, split out of Assistant.
    await page.locator(".menu-item", { hasText: "Settings" }).first().click();
    await expect(page.locator(".settings-view")).toBeVisible();
    await expect(page.locator(".settings-view .signed-in-row")).toBeVisible();

    await page.locator(".menu-item", { hasText: "Home" }).first().click();
    // The house bar's date + lights blocks are unconditional (.hs-weather is gated on data).
    await expect(page.locator("#home-status .hs-day")).toBeVisible();
    await expect(page.locator("#home-status .hs-lights")).toBeVisible();
    await expect(page.locator("#devices .device-tile").first()).toBeVisible();

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("discovery cards are readable and the Automate action fires", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    // Suggestions now collapse into a one-row count banner by default — expand it to reveal the cards.
    await page.locator(".discovery-banner").click();
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

  test("settings member text is readable (not black on dark)", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Settings" }).first().click();
    await page.waitForSelector(".household-row .household-display", { timeout: 20_000 });

    const color = await page
      .locator(".household-row .household-display")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe("rgb(0, 0, 0)");
  });

  test("an automation row can be toggled off", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.waitForSelector(".effect-row .effect-switch", { timeout: 20_000 });

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/set-effect-enabled") && r.method() === "POST"),
      page.locator(".effect-row .effect-switch").first().click(),
    ]);
    const body = req.postDataJSON();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("enabled");
  });

  test("a value-sensor rule authored with 'lower than' posts op 'lt' (comparison regression)", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.locator(".effects-actions .add-range-btn", { hasText: "Add automation" }).click();
    await page.waitForSelector("#new-automation", { timeout: 10_000 });

    // Walk the cascading form: dimmable target → numeric value → a temp/humidity sensor → LOWER than.
    await page.locator("#new-automation select").first().selectOption("dev-bedroom");
    await page.locator('#new-automation input[type="number"][max="100"]').fill("40");
    await page.locator("#new-automation select", { hasText: "Time of day" }).selectOption("sensor");
    await page.locator("#new-automation select", { hasText: "Select sensor:" }).selectOption("sen-th2");
    await page.locator("#new-automation #check-value").selectOption("temp");
    await page.locator("#new-automation #comparison").selectOption("lower-than");
    await page.locator('#new-automation input[name="temp/humidity-input"]').fill("22");

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/set-effect") && r.method() === "POST"),
      page.locator("#new-automation .add-range-btn", { hasText: "Save Automation" }).click(),
    ]);
    // The chosen comparison must reach the stored rule — the bug wrote it to a field the
    // builder never read, so every value-sensor rule defaulted to op 'eq'.
    const cond = req.postDataJSON().effect.arms[0].when[0];
    expect(cond.op).toBe("lt");
  });

  test("a simple rule opens the focused edit overlay and saves in place", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.waitForSelector(".effect-row .effect-edit", { timeout: 20_000 });

    // The ✎ on a simple single-arm rule opens the focused edit surface (not the cascading form).
    await page.locator(".effect-row .effect-edit").first().click();
    await expect(page.locator("#edit-automation")).toBeVisible();

    // Saving posts the rebuilt rule to /update-effect (id preserved → in-place replace).
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/update-effect") && r.method() === "POST"),
      page.locator("#edit-automation .edit-save").click(),
    ]);
    const body = req.postDataJSON();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("effect");
  });

  test("opening a device overlay + expanding Advanced works", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".device-tile .tile-edit").first().click();
    await expect(page.locator(".oh-title")).toBeVisible();
    await expect(page.locator(".edit-container")).toBeVisible();

    // Advanced (installer + active-hours) is collapsed by default; expanding it
    // must render the single 24h timeline without error.
    await page.locator(".overlay-advanced > summary").click();
    await expect(page.locator(".time-bar.day-bar")).toBeVisible();
    expect(errors, "no uncaught JS errors").toEqual([]);
  });
});

// The detail overlay must not overflow horizontally on a narrow (phone) panel —
// a stray full-width element (e.g. the zone "Add" button hit by the global button
// reset) made it scroll sideways and clip content.
test.describe("overlay fits narrow viewports", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  test("device overlay does not overflow horizontally", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    // The cooler is the content-heaviest overlay; expand Advanced too.
    await page.locator(".device-tile.cat-evap-cooler .tile-edit").first().click();
    await page.waitForSelector(".edit-container", { timeout: 20_000 });
    await page.locator(".overlay-advanced > summary").click().catch(() => {});
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(() => {
      const c = document.querySelector(".overlay-modal-content .content") as HTMLElement;
      return c.scrollWidth - c.clientWidth;
    });
    expect(overflow, "no horizontal overflow in the overlay").toBeLessThanOrEqual(1);
  });
});
