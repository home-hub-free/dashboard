import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { seedSession, stubBackend } from "./stub";

// Face review — the "Is this you?" swipeable card stack (Settings → People).
// The queue is confidence-tiered by the vision-service: sure matches auto-merge
// (healed), "probably them" cards are addressed to one member, "no idea" cards go
// to everyone. Signed in as David (u1) the fixture queue shows 3 of 4 cards (the
// u2-suggested card is hidden) and the flow is: yes → who-is-this → discard → done.

const OUT = path.resolve(
  process.env.SHOT_DIR ||
    "/tmp/claude-1000/-opt-home-hub-free/d1de58a0-08fc-4638-b2a7-6636fc7bc843/scratchpad/face-review"
);
fs.mkdirSync(OUT, { recursive: true });

const reviewQueue = {
  queue: [
    {
      // A legacy two-person crop: face_box marks WHICH face the question is about
      // (the right-hand one) — the card rings it and dims the rest.
      guest_id: "guest:5", label: "Person 5", sightings: 9,
      first_seen: "2026-07-01 08:11:02", last_seen: "2026-07-03 09:41:22",
      has_thumb: true, thumb: "faces/thumb/guest:5",
      face_box: [0.58, 0.18, 0.2, 0.3],
      tier: "suggest",
      suggested: { kind: "member", id: "u1", name: "David", score: 0.41 },
      rejected_user_ids: [],
    },
    {
      guest_id: "guest:6", label: "Person 6", sightings: 4,
      first_seen: "2026-07-02 19:03:10", last_seen: "2026-07-03 07:15:40",
      has_thumb: true, thumb: "faces/thumb/guest:6", face_box: null,
      tier: "suggest",
      suggested: { kind: "member", id: "u2", name: "Sam", score: 0.33 }, // addressed to Sam → hidden for David
      rejected_user_ids: [],
    },
    {
      // A re-appearance of an already-NAMED guest → "Is this Abuela?" (anyone can
      // confirm; yes = merge, so she stops respawning as new Person N cards).
      guest_id: "guest:9", label: "Person 9", sightings: 2,
      first_seen: "2026-07-03 08:00:00", last_seen: "2026-07-03 09:00:00",
      has_thumb: true, thumb: "faces/thumb/guest:9", face_box: [0.3, 0.2, 0.4, 0.5],
      tier: "suggest",
      suggested: { kind: "guest", id: "guest:2", name: "Abuela", score: 0.52 },
      rejected_user_ids: [],
    },
    {
      // A very tall full-body crop where the detector found NO face at all: contain
      // rendering still shows the whole image, and the card says so honestly
      // (no_face) instead of asking an unanswerable "who is this?".
      guest_id: "guest:7", label: "Person 7", sightings: 3,
      first_seen: "2026-07-02 12:40:00", last_seen: "2026-07-02 21:20:05",
      has_thumb: true, thumb: "faces/thumb/guest:7", face_box: null, no_face: true,
      tier: "unknown", suggested: null, rejected_user_ids: [],
    },
    {
      guest_id: "guest:8", label: "Person 8", sightings: 3,
      has_thumb: false, thumb: null, face_box: null,
      first_seen: "2026-07-03 06:02:31", last_seen: "2026-07-03 06:04:12",
      tier: "unknown", suggested: null, rejected_user_ids: [],
    },
  ],
  healed: [{ guest_id: "guest:4", user_id: "u1", name: "David", score: 0.71 }],
};

const people = {
  people: [
    { id: "u1", label: "David", name: "David", class: "household", samples: 3, has_thumb: true, named: true },
    { id: "guest:2", label: "Abuela", name: "Abuela", class: "guest", sightings: 12, last_seen: "2026-07-03 09:00:00", recurring: true, has_thumb: true, named: true },
    { id: "guest:5", label: "Person 5", name: null, class: "guest", sightings: 9, last_seen: "2026-07-03 09:41:22", recurring: true, has_thumb: true, named: false },
    { id: "guest:7", label: "Person 7", name: null, class: "guest", sightings: 3, last_seen: "2026-07-02 21:20:05", recurring: true, has_thumb: true, named: false },
  ],
};

