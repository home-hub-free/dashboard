import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

/**
 * Camera privacy mode — the per-camera "stop watching NOW" switch:
 *  - every camera tile carries the label-row shield, off by default;
 *  - toggling ON posts through the hub proxy (auth + audit path), swaps the
 *    stream <img> for the privacy placeholder (the img is REMOVED so the browser
 *    drops the MJPEG connection) and flips the health pill to "privacy";
 *  - toggling OFF restores the live view;
 *  - the fullscreen lightbox carries the same switch.
 */
test.describe("camera privacy mode", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
    // Explicit privacy route (registered after stubBackend → wins over the
    // /api/** catch-all) so the spec can assert the forwarded body.
    await page.route("**/api/camera/*/privacy", (r) => {
      const id = decodeURIComponent(r.request().url().split("/camera/")[1].split("/")[0]);
      const on = !!r.request().postDataJSON()?.on;
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ cam_id: id, zone: "entrance", privacy: on }),
      });
    });
  });

  async function openCameras(page: any) {
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    const camsHead = page.locator(".zsec-cameras .zone-head");
    await expect(camsHead).toBeVisible({ timeout: 15_000 });
    await camsHead.click();
    return errors;
  }

  test("shield toggles privacy on: img removed, placeholder + pill; off restores", async ({ page }) => {
    const errors = await openCameras(page);
    const tile = page.locator("#tile-mc200-entrance");
    await expect(tile).toBeVisible();

    // Off by default: live img present, no placeholder, shield unlit.
    await expect(tile.locator(".cam-wrap img")).toHaveCount(1);
    await expect(tile.locator(".cam-placeholder--privacy")).toHaveCount(0);
    await expect(tile.locator(".cam-priv")).toHaveClass(/cam-priv--off/);

    // ON: posts { on: true } through the hub proxy.
    const [onReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/camera/mc200-entrance/privacy") && r.method() === "POST"),
      tile.locator(".cam-priv").click(),
    ]);
    expect(onReq.postDataJSON()).toEqual({ on: true });

    await expect(tile.locator(".cam-placeholder--privacy")).toBeVisible();
    await expect(tile.locator(".cam-placeholder--privacy")).toContainText("Privacy on");
    await expect(tile.locator(".cam-wrap img")).toHaveCount(0); // connection dropped, not hidden
    await expect(tile.locator(".cam-priv")).toHaveClass(/cam-priv--on/);
    await expect(tile.locator(".cam-health")).toContainText("privacy");
    await expect(tile.locator(".cam-health")).toHaveClass(/cam-health--priv/);

    // OFF: posts { on: false } and the live view returns.
    const [offReq] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/camera/mc200-entrance/privacy") && r.method() === "POST"),
      tile.locator(".cam-priv").click(),
    ]);
    expect(offReq.postDataJSON()).toEqual({ on: false });
    await expect(tile.locator(".cam-wrap img")).toHaveCount(1);
    await expect(tile.locator(".cam-placeholder--privacy")).toHaveCount(0);
    await expect(tile.locator(".cam-priv")).toHaveClass(/cam-priv--off/);

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("the fullscreen lightbox carries the switch and mirrors the tile", async ({ page }) => {
    const errors = await openCameras(page);
    const tile = page.locator("#tile-mc200-entrance");
    await tile.locator(".cam-wrap").click();

    const live = page.locator(".cam-live");
    await expect(live).toBeVisible();
    await expect(live.locator(".cam-live-priv")).toBeVisible();

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/camera/mc200-entrance/privacy") && r.method() === "POST"),
      live.locator(".cam-live-priv").click(),
    ]);
    expect(req.postDataJSON()).toEqual({ on: true });
    await expect(live.locator(".cam-live-placeholder")).toContainText("Privacy on");
    await expect(live.locator(".cam-live-view")).toHaveCount(0);
    await expect(live.locator(".cam-live-priv")).toHaveClass(/cam-priv--on/);
    await expect(live.locator(".cam-health")).toContainText("privacy");

    // The tile behind mirrors the shared device state (same object reference).
    await live.locator(".cam-live-close").click();
    await expect(tile.locator(".cam-placeholder--privacy")).toBeVisible();
    await expect(tile.locator(".cam-priv")).toHaveClass(/cam-priv--on/);

    expect(errors, "no uncaught JS errors").toEqual([]);
  });
});
