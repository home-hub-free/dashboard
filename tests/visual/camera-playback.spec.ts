import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

/**
 * In-lightbox footage playback — re-watch a camera's archived recordings:
 *  - the clock button swaps the live view for the playback surface and
 *    AUTO-PLAYS the newest clip (the live <img> is removed → MJPEG drops);
 *  - day chips (Today/Yesterday) reload that day's segments;
 *  - the 24h timeline draws one span per segment + identity dots, and a tap
 *    jumps to the clip under that instant;
 *  - "Back to live" restores the stream.
 */

/** Local YYYY-MM-DD for `daysAgo` days before today (matches dayRange math). */
function localDay(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayStartEpoch(day: string): number {
  return new Date(`${day}T00:00:00`).getTime() / 1000;
}

test.describe("camera playback", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);

    // The recordings entry point is gated on the worker's `records` flag — the
    // shared fixture omits it, so override the occupancy poll for this suite.
    await page.route("**/vision/occupancy", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          zones: {},
          cameras: [{
            id: "mc200-entrance", zone: "entrance", ip: "10.0.0.8", connected: true,
            frames_seen: 4200, last_frame_age_s: 0.1, detector: "ultralytics",
            face: "insightface", rec_mode: "continuous", records: true,
            onvif: { ptz: true, imaging: true, events: true },
          }],
        }),
      }));

    await page.route("**/vision/recordings/cameras", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cameras: [{ id: "mc200-entrance", name: "camera", zone: "entrance",
                      days: [localDay(0), localDay(1)] }],
        }),
      }));

    // Two clips per requested day: 10:00 (10 min, David walks through) and
    // 14:00 (5 min). Segment ids differ per day so :key tracking is exercised.
    await page.route("**/vision/recordings/mc200-entrance/segments*", (r) => {
      const url = new URL(r.request().url());
      const start = parseFloat(url.searchParams.get("start") || "0");
      const dayTag = start === dayStartEpoch(localDay(0)) ? 10 : 20;
      const seg = (id: number, atH: number, dur: number, events: any[]) => ({
        id, start: start + atH * 3600, end: start + atH * 3600 + dur, duration: dur,
        clip: `recordings/mc200-entrance/clip/${id}?token=tok${id}`, events,
      });
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cam_id: "mc200-entrance",
          segments: [
            seg(dayTag + 1, 10, 600, [
              { ts: start + 10 * 3600 + 120, edge: "person_identified",
                identity: { id: "u1", name: "David", class: "household" } },
            ]),
            seg(dayTag + 2, 14, 300, []),
          ],
        }),
      });
    });

    await page.route("**/vision/recordings/*/clip/*", (r) =>
      r.fulfill({ status: 200, contentType: "video/mp4", body: "" }));
  });

  async function openLightbox(page: any) {
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".zsec-cameras .zone-head").click();
    await page.locator("#tile-mc200-entrance .cam-wrap").click();
    await expect(page.locator(".cam-live")).toBeVisible();
    return errors;
  }

  test("clock button enters playback: newest clip auto-plays, day chips + timeline render", async ({ page }) => {
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");

    await live.locator("button[title='Watch recordings']").click();

    // Newest clip of the newest day auto-plays; the live <img> is gone.
    const video = live.locator(".cam-rec-video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("src", /clip\/12\?token=tok12/);
    await expect(live.locator("img.cam-live-view")).toHaveCount(0);
    await expect(live.locator(".cam-health--rec")).toContainText("playback");

    // Day chips: newest first, active; timeline has 2 spans (latest active) + 1 dot.
    const chips = live.locator(".cam-rec-day");
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toContainText("Today");
    await expect(chips.nth(0)).toHaveClass(/active/);
    await expect(chips.nth(1)).toContainText("Yesterday");
    await expect(live.locator(".cam-tl-seg")).toHaveCount(2);
    await expect(live.locator(".cam-tl-seg.active")).toHaveCount(1);
    await expect(live.locator(".cam-tl-mark")).toHaveCount(1);
    await expect(live.locator(".cam-rec-now")).toContainText("5:00");

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("timeline tap jumps to that clip; day switch reloads; back to live restores the stream", async ({ page }) => {
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");
    await live.locator("button[title='Watch recordings']").click();
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/12/);

    // Tap inside the 10:00 clip (10h05m / 24h ≈ 41.9% across the bar).
    const bar = live.locator(".cam-tl");
    const box = (await bar.boundingBox())!;
    await bar.click({ position: { x: box.width * (10.08 / 24), y: box.height / 2 } });
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/11\?token=tok11/);
    await expect(live.locator(".cam-rec-now")).toContainText("David");

    // Yesterday reloads that day's segments (different ids), nothing auto-plays.
    const [req] = await Promise.all([
      page.waitForRequest((r: any) => r.url().includes("/recordings/mc200-entrance/segments")),
      live.locator(".cam-rec-day", { hasText: "Yesterday" }).click(),
    ]);
    expect(req.url()).toContain(`start=${dayStartEpoch(localDay(1))}`);
    await expect(live.locator(".cam-rec-video")).toHaveCount(0);
    await expect(live.locator(".cam-live-placeholder")).toContainText("Pick a moment");
    await expect(live.locator(".cam-tl-seg")).toHaveCount(2);

    // Back to live: stream <img> returns, playback chrome goes away.
    await live.locator("button[title='Back to live view']").click();
    await expect(live.locator("img.cam-live-view")).toHaveCount(1);
    await expect(live.locator(".cam-rec-bar")).toHaveCount(0);

    expect(errors, "no uncaught JS errors").toEqual([]);
  });
});
