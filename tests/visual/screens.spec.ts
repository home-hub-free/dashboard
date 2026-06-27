import { test, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { seedSession, stubBackend } from "./stub";

// Where screenshots land. Run with SHOT_LABEL=before to capture the baseline.
const LABEL = process.env.SHOT_LABEL || "after";
const OUT = path.resolve("/opt/home-hub-free/designs/dashboard-redesign/screens", LABEL);
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { tag: "desktop", width: 1280, height: 800 },
  { tag: "mobile", width: 390, height: 844 },
];

async function shot(page: Page, name: string, tag: string, fullPage = true) {
  await page.screenshot({ path: path.join(OUT, `${name}-${tag}.png`), fullPage });
}

async function gotoHome(page: Page) {
  await page.goto("/");
  await page.waitForSelector("#devices .device-tile", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function clickMenu(page: Page, name: string) {
  await page.locator(".menu-item", { hasText: name }).first().click();
}

for (const vp of VIEWPORTS) {
  test.describe(vp.tag, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ context, page }) => {
      await seedSession(context, true);
      await stubBackend(page);
      page.on("pageerror", (e) => console.log(`[pageerror ${vp.tag}] ${e.message}`));
    });

    test("home", async ({ page }) => {
      await gotoHome(page);
      await shot(page, "home", vp.tag);
    });

    test("automations", async ({ page }) => {
      await gotoHome(page);
      await clickMenu(page, "Automations");
      await page.waitForSelector(".effects-list", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await shot(page, "automations", vp.tag);
    });

    test("assistant", async ({ page }) => {
      await gotoHome(page);
      await clickMenu(page, "Assistant");
      await page.waitForSelector(".assistant-view", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await shot(page, "assistant", vp.tag);
    });

    test("device-overlay", async ({ page }) => {
      await gotoHome(page);
      await page.locator(".device-tile .tile-edit").first().click().catch(() => {});
      await page.waitForSelector(".oh-title", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(800);
      await shot(page, "device-overlay", vp.tag, false);
    });

    test("sensor-overlay", async ({ page }) => {
      await gotoHome(page);
      await page.locator(".sensor-chip").first().click().catch(() => {});
      await page.waitForSelector(".oh-title", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(800);
      await shot(page, "sensor-overlay", vp.tag, false);
    });
  });
}

test.describe("login", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, false);
    await stubBackend(page);
  });
  test("login", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("input", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, "login", "desktop", false);
  });
});
