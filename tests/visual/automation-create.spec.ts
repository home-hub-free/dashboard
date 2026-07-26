import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";
import { expectOverlayScrollSane } from "./scroll-checks";
import * as fx from "./fixtures";

// Permanent regression coverage for the effect-creation E2E repair
// (docs/plans/EFFECT_CREATION_REPAIR.md). Phases 1-4 fixed the feedback/failure paths of the
// OLD two-fork flow ("Add automation" / "Advanced rule" — new-automation-overlay.html /
// multi-arm-overlay.html); Phase 5 REPLACED that flow outright with ONE progressive-disclosure
// overlay (#create-automation, create-automation.ts) per D1 — this file is rewritten against
// the new selectors, but every Phase 1/3 behavior it protects (visible feedback, optimistic
// close, unwedgeable overlays, one-POST-per-save, duplicate pre-check + 409) is preserved
// verbatim, plus the new Phase-5 capabilities (time-trigger creation, D4 target filtering/
// disambiguation, D8 staged-arm editing, the wrapped-guard round-trip).
//   B1 — toasts rendered UNDER the overlay modal (invisible feedback)
//   B2 — an unprotected save→reload→close chain: any rejection left the modal
//        open with zero feedback while the rule was already saved
//   B3 — a stuck-visible overlay made openOverlay() silently no-op app-wide
//   B5 — the old simple flow had NO Save button for a time trigger at all

