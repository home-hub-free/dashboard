import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { seedSession, stubBackend } from "./stub";

// Reproduction for the settings-tab horizontal overflow introduced with the
// calendar integration. The calendar section (service-account mode) renders one
// non-wrapping flex row per shared calendar — a long calendar summary (e.g. a
// work email) plus badges + buttons push the row, and the whole page, wider than
// the viewport. We assert the document never scrolls horizontally.

const OUT = path.resolve("/opt/home-hub-free/designs/dashboard-redesign/screens", process.env.SHOT_LABEL || "overflow");
fs.mkdirSync(OUT, { recursive: true });

// Calendar fixtures matching the live SA-mode deployment: a personal calendar
// (writable, mine), a long work email shared read-only (busy-blocks), and one
// added-but-not-yet-shared "pending" calendar.
const calStatus = {
  ok: true,
  backend: "google-sa",
  auth: "service_account",
  house_linked: true,
  enrolled: ["u1"],
  family: "family-shared-calendar@group.calendar.google.com",
  sa_email: "home-server@hallowed-trail-353005.iam.gserviceaccount.com",
};

const calCalendars = {
  ok: true,
  sa_email: "home-server@hallowed-trail-353005.iam.gserviceaccount.com",
  family: "family-shared-calendar@group.calendar.google.com",
  calendars: [
    { id: "damuz9502@gmail.com", summary: "damuz9502@gmail.com", accessRole: "writer", writable: true, reachable: true, primary: true },
    { id: "david.munoz@sonatafy.com", summary: "david.munoz@sonatafy.com", accessRole: "freeBusyReader", writable: false, reachable: true, primary: false },
    { id: "family-shared-calendar@group.calendar.google.com", summary: "Familia Muñoz — Casa", accessRole: "writer", writable: true, reachable: true, primary: false },
    { id: "soccer-practice-and-tournaments@group.calendar.google.com", summary: "Soccer practice & tournaments", accessRole: "reader", writable: false, reachable: false, primary: false },
  ],
  members: { u1: { calendars: ["damuz9502@gmail.com", "david.munoz@sonatafy.com"], write: "damuz9502@gmail.com" } },
};

async function gotoSettings(page: Page) {
  await page.route("**/calendar/status", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(calStatus) }));
  await page.route("**/calendar/calendars", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(calCalendars) }));
  await page.goto("/");
  await page.waitForSelector("#devices .device-tile", { timeout: 30_000 }).catch(() => {});
  await page.locator(".menu-item", { hasText: "Settings" }).first().click();
  await page.waitForSelector(".settings-view", { timeout: 20_000 });
  await page.waitForSelector(".cal-list .voice-id-actions", { timeout: 20_000 });
  await page.waitForTimeout(400);
}

for (const vp of [
  { tag: "desktop", width: 1280, height: 800 },
  { tag: "mobile", width: 390, height: 844 },
]) {
  test.describe(vp.tag, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ context, page }) => {
      await seedSession(context, true);
      await stubBackend(page);
    });

    test(`settings has no horizontal overflow (${vp.tag})`, async ({ page }) => {
      await gotoSettings(page);
      await page.screenshot({ path: path.join(OUT, `settings-cal-${vp.tag}.png`), fullPage: true });

      // The page may not *scroll* (an ancestor clips overflow-x), yet the content
      // box can still be wider than the viewport and bleed off both edges. Assert
      // no element in the settings view crosses the viewport's left/right edges.
      const bleed = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const worst: { sel: string; left: number; right: number; w: number } = { sel: "", left: 0, right: 0, w: 0 };
        document.querySelectorAll<HTMLElement>(".settings-view, .settings-view *").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0) return;
          if ((r.left < -0.5 || r.right > vw + 0.5) && r.width > worst.w) {
            const cls = el.className?.toString().trim().split(/\s+/)[0] || "";
            worst.sel = `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
            worst.left = Math.round(r.left);
            worst.right = Math.round(r.right);
            worst.w = Math.round(r.width);
          }
        });
        return { vw, worst };
      });
      expect(
        bleed.worst.w,
        `${bleed.worst.sel} bleeds past the ${bleed.vw}px viewport (left ${bleed.worst.left}, right ${bleed.worst.right}, width ${bleed.worst.w})`,
      ).toBe(0);
    });
  });
}
