import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";
import * as fx from "./fixtures";

// Permanent regression coverage for the effect-creation E2E repair
// (docs/plans/EFFECT_CREATION_REPAIR.md Phase 1). Supersedes the temporary
// zz-freeze-repro.spec.ts / zz-freeze-repro2.spec.ts diagnostics written during
// the audit — the audit found the flow does NOT hard-freeze the JS thread; two
// structural defects produced every reported symptom instead:
//   B1 — toasts rendered UNDER the overlay modal (invisible feedback)
//   B2 — an unprotected save→reload→close chain: any rejection left the modal
//        open with zero feedback while the rule was already saved
//   B3 — a stuck-visible overlay made openOverlay() silently no-op app-wide
// This file keeps the real-hub data shapes from zz-freeze-repro2.spec.ts
// (duplicate "Cocina" name across a camera and a dimmable light, cameras in the
// device roster, presence-only sensors) per the plan's Handoff notes.

const json = (data: any) => ({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

// ── Real hub data shapes (ported from the audit's zz-freeze-repro2.spec.ts) ────────────────
// Cameras stay in the device roster on purpose — B10 (target-picker pollution) isn't fixed
// until a later phase, and this spec must not silently start depending on a fix that hasn't
// landed. "Cocina" is deliberately ambiguous (a camera AND a dimmable light share the name).
const realDevices = [
  { id: "5187202", name: "Lampara", value: false, type: "boolean", deviceCategory: "light", manual: false, operationalRanges: [], zone: "sala", channels: [{ key: "power", role: "actuator", kind: "boolean", writable: true }], channelAware: false },
  { id: "mc200", name: "Entrada principal", value: null, type: "value", deviceCategory: "camera", manual: false, operationalRanges: [], zone: "entrada" },
  { id: "c110-45da", name: "Sala", value: null, type: "value", deviceCategory: "camera", manual: false, operationalRanges: [], zone: "sala" },
  { id: "c110-6946", name: "Cocina", value: null, type: "value", deviceCategory: "camera", manual: false, operationalRanges: [], zone: "cocina" },
  { id: "10260975", name: "Aire oficina", value: { fan: false, water: false, target: 24, "room-temp": 26, "unit-temp": 19 }, type: "value", deviceCategory: "evap-cooler", manual: false, operationalRanges: [], zone: "oficina" },
  { id: "10039254", name: "Cocina", value: 0, type: "value", deviceCategory: "dimmable-light", manual: false, operationalRanges: [], zone: "cocina" },
];
const realSensors = [
  { id: "10192655", type: "boolean", name: "Cocina", value: true, sensorType: "presence", ip: "192.168.1.252", zone: "cocina" },
  { id: "14360666", type: "boolean", name: "Comedor", value: false, sensorType: "presence", ip: "192.168.1.248", zone: "comedor" },
  { id: "9675492", type: "boolean", name: "Sala", value: true, sensorType: "presence", ip: "192.168.1.247", zone: "sala" },
];
const realEffects = [
  { id: 160, enabled: true, trigger: { source: "sensor", nodeId: "10192655", channel: "presence" }, arms: [{ when: [{ kind: "time", op: "between", from: "07:00", to: "11:00" }], set: { nodeId: "10039254", channel: "brightness", value: 50 } }] },
];

test.describe("automation creation — real hub data shapes (phone)", () => {
  test.use({ viewport: { width: 393, height: 852 } }); // phone-sized, like the PWA

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    // Same stub layering as stub.ts but with the real hub's payloads (kept inline, not in
    // fixtures.ts, so this spec's real-shaped data can't drift from what the audit captured).
    await page.route("**/socket.io/**", (r) => r.abort());
    await page.route("**/vision/**", (r) => r.fulfill(json({ ok: true })));
    await page.route("**/memory/**", (r) => r.fulfill(json({ ok: true, candidates: [] })));
    await page.route("**/api/**", (r) => r.fulfill(json({ success: true })));
    await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { id: "u1", username: "david", displayName: "David", prefs: {} } })));
    await page.route("**/api/get-devices", (r) => r.fulfill(json(realDevices)));
    await page.route("**/api/get-sensors", (r) => r.fulfill(json(realSensors)));
    await page.route("**/api/get-effects-dynamic", (r) => r.fulfill(json(realEffects)));
    await page.route("**/api/get-effects", (r) => r.fulfill(json([])));
    await page.route("**/api/get-zones", (r) => r.fulfill(json(["sala", "cocina", "comedor", "oficina", "entrada"])));
  });

  test("multi-arm happy path: presence -> dimmable brightness arms, one POST, modal closes", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const posts: any[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/set-effect$/.test(r.url())) posts.push(r.postDataJSON());
    });

    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await expect(page.locator(".effects-list")).toBeVisible();
    await page.locator(".fx-advanced").click();
    const ov = page.locator("#multi-arm-automation");
    await expect(ov).toBeVisible();

    await ov.locator("select").nth(0).selectOption("sensor");
    await ov.locator(".ma-section").nth(0).locator("select").nth(1).selectOption("10192655");

    const armEditor = ov.locator(".ma-section", { hasText: "Add an arm" });
    // arm 1: dimmable "Cocina" (the light, NOT the camera of the same name) -> 50 -> 07:00-11:00
    await armEditor.locator("select").nth(0).selectOption("10039254");
    await armEditor.locator('input[type="number"]').fill("50");
    await armEditor.locator(".ma-guard select").nth(0).selectOption("time");
    await armEditor.locator(".ma-guard select").nth(1).selectOption("between");
    await armEditor.locator('input[type="time"]').nth(0).fill("07:00");
    await armEditor.locator('input[type="time"]').nth(1).fill("11:00");
    await ov.locator(".add-range-btn", { hasText: "Add arm" }).click();
    await expect(ov.locator(".ma-arm-row")).toHaveCount(1, { timeout: 5000 });

    // arm 2: SAME device, value 10, no guard (the else/default arm)
    await armEditor.locator("select").nth(0).selectOption("10039254");
    await armEditor.locator('input[type="number"]').fill("10");
    await ov.locator(".add-range-btn", { hasText: "Add arm" }).click();
    await expect(ov.locator(".ma-arm-row")).toHaveCount(2, { timeout: 5000 });

    await ov.locator(".ma-save").click();
    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });

    expect(errors).toEqual([]);
    expect(posts.length).toBe(1);
    const body = posts[0]?.effect;
    expect(body.trigger).toEqual({ source: "sensor", nodeId: "10192655", channel: "presence" });
    expect(body.arms).toHaveLength(2);
    expect(body.arms[0]).toEqual({ when: [{ kind: "time", op: "between", from: "07:00", to: "11:00" }], set: { nodeId: "10039254", channel: "brightness", value: 50 } });
    expect(body.arms[1]).toEqual({ when: [], set: { nodeId: "10039254", channel: "brightness", value: 10 } });
  });
});

