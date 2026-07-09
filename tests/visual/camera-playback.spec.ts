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

    // Scrub/poster thumbnails — a real 1x1 JPEG so <img onload> fires.
    const jpg = Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
      "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
      "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==", "base64");
    await page.route("**/vision/recordings/*/thumb/*", (r) =>
      r.fulfill({ status: 200, contentType: "image/jpeg", body: jpg }));
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
    // Readout = the clip's START time only — clip length/elapsed belong to the
    // native video controls (printing both read as overlapping timestamps).
    await expect(live.locator(".cam-rec-now")).toContainText(/2:00/);

    // Column layout: our control bar sits BELOW the video, never over the
    // native <video controls> strip along the video's own bottom edge.
    await expect(live).toHaveClass(/cam-live--rec/);
    const videoBox = (await video.boundingBox())!;
    const barBox = (await live.locator(".cam-live-bottom").boundingBox())!;
    expect(videoBox.y + videoBox.height).toBeLessThanOrEqual(barBox.y + 1);

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

  test("timeline zoom: window narrows around the playhead, ruler densifies, pan + tap seeks precisely", async ({ page }) => {
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");
    await live.locator("button[title='Watch recordings']").click();
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/12/);

    const scroll = live.locator(".cam-tl-scroll");
    const track = live.locator(".cam-tl-track");
    const zoomIn = live.locator(".cam-tl-zoom-in");
    const zoomOut = live.locator(".cam-tl-zoom-out");

    // Zoom floor: out disabled, label 24 h, only the 6-hourly ruler ticks show.
    await expect(zoomOut).toBeDisabled();
    await expect(live.locator(".cam-tl-zoom-label")).toHaveText("24 h");
    await expect(live.locator(".cam-tl-hh:visible")).toHaveCount(5);

    const viewW = (await scroll.boundingBox())!.width;

    // Zoom in: the track becomes 4× the viewport and even hours join the ruler.
    // The stub <video> never plays, so the playhead sits where playSegment left
    // it (the 14:00 clip start = 14/24 of the day) — the zoom anchors on it:
    // scrollLeft = frac·4·viewW − frac·viewW = 14/24 · 3 · viewW.
    await zoomIn.click();
    await expect(scroll).toHaveAttribute("data-zoom", "4");
    await expect(live.locator(".cam-tl-zoom-label")).toHaveText("6 h");
    await expect(zoomOut).toBeEnabled();
    await expect(live.locator(".cam-tl-hh:visible")).toHaveCount(13);
    const trackW = (await track.boundingBox())!.width;
    expect(Math.round(trackW / viewW)).toBe(4);
    const scrollLeft = await scroll.evaluate((el: HTMLElement) => el.scrollLeft);
    expect(Math.abs(scrollLeft - (14 / 24) * 3 * viewW)).toBeLessThan(3);

    // Pan to the morning (a user swipe) and tap ~10:06 — at 4× that instant is
    // unambiguous, and it seeks INTO the 10:00–10:10 clip.
    await scroll.evaluate((el: HTMLElement) => { el.scrollLeft = el.clientWidth * 1.5; });
    await live.locator(".cam-tl").click({ position: { x: (10.1 / 24) * trackW, y: 18 } });
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/11\?token=tok11/);
    await expect(live.locator(".cam-rec-now")).toContainText("David");

    // Zoom back out to the floor.
    await zoomOut.click();
    await expect(live.locator(".cam-tl-zoom-label")).toHaveText("24 h");
    await expect(zoomOut).toBeDisabled();
    await expect(scroll).toHaveAttribute("data-zoom", "1");

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("moment chips jump straight to a person's appearance", async ({ page }) => {
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");
    await live.locator("button[title='Watch recordings']").click();
    // Newest clip (14:00) auto-plays; the day's one sighting becomes one chip.
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/12/);
    const chip = live.locator(".cam-rec-moment");
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText("David");
    await expect(chip).toContainText(/10:02/);

    // Tap → the 10:00 clip loads, seeked to the sighting (2 min in).
    await chip.click();
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/11\?token=tok11/);
    await expect(live.locator(".cam-rec-now")).toContainText("David");

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("hovering the timeline shows the hh:mm bubble; it hides on leave", async ({ page }) => {
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");
    await live.locator("button[title='Watch recordings']").click();
    await expect(live.locator(".cam-rec-video")).toBeVisible();

    const bar = live.locator(".cam-tl");
    const box = (await bar.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const bubble = live.locator(".cam-tl-bubble");
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText(/12:00/); // midday under the cursor

    await page.mouse.move(box.x + box.width / 2, box.y - 60); // off the bar
    await expect(bubble).toBeHidden();

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("hovering a recorded stretch shows a preview frame; gaps stay time-only", async ({ page }) => {
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");
    await live.locator("button[title='Watch recordings']").click();
    await expect(live.locator(".cam-rec-video")).toBeVisible();

    const bar = live.locator(".cam-tl");
    const box = (await bar.boundingBox())!;
    const bubble = live.locator(".cam-tl-bubble");
    const img = bubble.locator(".cam-tl-bubble-img");

    // 10:05 — inside the 10:00 segment → the bubble grows a preview frame.
    await page.mouse.move(box.x + box.width * (10.083 / 24), box.y + box.height / 2);
    await expect(bubble).toHaveClass(/has-thumb/);
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", /thumb\/11\?token=tok11&t=\d+/);

    // 12:00 — a gap → back to the time-only pill.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(bubble).not.toHaveClass(/has-thumb/);
    await expect(img).toBeHidden();

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("a tap inside the playing clip seeks in place — no video reload", async ({ page }) => {
    let clipLoads = 0;
    await page.route("**/vision/recordings/*/clip/12*", (r) => {
      clipLoads++;
      return r.fulfill({ status: 200, contentType: "video/mp4", body: "" });
    });
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");
    await live.locator("button[title='Watch recordings']").click();

    // Newest clip (14:00, 5 min) auto-plays; poster comes from the thumb route.
    const video = live.locator(".cam-rec-video");
    await expect(video).toHaveAttribute("src", /clip\/12/);
    await expect(video).toHaveAttribute("poster", /thumb\/12/);
    await video.evaluate((el) => ((el as any).__sameEl = true));
    const loadsBefore = clipLoads;

    // Tap 14:02 — inside the playing clip.
    const bar = live.locator(".cam-tl");
    const box = (await bar.boundingBox())!;
    await page.mouse.click(box.x + box.width * (14.04 / 24), box.y + box.height / 2);

    // Same element (not rebuilt), same src, and NO refetch of the clip.
    await expect(video).toHaveAttribute("src", /clip\/12/);
    expect(await video.evaluate((el) => (el as any).__sameEl)).toBe(true);
    expect(clipLoads).toBe(loadsBefore);

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("tap-through is still-frame navigation: instant frame, video only on settle", async ({ page }) => {
    let clip11Loads = 0;
    await page.route("**/vision/recordings/*/clip/11*", (r) => {
      clip11Loads++;
      return r.fulfill({ status: 200, contentType: "video/mp4", body: "" });
    });
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");
    await live.locator("button[title='Watch recordings']").click();

    const video = live.locator(".cam-rec-video");
    await expect(video).toHaveAttribute("src", /clip\/12/); // entry autoplay = immediate

    const bar = live.locator(".cam-tl");
    const box = (await bar.boundingBox())!;

    // Tap into the 10:00 segment: INSTANTLY the element unloads (no src) and
    // shows the target moment's frame as its poster — no waiting on video.
    await page.mouse.click(box.x + box.width * (10.03 / 24), box.y + box.height / 2);
    await expect(video).not.toHaveAttribute("src", /clip/);
    await expect(video).toHaveAttribute("poster", /thumb\/11\?token=tok11&t=\d+&h=360/);

    // After the settle window the real clip attaches and plays.
    await expect(video).toHaveAttribute("src", /clip\/11/);

    // Rapid tap-through: 14:02 then straight back to 10:02 — the intermediate
    // target (clip 12) is never fetched; only stills flip.
    const before12 = clip11Loads; // (11 already loaded once above)
    let clip12Loads = 0;
    await page.route("**/vision/recordings/*/clip/12*", (r) => {
      clip12Loads++;
      return r.fulfill({ status: 200, contentType: "video/mp4", body: "" });
    });
    await page.mouse.click(box.x + box.width * (14.03 / 24), box.y + box.height / 2);
    await page.mouse.click(box.x + box.width * (10.03 / 24), box.y + box.height / 2);
    await expect(video).toHaveAttribute("src", /clip\/11/);
    expect(clip12Loads).toBe(0);                  // intermediate stop never loaded
    expect(clip11Loads).toBe(before12 + 1);       // final target loaded once

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("filmstrip spans the visible window; a cell tap jumps there; zoom re-windows it", async ({ page }) => {
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");
    await live.locator("button[title='Watch recordings']").click();
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/12/);

    // Full-day window: cells cover 24h — the 10:00 stretch shows a frame from
    // clip 11, gaps are dimmed placeholders.
    const strip = live.locator(".cam-tl-strip");
    const cells = strip.locator(".cam-strip-cell");
    expect(await cells.count()).toBeGreaterThanOrEqual(4);
    const seg11Cells = strip.locator(".cam-strip-cell img[src*='thumb/11']");
    expect(await seg11Cells.count()).toBeGreaterThanOrEqual(1);
    expect(await strip.locator(".cam-strip-cell.empty").count()).toBeGreaterThanOrEqual(1);

    // Tap the 10:00 frame → still-frame lands there, then the clip attaches.
    await seg11Cells.first().locator("..").click();
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/11/);

    // Zoom in: the strip re-windows around the playhead (denser slice of day).
    await live.locator(".cam-tl-zoom-in").click();
    await expect
      .poll(async () => strip.locator(".cam-strip-cell img[src*='thumb/11']").count())
      .toBeGreaterThanOrEqual(2);

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("while a clip plays, the next segment is prefetched into the cache", async ({ page }) => {
    const prefetches: string[] = [];
    await page.route("**/vision/recordings/*/clip/12*", (r) => {
      prefetches.push(r.request().url());
      return r.fulfill({ status: 200, contentType: "video/mp4", body: "" });
    });
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");
    await live.locator("button[title='Watch recordings']").click();
    await expect(live.locator(".cam-rec-video")).toBeVisible();

    // Jump to the FIRST clip (10:00) — its successor (14:00 = clip 12) should be
    // fetched in the background a beat later, without being played.
    const bar = live.locator(".cam-tl");
    const box = (await bar.boundingBox())!;
    prefetches.length = 0;
    await page.mouse.click(box.x + box.width * (10.02 / 24), box.y + box.height / 2);
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/11/);
    await expect.poll(() => prefetches.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect(live.locator(".cam-rec-video")).toHaveAttribute("src", /clip\/11/); // still on 11

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("sound toggle swaps the silent MJPEG for the HLS view and back", async ({ page }) => {
    // A minimal empty live playlist — hls.js attaches without frames; the test
    // asserts the surface swap, not actual decode.
    await page.route("**/vision/hls/**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/vnd.apple.mpegurl",
        body: "#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n",
      }));
    const errors = await openLightbox(page);
    const live = page.locator(".cam-live");

    // Records-cams get the sound button; it starts on the silent (off) glyph.
    const btn = live.locator(".cam-live-audio");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveClass(/cam-audio--off/);
    await expect(live.locator("img.cam-live-view")).toHaveCount(1);

    await btn.click(); // sound ON → HLS <video> replaces the MJPEG <img>
    await expect(btn).toHaveClass(/cam-audio--on/);
    await expect(live.locator("video.cam-live-hls")).toHaveCount(1);
    await expect(live.locator("img.cam-live-view")).toHaveCount(0);

    await btn.click(); // sound OFF → back to the MJPEG relay
    await expect(btn).toHaveClass(/cam-audio--off/);
    await expect(live.locator("video.cam-live-hls")).toHaveCount(0);
    await expect(live.locator("img.cam-live-view")).toHaveCount(1);

    // Entering playback tears the sound view down too (no leaked player).
    await btn.click();
    await expect(live.locator("video.cam-live-hls")).toHaveCount(1);
    await live.locator("button[title='Watch recordings']").click();
    await expect(live.locator("video.cam-live-hls")).toHaveCount(0);
    await expect(live.locator(".cam-rec-video")).toBeVisible();

    expect(errors, "no uncaught JS errors").toEqual([]);
  });
});
