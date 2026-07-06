import { test, expect, Page } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// Full-screen overlays must pin to the VIEWPORT even when the page is scrolled.
// Regression: the rd-rise view-entrance animation used fill-mode `both`, and the
// retained (identity) transform made the view root the containing block for every
// position:fixed descendant — the face-review overlay / face lightbox then covered
// the scrolled PAGE, with their controls above the viewport ("scroll up to close").

const people = {
  people: [
    { id: "u1", label: "David", name: "David", class: "household", samples: 3, has_thumb: true, thumb: "faces/thumb/u1" },
    { id: "guest:2", label: "Person 2", name: null, class: "guest", sightings: 5, last_seen: "2026-07-05 10:00:00", has_thumb: true, thumb: "faces/thumb/guest:2" },
  ],
};
const reviewQueue = {
  queue: [{
    guest_id: "guest:5", label: "Person 5", sightings: 9,
    first_seen: "2026-07-01 08:11:02", last_seen: "2026-07-03 09:41:22",
    has_thumb: true, thumb: "faces/thumb/guest:5", face_box: null,
    tier: "suggest", suggested: { kind: "member", id: "u1", name: "David", score: 0.41 },
    rejected_user_ids: [],
  }],
  healed: 0, others: 0,
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><rect width="360" height="360" fill="#444"/></svg>`;

async function stubVision(page: Page) {
  await page.route("**/vision/faces/profiles", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profiles: [] }) }));
  await page.route("**/vision/people", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(people) }));
  await page.route("**/vision/people/review", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reviewQueue) }));
  await page.route("**/vision/faces/thumb/**", (r) =>
    r.fulfill({ status: 200, contentType: "image/svg+xml", body: svg }));
  await page.route("**/calendar/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }));
}

// no-preference: the entrance animations actually run (fill-mode retention is the bug).
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });

test("settings overlays pin to the viewport while the page is scrolled", async ({ context, page }) => {
  await seedSession(context, true);
  await stubBackend(page);
  await stubVision(page);
  await page.goto("/");
  await page.locator(".menu-item", { hasText: "Settings" }).first().click();
  await page.waitForSelector(".settings-view", { timeout: 20_000 });

  // Scroll deep into settings (#tab-content owns the page scroll).
  await page.evaluate(() => {
    const el = document.querySelector("#tab-content")!;
    el.scrollTop = el.scrollHeight;
  });

  // Face-review overlay: opens over the current viewport, close button reachable.
  await page.locator(".review-banner").getByRole("button", { name: /Review/ }).click();
  const overlay = page.locator(".review-overlay");
  await expect(overlay).toBeVisible();
  const ob = (await overlay.boundingBox())!;
  expect(Math.abs(ob.y)).toBeLessThan(2);
  await expect(overlay.locator(".review-close")).toBeInViewport();
  await overlay.locator(".review-close").click();

  // Face lightbox from the people roster: same contract.
  await page.locator(".person-face.tappable").first().click();
  const zoom = page.locator(".face-zoom");
  await expect(zoom).toBeVisible();
  const zb = (await zoom.boundingBox())!;
  expect(Math.abs(zb.y)).toBeLessThan(2);
  await expect(zoom.locator(".face-zoom-close")).toBeInViewport();
});
