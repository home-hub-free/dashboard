import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { seedSession, stubBackend } from "./stub";

// Photo archive — "re-do the soup" (Settings → People → a member → Photo archive).
// The vision-service permanently archives every crop behind a member's recognition;
// this panel lists them with Delete controls (clean a polluted set by hand) and a
// two-tap Rebuild that REPLACES the profile with the mean of what remains.

const OUT = path.resolve(
  process.env.SHOT_DIR ||
    "/tmp/claude-1000/-opt-home-hub-free/66907ea3-926b-4aec-84e0-218a1774bb10/scratchpad/photo-archive"
);
fs.mkdirSync(OUT, { recursive: true });

const people = {
  people: [
    { id: "u1", label: "David", name: "David", class: "household", samples: 3, has_thumb: true, named: true },
  ],
};

const capturesFixture = {
  owner: "u1",
  total: 3,
  captures: [
    { id: 31, ts: "2026-07-06 18:42:06", kind: "match", score: 0.62, reinforced: true, image: "faces/captures/31/image" },
    { id: 22, ts: "2026-07-06 14:10:11", kind: "promoted", score: 0.41, reinforced: false, image: "faces/captures/22/image" },
    { id: 11, ts: "2026-07-05 09:03:40", kind: "enroll", score: null, reinforced: false, image: "faces/captures/11/image" },
  ],
};

function cropSvg(id: string): string {
  const hue = (parseInt(id, 10) * 53) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360">
    <rect width="360" height="360" fill="hsl(${hue},28%,20%)"/>
    <circle cx="180" cy="150" r="70" fill="hsl(${hue},35%,55%)"/>
    <text x="180" y="340" font-family="sans-serif" font-size="26" fill="#fff" text-anchor="middle">capture ${id}</text>
  </svg>`;
}

async function stubVision(page: Page, posted: string[], live: { captures: typeof capturesFixture }) {
  await page.route("**/vision/faces/profiles", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profiles: [{ user_id: "u1", samples: 3 }] }) }));
  await page.route("**/vision/people", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(people) }));
  await page.route("**/vision/people/review", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ queue: [], healed: [] }) }));
  await page.route("**/vision/faces/thumb/**", (r) =>
    r.fulfill({ status: 200, contentType: "image/svg+xml", body: cropSvg("0") }));
  await page.route("**/vision/faces/u1/captures**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(live.captures) }));
  await page.route("**/vision/faces/captures/**", (r) => {
    const req = r.request();
    const url = decodeURIComponent(new URL(req.url()).pathname);
    if (req.method() === "DELETE") {
      posted.push(`DELETE ${url}`);
      const id = parseInt(url.split("/captures/")[1], 10);
      live.captures = {
        ...live.captures,
        total: live.captures.total - 1,
        captures: live.captures.captures.filter((c) => c.id !== id),
      };
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id }) });
    }
    const id = url.split("/captures/")[1].split("/")[0];
    return r.fulfill({ status: 200, contentType: "image/svg+xml", body: cropSvg(id) });
  });
  await page.route("**/vision/faces/u1/rebuild", (r) => {
    const req = r.request();
    posted.push(`POST ${decodeURIComponent(new URL(req.url()).pathname)} ${req.postData() || ""}`);
    return r.fulfill({ status: 200, contentType: "application/json",
                       body: JSON.stringify({ ok: true, user_id: "u1", samples: live.captures.total }) });
  });
}

async function gotoSettings(page: Page) {
  await page.route("**/calendar/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }));
  await page.goto("/");
  await page.locator(".menu-item", { hasText: "Settings" }).first().click();
  await page.waitForSelector(".settings-view", { timeout: 20_000 });
}

for (const vp of [
  { tag: "desktop", width: 1280, height: 800 },
  { tag: "mobile", width: 390, height: 844 },
]) {
  test.describe(vp.tag, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`photo archive: delete a polluted photo, rebuild the profile (${vp.tag})`, async ({ context, page }) => {
      const posted: string[] = [];
      const live = { captures: { ...capturesFixture, captures: [...capturesFixture.captures] } };
      await seedSession(context, true);
      await stubBackend(page);
      await stubVision(page, posted, live);
      await gotoSettings(page);

      // Open David's photo archive from the People roster.
      const archiveBtn = page.getByRole("button", { name: "Photo archive" });
      await archiveBtn.scrollIntoViewIfNeeded();
      await archiveBtn.click();
      const panel = page.locator(".person-audit", { hasText: "ingredients" });
      await expect(panel).toBeVisible();
      await expect(panel.locator(".cluster-cell")).toHaveCount(3);
      await expect(panel).toContainText("match · 62%");
      await expect(panel).toContainText("enroll");
      await page.waitForTimeout(300); // let the lazy crops paint
      await page.screenshot({ path: path.join(OUT, `panel-${vp.tag}.png`) });

      // Tap a photo → the full-image viewer with a "Delete photo" CTA.
      await panel.locator(".cluster-thumb").first().click();
      const zoom = page.locator(".face-zoom");
      await expect(zoom).toBeVisible();
      await expect(zoom).toContainText("Archived photo 1 / 3");
      await expect(zoom.getByRole("button", { name: "Delete photo" })).toBeVisible();
      await page.screenshot({ path: path.join(OUT, `lightbox-${vp.tag}.png`) });
      await page.keyboard.press("Escape");

      // Delete the polluted photo from the grid — gone immediately, permanently.
      await panel.locator(".cluster-cell", { hasText: "promoted" }).getByRole("button", { name: "Delete" }).click();
      await expect(panel.locator(".cluster-cell")).toHaveCount(2);
      expect(posted).toContain("DELETE /vision/faces/captures/22");

      // Rebuild is a two-tap confirm: arm, read the warning, confirm.
      const rebuild = panel.getByRole("button", { name: /Rebuild profile/ });
      await rebuild.click();
      await expect(panel).toContainText("replaces David's current face profile");
      await page.screenshot({ path: path.join(OUT, `rebuild-armed-${vp.tag}.png`) });
      await panel.getByRole("button", { name: /Tap again to confirm/ }).click();
      await expect(posted.join("\n")).toContain("POST /vision/faces/u1/rebuild");
      await expect(page.locator(".popup-message, .toaster, [class*=toast]").first()).toContainText(/rebuilt/i);
    });
  });
}
