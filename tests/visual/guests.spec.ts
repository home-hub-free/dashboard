import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// Settings → Guests: the guest registry (non-members + relationship per member + tú/usted).
// Guards the panel's three writes against the stubbed hub routes (stub.ts keeps an in-memory list).
test.describe("settings guests", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Settings" }).first().click();
    await expect(page.locator("#set-guests")).toBeVisible();
  });

  test("lists the seeded guest with relationship and treatment", async ({ page }) => {
    const item = page.locator("#set-guests .guest-item").first();
    await expect(item.locator(".household-display")).toHaveText("Lupita");
    await expect(item.locator(".guest-aliases")).toHaveText("Doña Lupe");
    await expect(item.locator(".guest-rel-text")).toContainText("mamá");
    await expect(item.locator(".guest-rel-text")).toContainText("David");
    await expect(item.locator(".seg-btn.active")).toHaveText("usted");
  });

  test("adds a guest with a first relationship, then a second relationship and a treatment", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const sec = page.locator("#set-guests");

    await sec.locator("details.disclosure summary").click();
    await sec.locator('input[placeholder^="name"]').fill("Toño");
    await sec.locator("details.disclosure select").selectOption("u2");
    await sec.locator('input[placeholder^="relationship"]').fill("hermano");
    await sec.locator(".guest-new-treatment .seg-btn", { hasText: "tú" }).click();
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/guests") && r.method() === "POST"),
      sec.locator("button", { hasText: "Add guest" }).click(),
    ]);
    const body = req.postDataJSON();
    expect(body.name).toBe("Toño");
    expect(body.treatment).toBe("tu");
    expect(body.relations).toEqual([{ memberId: "u2", relation: "hermano" }]);

    const tono = sec.locator(".guest-item", { has: page.locator(".household-display", { hasText: "Toño" }) });
    await expect(tono).toBeVisible();
    await expect(tono.locator(".guest-rel-text")).toContainText("Sam");

    // Second relationship: open the row, pick a member, say what he is to them.
    await tono.locator("button", { hasText: "Relationship" }).click();
    await tono.locator(".guest-rel-add select").selectOption("u1");
    await tono.locator(".guest-rel-add input").fill("cuñado");
    const [put] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/relations/u1") && r.method() === "PUT"),
      tono.locator(".guest-rel-add button", { hasText: "Save" }).click(),
    ]);
    expect(put.postDataJSON().relation).toBe("cuñado");
    await expect(tono.locator(".guest-rel")).toHaveCount(2);

    // Treatment toggle writes a PATCH and lights the segment.
    const [patch] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/guests/to") && r.method() === "PATCH"),
      tono.locator(".guest-row .seg-btn", { hasText: "usted" }).click(),
    ]);
    expect(patch.postDataJSON().treatment).toBe("usted");
    await expect(tono.locator(".guest-row .seg-btn.active")).toHaveText("usted");

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("forgetting a guest removes the row", async ({ page }) => {
    const sec = page.locator("#set-guests");
    await expect(sec.locator(".guest-item")).toHaveCount(1);
    const [del] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/guests/lupita") && r.method() === "DELETE"),
      sec.locator(".guest-item .remove-btn").first().click(),
    ]);
    expect(del.method()).toBe("DELETE");
    await expect(sec.locator(".guest-item")).toHaveCount(0);
    await expect(sec.locator(".person-empty")).toHaveText("No guests yet.");
  });
});
