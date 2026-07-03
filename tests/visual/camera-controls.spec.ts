import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

/**
 * Camera control tile (CAMERA_ONVIF_CONTROL_PLAN §2/§4):
 *  - a vision-roster-only camera (MC200 pattern) gets a synthesized tile;
 *  - PTZ cams draw the D-pad + saved-view chips; a nudge POSTs a timed move
 *    through the hub proxy; a chip recalls its preset;
 *  - non-ONVIF cams (ESP32) draw no control bar at all;
 *  - the tune overlay opens with saved views + image sliders, and an imaging
 *    slider commit POSTs the field.
 */
test.describe("camera controls", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  async function openCameras(page: any) {
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    // The camera group starts collapsed and the synthesized tile lands with the
    // first occupancy poll — wait for the section, then expand it.
    const camsHead = page.locator(".zsec-cameras .zone-head");
    await expect(camsHead).toBeVisible({ timeout: 15_000 });
    await expect(camsHead).toContainText("2 cameras", { timeout: 15_000 });
    await camsHead.click();
    return errors;
  }

  test("vision-only PTZ camera gets a tile with D-pad + preset chips; ESP32 gets none", async ({ page }) => {
    const errors = await openCameras(page);

    const mc200 = page.locator("#tile-mc200-entrance");
    await expect(mc200).toBeVisible();
    await expect(mc200.locator(".cam-label")).toContainText("Entrance");
    await expect(mc200.locator(".cam-dpad .cam-nudge")).toHaveCount(4);
    await expect(mc200.locator(".cam-preset")).toHaveCount(2);
    await expect(mc200.locator(".cam-preset").nth(1)).toContainText("Door");

    // The hub-declared ESP32 cam has no ONVIF — no control bar at all.
    await expect(page.locator("#tile-dev-cam .cam-ctrl")).toHaveCount(0);
    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("a D-pad tap posts a timed move; a chip recalls its preset", async ({ page }) => {
    await openCameras(page);
    const mc200 = page.locator("#tile-mc200-entrance");

    const [moveReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/camera/mc200-entrance/ptz/move") && r.method() === "POST"),
      mc200.locator(".cam-nudge[title='Pan right']").click(),
    ]);
    const move = moveReq.postDataJSON();
    expect(move.vx).toBeGreaterThan(0);
    expect(move.ttl_ms).toBeLessThanOrEqual(2000);

    const [gotoReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/camera/mc200-entrance/ptz/goto") && r.method() === "POST"),
      mc200.locator(".cam-preset", { hasText: "Door" }).click(),
    ]);
    expect(gotoReq.postDataJSON().token).toBe("2");
  });

  test("the tune overlay manages saved views and commits imaging", async ({ page }) => {
    const errors = await openCameras(page);
    const mc200 = page.locator("#tile-mc200-entrance");

    await mc200.locator(".cam-tune").click();
    const overlay = page.locator(".cam-ctl-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay.locator(".cam-preset-row")).toHaveCount(2);
    await expect(overlay.locator(".cam-preset-add input")).toBeVisible();
    await expect(overlay.locator("input[type=range]")).toHaveCount(4);

    // Committing a slider posts the single changed field.
    const brightness = overlay.locator("input[type=range]").first();
    const [imgReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/camera/mc200-entrance/imaging") && r.method() === "POST"),
      brightness.evaluate((el: HTMLInputElement) => {
        el.value = "70";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }),
    ]);
    expect(imgReq.postDataJSON().brightness).toBe(70);
    expect(errors, "no uncaught JS errors").toEqual([]);
  });
});
