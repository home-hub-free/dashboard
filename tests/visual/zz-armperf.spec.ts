import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";

// TEMPORARY diagnostic (bindrjs perf audit 2026-07-26): stage 12 arms in the unified
// builder and time each stage. Managed by docs/plans/BINDRJS_REPROXY_PERF_HANDOFF.md —
// §7 "Repro harness" names this file as the consumer E2E probe (kept test.skip-gated,
// re-run once un-skipped after the library fix lands to confirm a flat profile, then
// re-skipped — wall-clock asserts stay out of the default suite); §8 "Acceptance
// criteria" #4 is the bar it validates against. Skip-gated (EFFECT_CREATION_FOLLOWUPS
// 1.4) rather than deleted — this is the post-fix validation vehicle, not dead code.
test.describe.skip("arm staging perf probe", () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  test("stage 12 arms, per-add wall time", async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Automations" }).first().click();
    await page.locator(".effects-actions button").first().click();
    const ov = page.locator("#create-automation");
    await expect(ov).toBeVisible();

    await ov.locator(".toggle-button", { hasText: "Sensor" }).click();
    await ov.locator("select.dropdown").first().selectOption({ index: 1 });
    await ov.getByRole("button", { name: "Active", exact: true }).click();

    const timings: number[] = [];
    for (let i = 0; i < 12; i++) {
      await ov.locator("#ca-device-select").selectOption("dev-lamp");
      await ov.locator("#ca-setto-input").fill(String(5 + i * 5)); // distinct value → distinct arm
      const t0 = Date.now();
      await ov.locator(".ca-stage-row button.btn-outline").click();
      await expect(ov.locator(".ca-arm-row")).toHaveCount(i + 1, { timeout: 120_000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(1))));
      timings.push(Date.now() - t0);
      console.log(`[arm ${i + 1}] ${timings[i]}ms`);
    }
    console.log("[timings]", JSON.stringify(timings));
    console.log("[errors]", JSON.stringify(errors));
  });
});
