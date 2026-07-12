import { test, expect, Page } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// The live-instrument motion (utils/live-motion.ts) is gated on prefers-reduced-motion,
// which the shared config forces to "reduce" (deterministic screenshots). Opt back in
// here so the players actually run, and drive the REAL module in-page (Vite serves it)
// to assert each helper animates the node it targets — the selector-escaping + rAF
// timing + reduced-motion gate are exactly what could silently break.
test.use({ reducedMotion: "no-preference" });

async function gotoHome(page: Page) {
  await page.goto("/");
  await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
  await page.waitForTimeout(400);
}

test.beforeEach(async ({ context, page }) => {
  await seedSession(context, true);
  await stubBackend(page);
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
});

// Import the module once and run a body two frames after invoking it (the player
// schedules on a single rAF), returning how many animations are live on `selector`.
async function animationsAfter(page: Page, invoke: string, selector: string): Promise<number> {
  return page.evaluate(
    async ({ invoke, selector }) => {
      const mod: any = await import("/src/utils/live-motion.ts");
      const frames = (n: number) =>
        new Promise<void>((res) => {
          const step = (k: number) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
          step(n);
        });
      // eslint-disable-next-line no-new-func
      new Function("m", invoke)(mod);
      await frames(2);
      const el = document.querySelector(selector);
      return el ? el.getAnimations().length : -1;
    },
    { invoke, selector },
  );
}

test("entranceTile animates the joining device's plate", async ({ page }) => {
  await gotoHome(page);
  expect(await animationsAfter(page, "m.entranceTile('dev-ceiling')", "#tile-dev-ceiling")).toBeGreaterThan(0);
});

test("flareTile animates the tile when a light flips remotely", async ({ page }) => {
  await gotoHome(page);
  expect(await animationsAfter(page, "m.flareTile('dev-ceiling', true)", "#tile-dev-ceiling")).toBeGreaterThan(0);
});

test("reseatReadout animates the cooler's hero readout", async ({ page }) => {
  await gotoHome(page);
  expect(await animationsAfter(page, "m.reseatReadout('dev-cooler')", "#tile-dev-cooler .readout-val")).toBeGreaterThan(0);
});

test("reseatChip animates the sensor chip's reading", async ({ page }) => {
  await gotoHome(page);
  expect(await animationsAfter(page, "m.reseatChip('sen-th1')", "#chip-sen-th1 .chip-reading")).toBeGreaterThan(0);
});

test("a missing target is a silent no-op, not an error", async ({ page }) => {
  await gotoHome(page);
  // -1 = the selector matched nothing; the important part is no throw (pageerror).
  expect(await animationsAfter(page, "m.entranceTile('does-not-exist')", "#tile-does-not-exist")).toBe(-1);
});

test("self-write suppression tracks the echo window", async ({ page }) => {
  await gotoHome(page);
  const [selfNow, otherNever] = await page.evaluate(async () => {
    const mod: any = await import("/src/utils/live-motion.ts");
    mod.markSelfWrite("dev-ceiling");
    return [mod.wasSelfWrite("dev-ceiling"), mod.wasSelfWrite("dev-lamp")];
  });
  expect(selfNow).toBe(true);
  expect(otherNever).toBe(false);
});

test("under reduced motion the players do nothing", async ({ browser }) => {
  // A second context that keeps the reduce preference — the gate must hold.
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await seedSession(context, true);
  await stubBackend(page);
  await gotoHome(page);
  expect(await animationsAfter(page, "m.entranceTile('dev-ceiling')", "#tile-dev-ceiling")).toBe(0);
  await context.close();
});