// SVG stand-ins shaped like the real problem cases: guest:5 = a wide two-person
// frame (face_box picks the right person), guest:7 = a very tall full-body crop
// (face tiny at the top — cover styling used to cut it off), others generic.
function thumbSvg(id: string): string {
  const hue = (id.split(":").pop()!.charCodeAt(0) * 47) % 360;
  if (id === "guest:5") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="300">
      <rect width="440" height="300" fill="hsl(${hue},25%,20%)"/>
      <circle cx="130" cy="110" r="44" fill="hsl(${hue},30%,50%)"/>
      <ellipse cx="130" cy="240" rx="80" ry="70" fill="hsl(${hue},30%,50%)"/>
      <circle cx="300" cy="99" r="44" fill="hsl(${(hue + 90) % 360},35%,55%)"/>
      <ellipse cx="300" cy="235" rx="80" ry="70" fill="hsl(${(hue + 90) % 360},35%,55%)"/>
      <text x="220" y="290" font-family="sans-serif" font-size="20" fill="#fff" text-anchor="middle">${id} (two faces)</text>
    </svg>`;
  }
  if (id === "guest:7") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="420">
      <rect width="140" height="420" fill="hsl(${hue},25%,20%)"/>
      <circle cx="70" cy="42" r="26" fill="hsl(${hue},35%,55%)"/>
      <rect x="30" y="76" width="80" height="250" rx="24" fill="hsl(${hue},35%,45%)"/>
      <text x="70" y="405" font-family="sans-serif" font-size="18" fill="#fff" text-anchor="middle">${id}</text>
    </svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360">
    <rect width="360" height="360" fill="hsl(${hue},30%,22%)"/>
    <circle cx="180" cy="140" r="64" fill="hsl(${hue},35%,55%)"/>
    <ellipse cx="180" cy="300" rx="110" ry="80" fill="hsl(${hue},35%,55%)"/>
    <text x="180" y="348" font-family="sans-serif" font-size="24" fill="#fff" text-anchor="middle">${id}</text>
  </svg>`;
}