test.describe("automation creation — feedback & failure paths", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  test("a validation toast renders visibly above the open modal (B1 / 1.1)", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.locator(".fx-advanced").click();
    const ov = page.locator("#multi-arm-automation");
    await expect(ov).toBeVisible();

    // trigger = sensor, but never pick WHICH sensor — with an arm staged, arms.length > 0
    // already satisfies the Save button's own :if, so this is the only way left to reach
    // saveMaRule's "no sensor chosen" validation branch.
    await ov.locator("select").nth(0).selectOption("sensor");
    const armEditor = ov.locator(".ma-section", { hasText: "Add an arm" });
    await armEditor.locator("select").nth(0).selectOption({ index: 1 });
    await armEditor.locator("select").nth(1).selectOption("true");
    await ov.locator(".add-range-btn", { hasText: "Add arm" }).click();
    await expect(ov.locator(".ma-arm-row")).toHaveCount(1);

    await ov.locator(".ma-save").click();
    const toast = page.locator("#popup-message-container .toaster-container");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Set a trigger and add at least one arm");
    await expect(ov).toBeVisible(); // validation, not a save — the overlay stays open

    const stacksAboveModal = await page.evaluate(() => {
      const t = document.querySelector("#popup-message-container .toaster-container") as HTMLElement | null;
      const m = document.querySelector(".overlay-modal-content") as HTMLElement | null;
      if (!t || !m) return false;
      const r = t.getBoundingClientRect();
      const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const toastZ = Number(getComputedStyle(t).zIndex);
      const modalZ = Number(getComputedStyle(m).zIndex);
      return !!(topEl && t.contains(topEl)) && toastZ > modalZ;
    });
    expect(stacksAboveModal).toBe(true);
  });

  test("save succeeds even when the post-save list refresh fails: closes with a warning, not an error (B2 / 1.3)", async ({ page }) => {
    let getEffectsDynamicCalls = 0;
    await page.route("**/api/get-effects-dynamic", (route) => {
      getEffectsDynamicCalls += 1;
      if (getEffectsDynamicCalls === 1) return route.fulfill(json(fx.effects)); // initial boot sync
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) });
    });
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/set-effect")) posts.push(r.url());
    });

    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.locator(".effects-actions .add-range-btn", { hasText: "Add automation" }).click();
    await page.waitForSelector("#new-automation", { timeout: 10_000 });

    await page.locator("#new-automation select").first().selectOption("dev-ceiling");
    await page.locator("#new-automation select", { hasText: "Do:" }).selectOption("true");
    await page.locator("#new-automation select", { hasText: "Time of day" }).selectOption("sensor");
    await page.locator("#new-automation select", { hasText: "Select sensor:" }).selectOption("sen-motion");
    await page.locator("#new-automation select", { hasText: "Is:" }).selectOption("true");

    await page.locator("#new-automation .add-range-btn").click();

    // Closes on the strength of the POST alone (D5 optimistic close) — a broken background
    // refresh must not re-open the modal, wedge the app, or read as a save failure.
    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });
    const toast = page.locator("#popup-message-container .toaster-container");
    await expect(toast).toContainText(/didn't refresh/);
    expect(posts.length).toBe(1);

    // The app stays usable — a fresh overlay still opens normally afterward.
    await page.locator(".fx-advanced").click();
    await expect(page.locator("#multi-arm-automation")).toBeVisible();
  });

  test("double-tapping Save while the request is pending still posts once (1.3)", async ({ page }) => {
    let resolveRoute: (() => void) | null = null;
    await page.route("**/api/set-effect", async (route) => {
      await new Promise<void>((resolve) => { resolveRoute = resolve; });
      return route.fulfill(json({ success: true }));
    });
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/set-effect")) posts.push(r.url());
    });

    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.locator(".effects-actions .add-range-btn", { hasText: "Add automation" }).click();
    await page.waitForSelector("#new-automation", { timeout: 10_000 });

    await page.locator("#new-automation select").first().selectOption("dev-ceiling");
    await page.locator("#new-automation select", { hasText: "Do:" }).selectOption("true");
    await page.locator("#new-automation select", { hasText: "Time of day" }).selectOption("sensor");
    await page.locator("#new-automation select", { hasText: "Select sensor:" }).selectOption("sen-motion");
    await page.locator("#new-automation select", { hasText: "Is:" }).selectOption("true");

    const saveBtn = page.locator("#new-automation .add-range-btn");
    await saveBtn.click();
    // The first tap already latches `saving` + the .busy (pointer-events:none) class, so a real
    // second tap couldn't even land on the button. Dispatch the second click programmatically —
    // this is what actually proves the JS-level guard (the authoritative one per D5), not just
    // the CSS affordance that stops a normal double-tap from reaching the handler at all.
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>("#new-automation .add-range-btn")?.click();
    });
    await page.waitForTimeout(150);
    expect(posts.length).toBe(1); // the guard blocked the second tap before any second request

    resolveRoute?.();
    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });
    expect(posts.length).toBe(1);
  });

  test("a stuck-open modal (e.g. a hung save) doesn't block the next overlay from opening (B3 / 1.4)", async ({ page }) => {
    await page.route("**/api/set-effect", () => {}); // never resolves — a genuinely wedged overlay

    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.locator(".fx-advanced").click();
    const ma = page.locator("#multi-arm-automation");
    await expect(ma).toBeVisible();

    await ma.locator("select").nth(0).selectOption("sensor");
    await ma.locator(".ma-section").nth(0).locator("select").nth(1).selectOption({ index: 1 });
    const armEditor = ma.locator(".ma-section", { hasText: "Add an arm" });
    await armEditor.locator("select").nth(0).selectOption({ index: 1 });
    await armEditor.locator("select").nth(1).selectOption("true");
    await ma.locator(".add-range-btn", { hasText: "Add arm" }).click();
    await expect(ma.locator(".ma-arm-row")).toHaveCount(1);

    await ma.locator(".ma-save").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#multi-arm-automation")).toBeVisible(); // still open — the save never resolved

    // Regression guard: tearing down the stale overlay used to race its own exit animation —
    // reopening before the old one's data/template were actually cleared made bindrjs
    // re-evaluate the OUTGOING template's bindings (e.g. the arms list) against the fresh,
    // differently-shaped data, which threw.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // The "Add automation" CTA is legitimately covered by the open overlay's full-screen
    // backdrop — that's expected (this isn't a hit-testing test). Dispatch its click
    // programmatically to invoke the SAME openOverlay() call a second legitimate trigger
    // would make, and prove it no longer silently no-ops against the stuck overlay.
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>(".effects-actions .add-range-btn"))
        .find((b) => b.textContent?.includes("Add automation"));
      btn?.click();
    });
    await expect(page.locator("#new-automation")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#multi-arm-automation")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
