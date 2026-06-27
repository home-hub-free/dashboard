import { BrowserContext, Page } from "@playwright/test";
import * as fx from "./fixtures";

const json = (data: any) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(data),
});

/**
 * Make the SPA boot fully offline: seed a fake session so the login gate passes,
 * then intercept every backend call (hub /api, /memory, /speaker, /gateway, /tts,
 * /voice) with fixtures, and abort the realtime sockets (the UI renders from the
 * initial REST sync without them). Generic catch-alls are registered first so the
 * specific GET handlers registered after take precedence (last route wins).
 */
export async function seedSession(context: BrowserContext, authed = true) {
  await context.addInitScript(
    ({ user, authed }) => {
      if (authed) {
        localStorage.setItem("authToken", JSON.stringify("pw-token"));
        localStorage.setItem("authUser", JSON.stringify(user));
      } else {
        localStorage.removeItem("authToken");
        localStorage.removeItem("authUser");
      }
      localStorage.setItem("activeMenuItemId", JSON.stringify("home"));
    },
    { user: fx.user, authed },
  );
}

export async function stubBackend(page: Page) {
  // realtime transports — abort so connections fail fast and quietly
  await page.route("**/socket.io/**", (r) => r.abort());
  await page.route("**/camera/**", (r) => r.abort());

  // generic service catch-alls (low priority)
  await page.route("**/api/**", (r) => r.fulfill(json({ success: true })));
  await page.route("**/memory/**", (r) => r.fulfill(json({ ok: true, candidates: [] })));
  await page.route("**/gateway/**", (r) => r.fulfill(json({ choices: [{ message: { content: "Sure — done." } }] })));
  await page.route("**/tts/**", (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: "" }));
  await page.route("**/voice/**", (r) => r.fulfill(json({ text: "" })));
  await page.route("**/speaker/**", (r) => r.fulfill(json({ ok: true })));

  // specific GETs (high priority — registered last)
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: fx.user })));
  await page.route("**/api/get-devices", (r) => r.fulfill(json(fx.devices)));
  await page.route("**/api/get-sensors", (r) => r.fulfill(json(fx.sensors)));
  await page.route("**/api/get-effects-dynamic", (r) => r.fulfill(json(fx.effects)));
  await page.route("**/api/get-effects", (r) => r.fulfill(json(fx.effects)));
  await page.route("**/api/get-zones", (r) => r.fulfill(json(fx.zones)));
  await page.route("**/speaker/health", (r) => r.fulfill(json({ ok: true })));
  await page.route("**/speaker/profiles", (r) => r.fulfill(json(fx.profiles)));
}
