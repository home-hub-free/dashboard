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
  // MJPEG live views (vision-service /vision/stream/*) — abort, never buffer
  await page.route("**/vision/stream/**", (r) => r.abort());

  // generic service catch-alls (low priority)
  await page.route("**/api/**", (r) => r.fulfill(json({ success: true })));
  await page.route("**/memory/**", (r) => r.fulfill(json({ ok: true, candidates: [] })));
  await page.route("**/gateway/**", (r) => r.fulfill(json({ choices: [{ message: { content: "Sure — done." } }] })));
  await page.route("**/tts/**", (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: "" }));
  await page.route("**/voice/**", (r) => r.fulfill(json({ text: "" })));
  await page.route("**/speaker/**", (r) => r.fulfill(json({ ok: true })));
  await page.route("**/calendar/**", (r) => r.fulfill(json({ ok: true })));

  // specific GETs (high priority — registered last)
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: fx.user })));
  await page.route("**/api/auth/users", (r) => r.fulfill(json({ users: fx.households })));
  // Guest registry (Settings → Guests): an in-memory store so add / relation / treatment round-trip.
  const guests: any[] = [
    { id: "lupita", name: "Lupita", aliases: ["Doña Lupe"], treatment: "usted", notes: "", relations: [{ memberId: "u1", memberName: "David", relation: "mamá" }], createdAt: "", updatedAt: "" },
  ];
  await page.route("**/api/guests**", (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const parts = url.pathname.split("/").filter(Boolean); // api, guests, :id?, relations?, :memberId?
    const id = parts[2] ? decodeURIComponent(parts[2]) : undefined;
    const body = req.method() === "GET" || req.method() === "DELETE" ? {} : (req.postDataJSON() ?? {});
    const find = (gid: string) => guests.find((g) => g.id === gid);
    const member = (mid: string) => fx.households.find((u) => u.id === mid);
    if (req.method() === "GET") return r.fulfill(json({ ok: true, guests }));
    if (req.method() === "POST" && !id) {
      const g = { id: String(body.name).toLowerCase(), name: body.name, aliases: body.aliases ?? [], treatment: body.treatment ?? "", notes: "", createdAt: "", updatedAt: "",
        relations: (body.relations ?? []).map((x: any) => ({ memberId: x.memberId, memberName: member(x.memberId)?.displayName ?? x.memberId, relation: x.relation })) };
      guests.push(g);
      return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, guest: g }) });
    }
    const g = find(id);
    if (!g) return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: "not found" }) });
    if (req.method() === "PATCH") { Object.assign(g, { treatment: body.treatment ?? g.treatment, name: body.name ?? g.name }); return r.fulfill(json({ ok: true, guest: g })); }
    if (req.method() === "DELETE" && parts[3] === "relations") { g.relations = g.relations.filter((x: any) => x.memberId !== parts[4]); return r.fulfill(json({ ok: true, guest: g })); }
    if (req.method() === "DELETE") { guests.splice(guests.indexOf(g), 1); return r.fulfill(json({ ok: true })); }
    if (req.method() === "PUT" && parts[3] === "relations") {
      g.relations = [...g.relations.filter((x: any) => x.memberId !== parts[4]), { memberId: parts[4], memberName: member(parts[4])?.displayName ?? parts[4], relation: body.relation }];
      return r.fulfill(json({ ok: true, guest: g }));
    }
    return r.fulfill(json({ ok: true }));
  });
  await page.route("**/api/get-devices", (r) => r.fulfill(json(fx.devices)));
  await page.route("**/api/get-sensors", (r) => r.fulfill(json(fx.sensors)));
  await page.route("**/api/get-effects-dynamic", (r) => r.fulfill(json(fx.effects)));
  await page.route("**/api/get-effects", (r) => r.fulfill(json(fx.effects)));
  await page.route("**/api/get-zones", (r) => r.fulfill(json(fx.zones)));
  // Hub agenda (LOCAL_AGENDA): reads answer the fixture; writes echo ok (asserted by agenda.spec).
  await page.route("**/api/agenda**", (r) =>
    r.request().method() === "GET"
      ? r.fulfill(json({ ok: true, items: fx.agendaItems }))
      : r.fulfill(json({ ok: true, item: { id: "new", kind: "event" } })));
  await page.route("**/speaker/health", (r) => r.fulfill(json({ ok: true })));
  await page.route("**/speaker/profiles", (r) => r.fulfill(json(fx.profiles)));
  await page.route("**/memory/candidates", (r) => r.fulfill(json(fx.candidates)));
  // calendar-service (Settings → Google Calendar card) — SA mode with long emails.
  await page.route("**/calendar/status", (r) => r.fulfill(json(fx.calendarStatus)));
  await page.route("**/calendar/calendars", (r) => r.fulfill(json(fx.calendarsView)));
  // vision-service world-model poll + camera controls (hub /camera/:id proxy).
  await page.route("**/vision/occupancy", (r) => r.fulfill(json(fx.visionOccupancy)));
  await page.route("**/vision/health", (r) => r.fulfill(json({ ok: true })));
  await page.route("**/api/camera/*/controls", (r) => {
    const id = decodeURIComponent(r.request().url().split("/camera/")[1].split("/")[0]);
    const ctl = fx.cameraControls[id];
    return ctl ? r.fulfill(json(ctl)) : r.fulfill(json({ cam_id: id, onvif: null, reachable: false }));
  });
  await page.route("**/api/camera/**/ptz/**", (r) => r.fulfill(json({ ok: true, zone: "entrance", ttl_s: 0.4 })));
  await page.route("**/api/camera/**/imaging", (r) => r.fulfill(json({ ok: true, zone: "entrance", imaging: { brightness: 60, saturation: 50, contrast: 50, sharpness: 50 } })));

  // Assistant chat history: list + per-chat transcript (close/delete fall through to the catch-all).
  await page.route("**/api/assistant/chats", (r) =>
    r.request().method() === "GET" ? r.fulfill(json({ ok: true, chats: fx.chatMetas })) : r.fulfill(json({ ok: true })));
  await page.route("**/api/assistant/chats/*", (r) => {
    const id = r.request().url().split("/").pop()!.split("?")[0];
    const chat = fx.chatFull[id];
    return chat ? r.fulfill(json({ ok: true, chat })) : r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not found"}' });
  });
}
