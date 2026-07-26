import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// TimeRangeTrack (docs/plans/EFFECT_CREATION_REPAIR.md Phase 4 / D3): the
// direct-manipulation 24h time rail. It's a plain-DOM component (not bindrjs),
// so it's demoed on /ui-kit.html rather than through a stubbed hub screen —
// no backend routes to stub at all here.

const OUT = path.resolve(process.cwd(), "test-results", "time-track");
fs.mkdirSync(OUT, { recursive: true });

test.describe("time track (ui-kit)", () => {
  test.use({ viewport: { width: 900, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/ui-kit.html");
    // #kit-time-track-demos exists in the static markup immediately; the three
    // TimeRangeTrack instances are mounted by the deferred module script.
    // Wait for the LAST one's DOM (mounted synchronously right after the other
    // two, in source order) so every demo is guaranteed ready before a test
    // touches any of them.
    await page.waitForSelector('#kit-time-track-wrap .tt-fill[data-seg="b"]', { timeout: 15_000 });
  });

  test("dragging the from-handle snaps to a 15-min boundary, syncs the paired input, and commits once", async ({ page }) => {
    const consoleLines: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().startsWith("[ui-kit] time-track range onChange")) consoleLines.push(msg.text());
    });

    const demo = page.locator("#kit-time-track-range");
    const rail = demo.locator(".tt-rail");
    const handle = demo.locator('.tt-handle[data-kind="from"]');
    const input = demo.locator('.tt-input[data-kind="from"]');
    const bubble = handle.locator(".tt-bubble");

    // Starting value from the ui-kit demo's seed ({ from: "07:00", to: "11:00" }).
    await expect(input).toHaveValue("07:00");

    // The kit page is long and this section sits well below the fold — unlike
    // locator actions (.fill/.press/.click), raw page.mouse coordinates are
    // viewport-relative with no auto-scroll, so scroll it into view first.
    await handle.scrollIntoViewIfNeeded();
    const railBox = (await rail.boundingBox())!;
    const handleBox = (await handle.boundingBox())!;
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    // Target ~38% across the rail (≈ 09:07) — deliberately NOT on a 15-min
    // boundary, so a snapped result actually proves the snap ran rather than
    // just echoing an already-round drop point.
    const targetX = railBox.x + railBox.width * 0.38;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // A couple of intermediate moves — the commit-count assertion below proves
    // none of these fire onChange, only the final pointerup does.
    await page.mouse.move(railBox.x + railBox.width * 0.2, startY, { steps: 5 });
    await page.mouse.move(targetX, startY, { steps: 5 });
    await page.mouse.up();

    const newValue = await input.inputValue();
    expect(newValue).not.toBe("07:00"); // the drag actually moved it
    expect(newValue).toMatch(/^\d{2}:(00|15|30|45)$/); // landed on the 15-min grid
    const [hh, mm] = newValue.split(":").map(Number);
    expect(hh * 60 + mm).toBeGreaterThan(8 * 60); // roughly where we dropped it (~09:07 → snaps near there)
    expect(hh * 60 + mm).toBeLessThan(10 * 60);

    // The floating bubble label mirrors the same committed value.
    await expect(bubble).toHaveText(newValue);

    // onChange is commit-only: one drag gesture (down + several moves + up) fires exactly once.
    expect(consoleLines.length).toBe(1);
  });

  test("arrow keys step a focused handle by 15 minutes and commit each step", async ({ page }) => {
    const demo = page.locator("#kit-time-track-point");
    const handle = demo.locator('.tt-handle[data-kind="at"]');
    const input = demo.locator('.tt-input[data-kind="at"]');

    await expect(input).toHaveValue("21:30"); // ui-kit demo seed ({ at: "21:30" })
    await handle.focus();
    await handle.press("ArrowRight");
    await expect(input).toHaveValue("21:45");
    await handle.press("ArrowLeft");
    await handle.press("ArrowLeft");
    await expect(input).toHaveValue("21:15");
  });

  test("typing a native time value syncs the rail and snaps to the grid", async ({ page }) => {
    const demo = page.locator("#kit-time-track-range");
    const input = demo.locator('.tt-input[data-kind="to"]');
    const handle = demo.locator('.tt-handle[data-kind="to"]');

    await expect(input).toHaveValue("11:00");
    await input.fill("14:07"); // off-grid on purpose
    await input.dispatchEvent("change");
    await expect(input).toHaveValue("14:00"); // 14:07 snaps down to 14:00
    await expect(handle.locator(".tt-bubble")).toHaveText("14:00");
  });

  test("a wrapped range (22:00 -> 06:00) renders two fill segments", async ({ page }) => {
    const demo = page.locator("#kit-time-track-wrap");
    const segA = demo.locator('.tt-fill[data-seg="a"]');
    const segB = demo.locator('.tt-fill[data-seg="b"]');

    await expect(demo.locator('.tt-input[data-kind="from"]')).toHaveValue("22:00");
    await expect(demo.locator('.tt-input[data-kind="to"]')).toHaveValue("06:00");

    await expect(segA).toBeVisible();
    await expect(segB).toBeVisible();

    // Segment A spans 22:00 -> 24:00 (2h -> 1/12 of the rail); segment B spans
    // 00:00 -> 06:00 (6h -> 1/4 of the rail). Loose tolerance -- this is a
    // geometry sanity check, not a pixel-perfect layout test.
    const railBox = (await demo.locator(".tt-rail").boundingBox())!;
    const boxA = (await segA.boundingBox())!;
    const boxB = (await segB.boundingBox())!;
    expect(boxA.width / railBox.width).toBeCloseTo(2 / 24, 1);
    expect(boxB.width / railBox.width).toBeCloseTo(6 / 24, 1);
    expect(Math.abs(boxB.x - railBox.x)).toBeLessThan(2); // segment B starts flush at the rail's left edge

    await expect(page.locator("#kit-time-track-demos")).toBeVisible();
    await page.locator("#kit-time-track-demos").screenshot({ path: path.join(OUT, "time-track-demos.png") });
  });

  // EFFECT_CREATION_FOLLOWUPS.md 1.3: range mode must keep `from`/`to` at least
  // one snap step (15 min) apart by forward/wrapped distance — `from === to` is
  // a silently dead rule server-side (dynamic-evaluate.ts's `between` can never
  // match an equal-endpoint window), so the widget itself must refuse it.
  test("typing `to` onto `from` (or vice versa) clamps to the 15-minute floor instead of collapsing the window", async ({ page }) => {
    const demo = page.locator("#kit-time-track-range");
    const fromInput = demo.locator('.tt-input[data-kind="from"]');
    const toInput = demo.locator('.tt-input[data-kind="to"]');

    await expect(fromInput).toHaveValue("07:00");
    await expect(toInput).toHaveValue("11:00");

    // Typing `to` onto `from`'s exact value must not collapse the window to
    // zero-length — it clamps FORWARD to the 15-min floor instead (`to` is the
    // endpoint moving here; `from` is left untouched).
    await toInput.fill("07:00");
    await toInput.dispatchEvent("change");
    await expect(toInput).toHaveValue("07:15");
    await expect(fromInput).toHaveValue("07:00");

    // Symmetric case: typing `from` onto the (now 07:15) `to` value clamps
    // `from` BACKWARD to the floor — the clamp always moves the endpoint that's
    // actually changing; it never swaps which value is `from` vs `to`.
    await fromInput.fill("07:15");
    await fromInput.dispatchEvent("change");
    await expect(fromInput).toHaveValue("07:00");
    await expect(toInput).toHaveValue("07:15");

    // The wrapped boundary case from the plan's own ruling stays legal: a
    // window landing on EXACTLY the 15-min floor the wrapped way (23:45 ->
    // 00:00) is a valid window, not the forbidden equal-endpoint case, and must
    // NOT be clamped.
    await fromInput.fill("23:45");
    await fromInput.dispatchEvent("change");
    await toInput.fill("00:00");
    await toInput.dispatchEvent("change");
    await expect(fromInput).toHaveValue("23:45");
    await expect(toInput).toHaveValue("00:00");
  });
});
