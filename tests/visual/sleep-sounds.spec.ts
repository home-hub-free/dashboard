import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// Sleep sounds — the on-device white-noise mixer section on the voice-satellite
// detail sheet (docs/plans/SATELLITE_SLEEP_SOUNDS.md, Phase 6). The tile itself
// stays glance-only (mic chip only, per the satellite's existing tile contract —
// nothing here should add a second tile control); the master toggle rides the
// ordinary `noise` channel (POST /device-update), while the per-layer mix rides
// the dedicated /device-noise-mix curation route (R3) — both already fulfilled by
// stub.ts's generic **/api/** catch-all, so no stub change is needed here.
test.describe("sleep sounds", () => {
  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  test("tile stays mic-chip-only; the sheet's Sleep sounds section drives master/level/layers/timer", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });

    // Tile: only the mic chip — sleep sounds adds no second glance-surface control.
    const sat = page.locator("#tile-dev-sat");
    await expect(sat.locator(".chip")).toHaveCount(1);

    await sat.locator(".tile-edit.iconoir-more-horiz").click();
    const overlay = page.locator(".edit-container");
    const section = overlay.locator(".device-setting", { hasText: "Sleep sounds" });
    await expect(section).toBeVisible();

    // 6 layer rows, each with a real label — never the string "undefined" (M4:
    // the labels live in noiseRows, decorated BESIDE data.value).
    const rows = section.locator(".noise-row");
    await expect(rows).toHaveCount(6);
    const names = await rows.locator(".noise-name").allTextContents();
    expect(names).toEqual(["White", "Pink", "Brown", "Rain", "Fan", "Ocean"]);
    expect(names.join(",")).not.toContain("undefined");

    // Master toggle rides the channel bus: POST /device-update, {channel:"noise"}.
    const [masterReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/device-update") && r.method() === "POST"),
      section.locator(".toggle-button", { hasText: /^On$/ }).click(),
    ]);
    expect(masterReq.postDataJSON()).toMatchObject({ id: "dev-sat", channel: "noise", value: true });

    // Tapping a layer's switch flips EXACTLY that layer's `on` and preserves its
    // level (m11 — the regression a `!l.on` template substitution failure would
    // produce: bindrjs only substitutes a loop var before `.`/`)`, so an inline
    // `!l.on` in the handler call silently sends the wrong/stale value and the
    // toggle never visibly changes anything). Every other layer's on/level must
    // survive untouched — the mix write replaces `noiseLayers` wholesale (R4).
    const rainRow = section.locator(".noise-row", { hasText: "Rain" });
    const [rainReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/device-noise-mix") && r.method() === "POST"),
      rainRow.locator(".switch").click(),
    ]);
    const rainBody = rainReq.postDataJSON();
    expect(rainBody.layers).toHaveLength(6);
    expect(rainBody.layers.find((l: any) => l.id === "rain")).toEqual({ id: "rain", on: true, level: 35 });
    expect(rainBody.layers.find((l: any) => l.id === "pink")).toEqual({ id: "pink", on: true, level: 45 });
    expect(rainBody.layers.find((l: any) => l.id === "white")).toEqual({ id: "white", on: false, level: 50 });

    // Dragging a layer's level slider commits the full array with the new
    // integer level, forcing that layer on.
    const pinkRow = section.locator(".noise-row", { hasText: "Pink" });
    const [levelReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/device-noise-mix") && r.method() === "POST"),
      pinkRow.locator("input[type=range]").evaluate((el: HTMLInputElement) => {
        el.value = "80";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }),
    ]);
    const levelBody = levelReq.postDataJSON();
    expect(levelBody.layers).toHaveLength(6);
    expect(levelBody.layers.find((l: any) => l.id === "pink")).toEqual({ id: "pink", on: true, level: 80 });

    // The pre-noise-firmware satellite (no noiseLayers key at all) gets no section.
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    const sat2 = page.locator("#tile-dev-sat2");
    await sat2.locator(".tile-edit.iconoir-more-horiz").click();
    await expect(page.locator(".edit-container .oh-title")).toHaveText("Sala Sat");
    await expect(page.locator(".edit-container .device-setting", { hasText: "Sleep sounds" })).toHaveCount(0);
  });
});