const json = (data: any) => ({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

// ── Real hub data shapes (ported from the audit's zz-freeze-repro2.spec.ts) ────────────────
// Cameras stay in the device roster — the target list must filter them out itself (D4), not
// rely on the fixture omitting them. "Cocina" is deliberately ambiguous three ways: a camera
// (excluded from targets entirely) and TWO actuatable devices (a dimmable light and a plain
// light, same zone) — the only way anything is left to disambiguate is D4's category suffix.
const realDevices = [
  { id: "5187202", name: "Lampara", value: false, type: "boolean", deviceCategory: "light", manual: false, operationalRanges: [], zone: "sala", channels: [{ key: "power", role: "actuator", kind: "boolean", writable: true }], channelAware: false },
  { id: "mc200", name: "Entrada principal", value: null, type: "value", deviceCategory: "camera", manual: false, operationalRanges: [], zone: "entrada" },
  { id: "c110-45da", name: "Sala", value: null, type: "value", deviceCategory: "camera", manual: false, operationalRanges: [], zone: "sala" },
  { id: "c110-6946", name: "Cocina", value: null, type: "value", deviceCategory: "camera", manual: false, operationalRanges: [], zone: "cocina" },
  { id: "10260975", name: "Aire oficina", value: { fan: false, water: false, target: 24, "room-temp": 26, "unit-temp": 19 }, type: "value", deviceCategory: "evap-cooler", manual: false, operationalRanges: [], zone: "oficina" },
  { id: "10039254", name: "Cocina", value: 0, type: "value", deviceCategory: "dimmable-light", manual: false, operationalRanges: [], zone: "cocina" },
  { id: "cocina-light", name: "Cocina", value: false, type: "boolean", deviceCategory: "light", manual: false, operationalRanges: [], zone: "cocina" },
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

  async function openCreateOverlay(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await expect(page.locator(".effects-list")).toBeVisible();
    await page.locator(".effects-actions .add-range-btn", { hasText: "Add automation" }).click();
    const ov = page.locator("#create-automation");
    await expect(ov).toBeVisible();
    return ov;
  }

  test("multi-arm happy path: presence -> dimmable brightness arms, one POST, modal closes (D7 byte-identical)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const posts: any[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/set-effect$/.test(r.url())) posts.push(r.postDataJSON());
    });

    const ov = await openCreateOverlay(page);

    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("10192655"); // presence "Cocina"

    // arm 1: dimmable "Cocina" (the light, NOT the camera or the plain light of the same
    // name) -> 50 -> 07:00-11:00
    await ov.locator("#ca-device-select").selectOption("10039254");
    await ov.locator("#ca-setto-input").fill("50");
    await ov.locator(".toggle-button", { hasText: "Time of day" }).nth(1).click(); // guard type
    await ov.locator(".toggle-button", { hasText: /^Between$/ }).click();
    await page.waitForSelector("#ca-guard-time-mount .tt-input", { timeout: 5000 });
    await ov.locator('#ca-guard-time-mount input[data-kind="from"]').fill("07:00");
    await ov.locator('#ca-guard-time-mount input[data-kind="from"]').dispatchEvent("change");
    await ov.locator('#ca-guard-time-mount input[data-kind="to"]').fill("11:00");
    await ov.locator('#ca-guard-time-mount input[data-kind="to"]').dispatchEvent("change");
    await ov.locator("button", { hasText: "Add another action" }).click();
    await expect(ov.locator(".ca-arm-row")).toHaveCount(1, { timeout: 5000 });

    // arm 2: SAME device, value 10, no guard (the else/default arm)
    await ov.locator("#ca-device-select").selectOption("10039254");
    await ov.locator("#ca-setto-input").fill("10");
    await ov.locator("button", { hasText: "Add another action" }).click();
    await expect(ov.locator(".ca-arm-row")).toHaveCount(2, { timeout: 5000 });

    await ov.locator("button.btn-primary", { hasText: "Save automation" }).click();
    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });

    expect(errors).toEqual([]);
    expect(posts.length).toBe(1);
    const body = posts[0]?.effect;
    expect(body.trigger).toEqual({ source: "sensor", nodeId: "10192655", channel: "presence" });
    expect(body.arms).toHaveLength(2);
    expect(body.arms[0]).toEqual({ when: [{ kind: "time", op: "between", from: "07:00", to: "11:00" }], set: { nodeId: "10039254", channel: "brightness", value: 50 } });
    expect(body.arms[1]).toEqual({ when: [], set: { nodeId: "10039254", channel: "brightness", value: 10 } });
  });

  test("cameras never appear as targets; duplicate 'Cocina' names disambiguate by category (D4)", async ({ page }) => {
    const ov = await openCreateOverlay(page);
    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("10192655");

    const options = await ov.locator("#ca-device-select option").allTextContents();
    expect(options.some((t) => t.includes("Entrada principal"))).toBe(false); // camera
    expect(options.some((t) => t === "Sala — sala")).toBe(false); // camera named "Sala" absent…
    expect(options.some((t) => t.includes("Aire oficina"))).toBe(true); // …but the real cooler survives
    expect(options.some((t) => t === "Cocina — cocina (dimmable)")).toBe(true);
    expect(options.some((t) => t === "Cocina — cocina (light)")).toBe(true);
    expect(options.some((t) => t === "Cocina — cocina")).toBe(false); // never the bare, ambiguous form
  });

  test("a time-trigger rule is creatable and saveable (kills B5)", async ({ page }) => {
    const posts: any[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/set-effect$/.test(r.url())) posts.push(r.postDataJSON());
    });
    const ov = await openCreateOverlay(page);

    await ov.locator(".toggle-button", { hasText: "Time of day" }).first().click();
    await page.waitForSelector("#ca-when-time-mount .tt-input", { timeout: 5000 });
    await ov.locator('#ca-when-time-mount input[data-kind="at"]').fill("22:30");
    await ov.locator('#ca-when-time-mount input[data-kind="at"]').dispatchEvent("change");
    await ov.locator("#ca-device-select").selectOption("5187202"); // Lampara
    await ov.locator(".toggle-button", { hasText: "Turn on" }).click();

    await ov.locator("button.btn-primary", { hasText: "Save automation" }).click();
    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });
    expect(posts.length).toBe(1);
    const body = posts[0]?.effect;
    expect(body.trigger).toEqual({ source: "time", at: "22:30" });
    expect(body.arms).toEqual([{ when: [], set: { nodeId: "5187202", channel: "power", value: true } }]);
  });

  test("a single-arm rule keeps BOTH the sensor predicate AND a configured guard (no silent drop)", async ({ page }) => {
    // A real gap the unified builder had to get right: the "Only when" guard is offered
    // regardless of arm count, so a rule that never goes multi-arm must not have it vanish.
    const posts: any[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/set-effect$/.test(r.url())) posts.push(r.postDataJSON());
    });
    const ov = await openCreateOverlay(page);

    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("10192655");
    await ov.locator(".toggle-button", { hasText: /^Active$/ }).click();
    await ov.locator("#ca-device-select").selectOption("cocina-light");
    await ov.locator(".toggle-button", { hasText: "Turn on" }).click();
    await ov.locator(".toggle-button", { hasText: "Time of day" }).nth(1).click();
    await ov.locator(".toggle-button", { hasText: /^After$/ }).click();
    await page.waitForSelector("#ca-guard-time-mount .tt-input", { timeout: 5000 });
    await ov.locator('#ca-guard-time-mount input[data-kind="at"]').fill("18:00");
    await ov.locator('#ca-guard-time-mount input[data-kind="at"]').dispatchEvent("change");

    // Never staged via "Add another action" — this stays a single-arm rule.
    await ov.locator("button.btn-primary", { hasText: "Save automation" }).click();
    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });
    expect(posts.length).toBe(1);
    const body = posts[0]?.effect;
    expect(body.arms).toHaveLength(1);
    expect(body.arms[0].when).toEqual([
      { kind: "sensor", nodeId: "10192655", channel: "presence", op: "eq", value: true },
      { kind: "time", op: "after", from: "18:00" },
    ]);
  });

  test("a wrapped 'between' guard (22:00 -> 06:00) round-trips through stage/edit unchanged", async ({ page }) => {
    const posts: any[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/set-effect$/.test(r.url())) posts.push(r.postDataJSON());
    });
    const ov = await openCreateOverlay(page);

    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("10192655");
    await ov.locator(".toggle-button", { hasText: /^Active$/ }).click();
    await ov.locator("#ca-device-select").selectOption("5187202");
    await ov.locator(".toggle-button", { hasText: "Turn on" }).click();
    await ov.locator(".toggle-button", { hasText: "Time of day" }).nth(1).click();
    await ov.locator(".toggle-button", { hasText: /^Between$/ }).click();
    await page.waitForSelector("#ca-guard-time-mount .tt-input", { timeout: 5000 });
    await ov.locator('#ca-guard-time-mount input[data-kind="from"]').fill("22:00");
    await ov.locator('#ca-guard-time-mount input[data-kind="from"]').dispatchEvent("change");
    await ov.locator('#ca-guard-time-mount input[data-kind="to"]').fill("06:00");
    await ov.locator('#ca-guard-time-mount input[data-kind="to"]').dispatchEvent("change");

    // The wrap renders as two fill segments (Phase 4 D3) even inside the create flow's mount.
    await expect(ov.locator('#ca-guard-time-mount .tt-fill[data-seg="a"]')).toBeVisible();
    await expect(ov.locator('#ca-guard-time-mount .tt-fill[data-seg="b"]')).toBeVisible();

    await ov.locator("button", { hasText: "Add another action" }).click();
    await expect(ov.locator(".ca-arm-row")).toHaveCount(1);

    // Tap-to-edit (D8): reload the staged arm and confirm the wrap survives the round-trip.
    await ov.locator(".ca-arm-edit").first().click();
    await expect(ov.locator("button", { hasText: "Save arm" })).toBeVisible();
    await expect(ov.locator('#ca-guard-time-mount input[data-kind="from"]')).toHaveValue("22:00");
    await expect(ov.locator('#ca-guard-time-mount input[data-kind="to"]')).toHaveValue("06:00");
    await expect(ov.locator('#ca-guard-time-mount .tt-fill[data-seg="a"]')).toBeVisible();
    await expect(ov.locator('#ca-guard-time-mount .tt-fill[data-seg="b"]')).toBeVisible();
    await ov.locator("button", { hasText: "Save arm" }).click();
    await expect(ov.locator(".ca-arm-row")).toHaveCount(1); // replaced in place, not duplicated

    await ov.locator("button.btn-primary", { hasText: "Save automation" }).click();
    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });
    expect(posts.length).toBe(1);
    const arm = posts[0]?.effect?.arms[0];
    expect(arm.when).toEqual([{ kind: "time", op: "between", from: "22:00", to: "06:00" }]);
  });

  test("Save stays reachable by scrolling inside the sheet with 3 staged arms (phone)", async ({ page }) => {
    const posts: any[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/set-effect$/.test(r.url())) posts.push(r.postDataJSON());
    });
    const ov = await openCreateOverlay(page);

    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("10192655");
    await ov.locator(".toggle-button", { hasText: /^Active$/ }).click();

    for (const value of [30, 60, 90]) {
      await ov.locator("#ca-device-select").selectOption("10039254");
      await ov.locator("#ca-setto-input").fill(String(value));
      await ov.locator("button", { hasText: "Add another action" }).click();
    }
    await expect(ov.locator(".ca-arm-row")).toHaveCount(3);

    // Standing scroll-sanity coverage (EFFECT_CREATION_FOLLOWUPS 1.1/1.2): no
    // horizontal overflow, the sheet itself scrolls, and its last control
    // (Save, in DOM order) is reachable + actionable once scrolled to.
    await expectOverlayScrollSane(page);
    const saveBtn = ov.locator("button.btn-primary", { hasText: "Save automation" });
    await expect(saveBtn).toBeInViewport();
    await saveBtn.click();

    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });
    expect(posts.length).toBe(1);
    expect(posts[0]?.effect?.arms).toHaveLength(3);
  });
});