async function stubVision(page: Page, posted: string[]) {
  await page.route("**/vision/faces/profiles", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profiles: [{ user_id: "u1", samples: 3 }] }) }));
  await page.route("**/vision/people", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(people) }));
  await page.route("**/vision/people/review", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reviewQueue) }));
  await page.route("**/vision/faces/thumb/**", (r) => {
    const id = decodeURIComponent(r.request().url().split("/thumb/")[1]);
    return r.fulfill({ status: 200, contentType: "image/svg+xml", body: thumbSvg(id) });
  });
  await page.route("**/vision/guests/**", (r) => {
    const req = r.request();
    posted.push(`${req.method()} ${decodeURIComponent(new URL(req.url()).pathname)}${req.postData() ? " " + req.postData() : ""}`);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}

async function gotoSettings(page: Page) {
  await page.route("**/calendar/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }));
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

    test(`face review flow (${vp.tag})`, async ({ context, page }) => {
      const posted: string[] = [];
      await seedSession(context, true);
      await stubBackend(page);
      await stubVision(page, posted);
      await gotoSettings(page);

      // The old per-row labeling controls are gone — the review flow owns naming.
      await expect(page.locator(".person-actions input")).toHaveCount(0);
      await expect(page.locator(".person-actions select")).toHaveCount(0);
      await expect(page.locator(".person-actions .btn-quiet").first()).toBeVisible(); // Forget

      // Banner: ALL 5 cards are reviewable by any member (mine first, Sam's last —
      // guests never log in, so the household clears the whole queue), 1 healed.
      const banner = page.locator(".review-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("5 face(s) to review");
      await expect(banner).toContainText("1 recognised and merged automatically");
      await expect(banner).toContainText("1 look like other members — you can answer for them");
      await banner.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `banner-${vp.tag}.png`) });

      // Card 1/5 — suggest tier addressed to me (self-identification first).
      await banner.getByRole("button", { name: /Review/ }).click();
      const overlay = page.locator(".review-overlay");
      await expect(overlay).toBeVisible();
      await expect(overlay.locator(".review-progress")).toHaveText("1 / 5");
      await expect(overlay.locator(".review-question")).toContainText("Is this you, David?");
      await expect(overlay.locator(".review-score")).toContainText("41% match");

      // Two faces in the crop → the ring marks THE face in question (the
      // right-hand person, per face_box) and the caption says so.
      const ring = overlay.locator(".review-face-ring");
      await expect(ring).toBeVisible();
      await expect(overlay.locator(".review-ring-hint")).toHaveText("Asking about the highlighted face");
      const ib = (await overlay.locator("img.review-card-img").boundingBox())!;
      const rb = (await ring.boundingBox())!;
      expect(rb.x + rb.width / 2).toBeGreaterThan(ib.x + ib.width / 2); // over the right-hand face
      expect(rb.y).toBeGreaterThanOrEqual(ib.y);
      expect(rb.y + rb.height).toBeLessThanOrEqual(ib.y + ib.height + 1);
      await page.waitForTimeout(250); // let the thumb render
      await page.screenshot({ path: path.join(OUT, `card-suggest-${vp.tag}.png`) });

      // "Yes, it's me" → promote to u1, advance to the NAMED-GUEST card:
      // "Is this Abuela?" — confirming merges the cluster into her.
      await overlay.getByRole("button", { name: "Yes, it's me" }).click();
      await expect(overlay.locator(".review-progress")).toHaveText("2 / 5");
      await expect(overlay.locator(".review-question")).toContainText("Is this Abuela?");
      await page.screenshot({ path: path.join(OUT, `card-guest-${vp.tag}.png`) });
      await overlay.getByRole("button", { name: "Yes, it's Abuela" }).click();

      // Card 3/5 — unknown, a very tall legacy crop: contain rendering, no located
      // face → no ring, honest no-face caption. The someone-else picker offers
      // members AND named guests.
      await expect(overlay.locator(".review-progress")).toHaveText("3 / 5");
      await expect(overlay.locator(".review-question")).toHaveText("Who is this?");
      await expect(ring).toBeHidden();
      await expect(overlay.locator(".review-ring-hint")).toHaveCount(0);
      await expect(overlay.locator(".review-noface-hint")).toContainText("No clear face in this capture");
      await expect(overlay.locator(".review-alt option")).toContainText([
        "It's someone else…", "David", "Sam", "Abuela (guest)",
      ]);
      await page.screenshot({ path: path.join(OUT, `card-unknown-${vp.tag}.png`) });

      // Keyboard: → = "it's me" on the unknown card too.
      await page.keyboard.press("ArrowRight");
      await expect(overlay.locator(".review-progress")).toHaveText("4 / 5");

      // Card 4/5 (no photo captured) → Discard.
      await overlay.getByRole("button", { name: /Discard/ }).click();

      // Card 5/5 — looks like ANOTHER member: I answer for Sam (he shouldn't have
      // to log in and re-review; neither should a guest, who never will).
      await expect(overlay.locator(".review-progress")).toHaveText("5 / 5");
      await expect(overlay.locator(".review-question")).toContainText("Is this Sam?");
      await page.screenshot({ path: path.join(OUT, `card-member-other-${vp.tag}.png`) });
      await overlay.getByRole("button", { name: "Yes, it's Sam" }).click();

      await expect(overlay.locator(".review-done")).toBeVisible();
      await expect(overlay.locator(".review-done-title")).toHaveText("All caught up");
      await page.screenshot({ path: path.join(OUT, `done-${vp.tag}.png`) });
      await overlay.getByRole("button", { name: "Done" }).click();
      await expect(overlay).toBeHidden();

      // The answers hit the right endpoints, attributed to the right identities.
      expect(posted).toEqual([
        'POST /vision/guests/guest:5/promote {"user_id":"u1","name":"David"}',
        'POST /vision/guests/guest:9/merge {"into":"guest:2"}',
        'POST /vision/guests/guest:7/promote {"user_id":"u1","name":"David"}',
        "DELETE /vision/guests/guest:8",
        'POST /vision/guests/guest:6/promote {"user_id":"u2","name":"Sam"}',
      ]);
    });

    test(`swipe answers the card (${vp.tag})`, async ({ context, page }) => {
      const posted: string[] = [];
      await seedSession(context, true);
      await stubBackend(page);
      await stubVision(page, posted);
      await gotoSettings(page);
      await page.locator(".review-banner").getByRole("button", { name: /Review/ }).click();
      const card = page.locator(".review-card");
      await expect(card).toBeVisible();

      // Swipe right (touch) on the suggested card = "Yes, it's me".
      const box = (await card.boundingBox())!;
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await card.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: cx, clientY: cy }], changedTouches: [{ identifier: 0, clientX: cx, clientY: cy }] });
      await card.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: cx + 60, clientY: cy }], changedTouches: [{ identifier: 0, clientX: cx + 60, clientY: cy }] });
      await expect(card).toHaveAttribute("data-swipe", "yes"); // stamp shows mid-drag
      await expect(card.locator(".review-stamp-yes")).toHaveCSS("opacity", "1");
      await page.screenshot({ path: path.join(OUT, `swipe-${vp.tag}.png`) });
      await card.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: cx + 140, clientY: cy }], changedTouches: [{ identifier: 0, clientX: cx + 140, clientY: cy }] });
      await card.dispatchEvent("touchend", { touches: [], changedTouches: [{ identifier: 0, clientX: cx + 140, clientY: cy }] });
      await expect(page.locator(".review-progress")).toHaveText("2 / 5");
      expect(posted[0]).toBe('POST /vision/guests/guest:5/promote {"user_id":"u1","name":"David"}');

      // Swipe left on the "Is this Abuela?" card = "not her" → a persisted reject
      // (never suggested as Abuela again).
      await card.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: cx, clientY: cy }], changedTouches: [{ identifier: 0, clientX: cx, clientY: cy }] });
      await card.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: cx - 140, clientY: cy }], changedTouches: [{ identifier: 0, clientX: cx - 140, clientY: cy }] });
      await card.dispatchEvent("touchend", { touches: [], changedTouches: [{ identifier: 0, clientX: cx - 140, clientY: cy }] });
      await expect(page.locator(".review-progress")).toHaveText("3 / 5");
      expect(posted[1]).toBe('POST /vision/guests/guest:9/reject {"user_id":"guest:2"}');

      // Swipe left on an unknown card = "not sure" → advances without a write.
      await card.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: cx, clientY: cy }], changedTouches: [{ identifier: 0, clientX: cx, clientY: cy }] });
      await card.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: cx - 140, clientY: cy }], changedTouches: [{ identifier: 0, clientX: cx - 140, clientY: cy }] });
      await card.dispatchEvent("touchend", { touches: [], changedTouches: [{ identifier: 0, clientX: cx - 140, clientY: cy }] });
      await expect(page.locator(".review-progress")).toHaveText("4 / 5");
      expect(posted.length).toBe(2);

      // Labeling a brand-new guest from the card: type a name → they persist as a
      // named guest (recognised on future visits).
      await page.locator(".review-name-input").fill("Vecino");
      await page.locator(".review-name-input").press("Enter");
      await expect(page.locator(".review-progress")).toHaveText("5 / 5");
      expect(posted[2]).toBe('POST /vision/guests/guest:8/name {"name":"Vecino"}');

      // Swipe right on the "Is this Sam?" card = confirming for ANOTHER member.
      await card.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: cx, clientY: cy }], changedTouches: [{ identifier: 0, clientX: cx, clientY: cy }] });
      await card.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: cx + 140, clientY: cy }], changedTouches: [{ identifier: 0, clientX: cx + 140, clientY: cy }] });
      await card.dispatchEvent("touchend", { touches: [], changedTouches: [{ identifier: 0, clientX: cx + 140, clientY: cy }] });
      await expect(page.locator(".review-done")).toBeVisible();
      expect(posted[3]).toBe('POST /vision/guests/guest:6/promote {"user_id":"u2","name":"Sam"}');
    });
  });
}