test.describe("automation creation — feedback & failure paths", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  async function openCreateOverlay(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.locator(".effects-actions .add-range-btn", { hasText: "Add automation" }).click();
    const ov = page.locator("#create-automation");
    await expect(ov).toBeVisible();
    return ov;
  }

  test("an 'already staged' toast renders visibly above the open modal (B1 / 1.1, D8)", async ({ page }) => {
    const ov = await openCreateOverlay(page);
    // Standing scroll-sanity coverage on the freshly opened, still-empty
    // builder (desktop viewport) — EFFECT_CREATION_FOLLOWUPS 1.1/1.2.
    await expectOverlayScrollSane(page);
    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption({ index: 1 });
    await ov.locator(".toggle-button", { hasText: /^Active$/ }).click();
    await ov.locator("#ca-device-select").selectOption({ index: 1 });
    await ov.locator(".toggle-button", { hasText: "Turn on" }).click();
    await ov.locator("button", { hasText: "Add another action" }).click();
    await expect(ov.locator(".ca-arm-row")).toHaveCount(1);

    // Re-fill the SAME device/value/guard and try to stage it again — D8 blocks an exact
    // duplicate arm with a toast rather than silently staging (or silently dropping) it.
    await ov.locator("#ca-device-select").selectOption({ index: 1 });
    await ov.locator(".toggle-button", { hasText: "Turn on" }).click();
    await ov.locator("button", { hasText: "Add another action" }).click();

    const toast = page.locator("#popup-message-container .toaster-container");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("already in this rule");
    await expect(ov.locator(".ca-arm-row")).toHaveCount(1); // not staged twice

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

    const ov = await openCreateOverlay(page);
    // "Turn off" (not "true", like fx.effects[0]'s dev-ceiling/sen-motion rule) — the D2
    // client pre-check would otherwise flag this as a pre-existing duplicate and block the
    // POST this test exists to exercise.
    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("sen-motion");
    await ov.locator(".toggle-button", { hasText: /^Active$/ }).click();
    await ov.locator("#ca-device-select").selectOption("dev-ceiling");
    await ov.locator(".toggle-button", { hasText: "Turn off" }).click();

    await ov.locator("button.btn-primary", { hasText: "Save automation" }).click();

    // Closes on the strength of the POST alone (D5 optimistic close) — a broken background
    // refresh must not re-open the modal, wedge the app, or read as a save failure.
    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });
    const toast = page.locator("#popup-message-container .toaster-container");
    await expect(toast).toContainText(/didn't refresh/);
    expect(posts.length).toBe(1);

    // The app stays usable — a fresh overlay still opens normally afterward.
    await page.locator(".effects-actions .add-range-btn", { hasText: "Add automation" }).click();
    await expect(page.locator("#create-automation")).toBeVisible();
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

    const ov = await openCreateOverlay(page);
    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("sen-motion");
    await ov.locator(".toggle-button", { hasText: /^Active$/ }).click();
    await ov.locator("#ca-device-select").selectOption("dev-ceiling");
    await ov.locator(".toggle-button", { hasText: "Turn off" }).click();

    const saveBtn = ov.locator("button.btn-primary", { hasText: "Save automation" });
    await saveBtn.click();
    // The first tap already latches `saving` + the .busy (pointer-events:none) class, so a real
    // second tap couldn't even land on the button. Dispatch the second click programmatically —
    // this is what actually proves the JS-level guard (the authoritative one per D5), not just
    // the CSS affordance that stops a normal double-tap from reaching the handler at all.
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("#create-automation button.btn-primary"))
        .find((b) => b.textContent?.includes("Save"));
      btn?.click();
    });
    await page.waitForTimeout(150);
    expect(posts.length).toBe(1); // the guard blocked the second tap before any second request

    resolveRoute?.();
    await expect(page.locator(".overlay-modal-content")).toBeHidden({ timeout: 5000 });
    expect(posts.length).toBe(1);
  });

  test("a stuck-open modal (e.g. a hung save) doesn't block a totally different overlay from opening (B3 / 1.4)", async ({ page }) => {
    await page.route("**/api/set-effect", () => {}); // never resolves — a genuinely wedged overlay

    const ov = await openCreateOverlay(page);
    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("sen-motion");
    await ov.locator(".toggle-button", { hasText: /^Active$/ }).click();
    await ov.locator("#ca-device-select").selectOption("dev-kitchen"); // not fx.effects[0]'s target
    await ov.locator(".toggle-button", { hasText: "Turn on" }).click();
    await ov.locator("button.btn-primary", { hasText: "Save automation" }).click();
    await page.waitForTimeout(300);
    await expect(page.locator("#create-automation")).toBeVisible(); // still open — the save never resolved

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // A DIFFERENT overlay template entirely (the per-row focused edit sheet, #edit-automation,
    // opened from an EXISTING rule's ✎ — fx.effects[0] is a simple single-arm rule so it's
    // editable) — proves the fix is generic, not something specific to create-automation
    // reopening itself. (A device tile's overlay would make an even stronger cross-VIEW case,
    // but Home's tiles aren't mounted at all here — switching tabs is a separate concern from
    // what B3/1.4 guards.) The row's ✎ is legitimately covered by the open overlay's
    // full-screen backdrop (expected — this isn't a hit-testing test), so dispatch the click
    // programmatically, same as the CTA in the tests above.
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>(".effect-row .effect-edit")?.click();
    });
    await expect(page.locator("#edit-automation")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#create-automation")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // ── Duplicate UX (EFFECT_CREATION_REPAIR Phase 3 / D2) ──────────────────────────────────
  // Two cases: the client-side pre-check (findDuplicateEffect against store.get('effects'))
  // catches an exact duplicate before any network call; a stubbed 409 proves the server-side
  // belt still produces the identical user-facing outcome for state the client hasn't caught
  // up with yet. Both must leave the modal open — this is a rejected save, not a completed one.

  test("saving an exact duplicate of an existing rule shows 'already exists' and posts nothing (3.2 pre-check)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/set-effect")) posts.push(r.url());
    });

    const ov = await openCreateOverlay(page);
    // Recreate fx.effects[0] verbatim: sen-motion (presence, true) -> dev-ceiling power = true.
    // Structurally identical to the already-loaded rule, so the client pre-check must catch
    // it before saveEffect() ever fires a POST.
    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("sen-motion");
    await ov.locator(".toggle-button", { hasText: /^Active$/ }).click();
    await ov.locator("#ca-device-select").selectOption("dev-ceiling");
    await ov.locator(".toggle-button", { hasText: "Turn on" }).click();

    await ov.locator("button.btn-primary", { hasText: "Save automation" }).click();

    const toast = page.locator("#popup-message-container .toaster-container");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("That automation already exists");
    await expect(page.locator("#create-automation")).toBeVisible(); // rejected save — modal stays open
    expect(posts.length).toBe(0); // the pre-check blocked it before any request reached the network
    expect(errors).toEqual([]);
  });

  test("a stubbed 409 from the server shows the same 'already exists' toast and keeps the modal open (3.2 belt case)", async ({ page }) => {
    await page.route("**/api/set-effect", (route) =>
      route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, duplicate: true, existingId: 1 }) }),
    );
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/set-effect")) posts.push(r.url());
    });

    const ov = await openCreateOverlay(page);
    // dev-kitchen / sen-presence has no match anywhere in fx.effects, so the CLIENT pre-check
    // finds nothing and lets the POST through — this isolates the server-409 handling path
    // (DuplicateEffectError) from the pre-check exercised by the previous test.
    await ov.locator(".toggle-button", { hasText: "Sensor" }).first().click();
    await ov.locator("select").first().selectOption("sen-presence");
    await ov.locator(".toggle-button", { hasText: /^Active$/ }).click();
    await ov.locator("#ca-device-select").selectOption("dev-kitchen");
    await ov.locator(".toggle-button", { hasText: "Turn on" }).click();

    await ov.locator("button.btn-primary", { hasText: "Save automation" }).click();

    const toast = page.locator("#popup-message-container .toaster-container");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("That automation already exists");
    await expect(page.locator("#create-automation")).toBeVisible(); // rejected save — modal stays open
    expect(posts.length).toBe(1); // this time the request DID reach the (stubbed) server
  });
});
