import { AutoEffect } from "../views/automations/automations.model";
import { Candidate } from "../views/automations/discovery-review/discovery-review.model";
import { authHeaders, currentUser, getToken, handleUnauthorized } from "./auth";

// Hub (Express) base URL. SAME-ORIGIN relative path behind nginx (`/api/` → :8088)
// so dashboard↔hub fetches AND the Socket.IO stream ride the page's (https) secure
// context — no CORS, no mixed content. That secure context is the prerequisite for the
// browser mic (getUserMedia). Overridable via VITE_SERVER_URL to talk to a hub directly;
// the `npm run dev` Vite proxy maps `/api` → the box, so the relative default also works
// in dev (see vite.config.js).
export const server =
  (import.meta as any).env?.VITE_SERVER_URL || "/api/";

// memory-service base URL — the Pattern Discovery candidate queue lives here (:8120),
// separate from the hub. Same-origin behind nginx (`/memory/` → :8120), so it rides the
// page's secure context too (no mixed content). nginx — not the hub — does the routing,
// so the hub still never touches the memory path (CLAUDE.md "hub never touches
// memory-service"). Overridable via VITE_MEMORY_URL.
export const memoryServer =
  (import.meta as any).env?.VITE_MEMORY_URL || "/memory/";

// Voice-request path. These three services sit behind the same nginx as the
// dashboard, so the defaults are SAME-ORIGIN relative paths (/gateway/, /voice/,
// /tts/) — which also means the browser mic + fetches need no CORS and ride the
// page's (https) secure context. Overridable per-service for local dev.
export const gatewayServer =
  (import.meta as any).env?.VITE_GATEWAY_URL || "/gateway/";
export const voiceServer =
  (import.meta as any).env?.VITE_VOICE_URL || "/voice/";
export const ttsServer =
  (import.meta as any).env?.VITE_TTS_URL || "/tts/";
// Speaker-ID (voiceprint) service — enrollment for the Household voice-ID control.
// Same-origin behind nginx like the other voice services; overridable for dev.
export const speakerServer =
  (import.meta as any).env?.VITE_SPEAKER_URL || "/speaker/";
// vision-service (camera perception) — the camera live view + occupancy world-model +
// Face-ID enrollment all come from here (NOT the hub, NOT the camera directly — the
// vision-service is the single consumer of each cam stream, CAMERA_VISION_PLAN §3.2).
// Same-origin behind nginx (`/vision/` → :8130); overridable for dev.
export const visionServer =
  (import.meta as any).env?.VITE_VISION_URL || "/vision/";
// calendar-service (Google Calendar) — the Settings → Household "Connect Google Calendar"
// enrollment opens this service's OAuth flow in the browser. Same-origin behind nginx
// (`/calendar/` → :8150); overridable for dev (CALENDAR_PLAN §6).
export const calendarServer =
  (import.meta as any).env?.VITE_CALENDAR_URL || "/calendar/";

/** What the agent decided this turn (mirrors llm-gateway /route `x_action`). */
export type AgentAction = { tool: string; args?: any } | { error: string };
export type AgentReply = { speech: string; action?: AgentAction };

/**
 * How an agent request learned who is asking. One identity space (the household
 * `users` roster) across every surface — only the *evidence* differs:
 *  - `login`     — an authenticated dashboard session (this file).
 *  - `voiceprint`— a satellite speaker-ID match (voice-pipeline, separate repo).
 *  - `declared`  — the speaker said who they are / a per-member name.
 *  - `presence`  — inferred from who is in the satellite's zone (a weak prior).
 *  - `unknown`   — unresolved; the agent should stay generic / confirm.
 */
export type IdentityVia = "login" | "voiceprint" | "declared" | "presence" | "unknown";

/**
 * The identity envelope sent as `data.user` on the agent request (llm-gateway
 * `/route`). `confidence` (0..1) lets the agent gate behaviour: high → personalise
 * silently; low/unknown → respond generically and skip preference/permission-
 * sensitive actions (or ask "who's this?"). The voice path fills the same shape.
 */
export type AgentUserContext = {
  id: string;
  name: string;
  tone?: string;
  via: IdentityVia;
  confidence: number;
};

/**
 * Send recorded audio to the voice-pipeline STT head (Whisper) and return the
 * transcript. The multipart field MUST be `audio` (the Go head + worker both read
 * `audio`). Pass a WAV blob — the worker decodes with libsndfile, which rejects
 * webm/opus (see audio-wav.ts; callers convert via blobToWav16k first).
 */
export async function transcribeAudio(
  blob: Blob,
): Promise<{ text: string; inferSec?: number }> {
  const form = new FormData();
  form.append("audio", blob, "audio.wav");
  const res = await fetch(voiceServer + "transcribe", { method: "POST", body: form });
  if (!res.ok) throw new Error(`transcribe failed (${res.status})`);
  const data = await res.json();
  // `infer_sec` is the worker's pure inference time (additive — older voice-pipeline omits it),
  // letting the voice-turn waterfall split STT compute from upload/VAD/queue overhead.
  return {
    text: String(data?.text ?? "").trim(),
    inferSec: typeof data?.infer_sec === "number" ? data.infer_sec : undefined,
  };
}

/** Per-stage timings (ms) the dashboard measures for one push-to-talk round-trip. */
export interface VoiceTurnStages {
  capture?: number;
  stt?: number;
  sttCompute?: number;
  agent?: number;
  tts?: number;
  playback?: number;
}

/**
 * Fire-and-forget E2E voice-turn beacon → llm-gateway (`/gateway/voice/turn`, same https origin so
 * no mixed-content). The gateway rings + SSEs it for the ops-dashboard's voice-turn waterfall. Never
 * throws into the voice flow — observability must not break the feature. Identity is attached the
 * same way as askAgent so a turn shows *who* spoke.
 */
export function reportVoiceTurn(rec: {
  id: string;
  path?: string;
  transcript?: string;
  reply?: string;
  tool?: string;
  ok: boolean;
  error?: string;
  stages: VoiceTurnStages;
  totalMs: number;
}): void {
  try {
    const user = currentUser();
    const body = {
      ...rec,
      path: rec.path ?? "dashboard",
      user: user ? { id: user.id, name: user.displayName } : undefined,
    };
    void fetch(gatewayServer + "voice/turn", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      keepalive: true, // let it complete even if the page/tab is navigating away
    }).catch(() => {});
  } catch {
    /* never let telemetry break the voice path */
  }
}

/**
 * Enroll a voice sample for the signed-in member. The speaker-id service validates
 * the bearer token against the hub (`/auth/me`) and enrolls for THAT user — you can
 * only enroll yourself. Returns the running sample count. The audio rides the page's
 * secure context (same nginx origin), so the mic + multipart POST need no CORS.
 */
export async function enrollVoiceprint(wav: Blob): Promise<{ samples: number }> {
  const token = getToken();
  const form = new FormData();
  form.append("audio", wav, "enroll.wav");
  const res = await fetch(speakerServer + "enroll", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || data?.error || `Enrollment failed (${res.status})`);
  }
  const data = await res.json();
  return { samples: Number(data?.samples ?? 0) };
}

/** Delete the signed-in member's voiceprint profile. */
export async function forgetVoiceprint(): Promise<void> {
  const token = getToken();
  const res = await fetch(speakerServer + "forget", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Could not remove voiceprint (${res.status})`);
}

/**
 * Whether the voiceprint feature is available — i.e. the speaker-id service is
 * running + routed. The dashboard shows the "Enroll my voice" control only when
 * this is true, so toggling the service (or `SPEAKER_ID_ENABLED`) flips the UI with
 * no rebuild. A build-time `VITE_SPEAKER_ENABLED=false` hard-disables it.
 */
export async function speakerAvailable(): Promise<boolean> {
  if ((import.meta as any).env?.VITE_SPEAKER_ENABLED === "false") return false;
  try {
    const res = await fetch(speakerServer + "health");
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return !!data?.ok;
  } catch {
    return false;
  }
}

/** How many voice samples the given user has enrolled (0 if none / service down). */
export async function getVoiceprintSamples(userId: string): Promise<number> {
  try {
    const res = await fetch(speakerServer + "profiles");
    if (!res.ok) return 0;
    const data = await res.json();
    const mine = (data?.profiles || []).find((p: any) => p.user_id === userId);
    return mine ? Number(mine.samples) : 0;
  } catch {
    return 0;
  }
}

// ── vision-service (camera live view + occupancy + Face ID + guests) ──────────

/** The annotated MJPEG live-view URL for a camera (boxes + names when a perception
 * backend is on). The dashboard `<img>`/`<video>` points HERE, never at the cam. */
export function visionStreamUrl(camId: string): string {
  return `${visionServer}stream/${encodeURIComponent(camId)}`;
}

/** Per-zone occupancy/identity snapshot — "who is in which room" (§7 pull surface). */
export type ZoneOccupant = { track: string; id: string | null; name: string | null; class: string; confidence: number; since: number };

/** Per-camera worker health from the vision-service (`/occupancy.cameras[]`). Answers
 * "is the cam making frames vs detecting presence": `frames_seen`/`connected` = blobs
 * flowing; `detector`/`face` === "null" = the no-ML stub (relay/record only, no
 * detection). The same snapshot also carries the zone occupancy, so one poll feeds both
 * the "who is here" headline and the tile health badge. */
export type VisionCameraStatus = {
  id: string; zone: string; ip: string; connected: boolean;
  frames_seen: number; last_frame_age_s: number | null;
  detector: string; face: string; rec_mode: string;
};

/** One pull of the vision world-model: zone occupancy + per-camera worker health. */
export async function fetchVisionState(): Promise<{
  zones: Record<string, ZoneOccupant[]>;
  cameras: VisionCameraStatus[];
}> {
  try {
    const res = await fetch(visionServer + "occupancy");
    if (!res.ok) return { zones: {}, cameras: [] };
    const data = await res.json();
    return { zones: data?.zones || {}, cameras: data?.cameras || [] };
  } catch {
    return { zones: {}, cameras: [] };
  }
}

/** Whether the vision-service is up + routed (gates the Face-ID control + WHO overlay,
 * exactly like speakerAvailable gates Voice ID). VITE_VISION_ENABLED=false hard-disables. */
export async function visionAvailable(): Promise<boolean> {
  if ((import.meta as any).env?.VITE_VISION_ENABLED === "false") return false;
  try {
    const res = await fetch(visionServer + "health");
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return !!data?.ok;
  } catch {
    return false;
  }
}

/** Enroll a face image for the signed-in member. The vision-service validates the
 * bearer token against the hub (`/auth/me`) and enrolls for THAT user — biometrics
 * stay on the box, the hub never holds them (§5.3). Returns the running sample count. */
export async function enrollFace(jpeg: Blob): Promise<{ samples: number }> {
  const token = getToken();
  const form = new FormData();
  form.append("image", jpeg, "face.jpg");
  const res = await fetch(visionServer + "faces/enroll", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || data?.error || `Face enrollment failed (${res.status})`);
  }
  const data = await res.json();
  return { samples: Number(data?.samples ?? 0) };
}

/** Delete the signed-in member's face profile. */
export async function forgetFace(): Promise<void> {
  const token = getToken();
  const res = await fetch(visionServer + "faces/forget", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Could not remove face profile (${res.status})`);
}

/** How many face samples the given user has enrolled (0 if none / service down). */
export async function getFaceSamples(userId: string): Promise<number> {
  try {
    const res = await fetch(visionServer + "faces/profiles");
    if (!res.ok) return 0;
    const data = await res.json();
    const mine = (data?.profiles || []).find((p: any) => p.user_id === userId);
    return mine ? Number(mine.samples) : 0;
  } catch {
    return 0;
  }
}

// ── Google Calendar enrollment (CALENDAR_PLAN §6) ───────────────────────────────────────────
// calendar-service owns the OAuth tokens; the dashboard only kicks off the consent flow and
// reflects connected state. The family (house) grant + per-member personal grants both link here.

/** calendar-service status. `auth` is the real-backend auth mode: "service_account" (the SA shares
 * calendars, links by id) or "oauth" (per-account consent). `familyId`/`saEmail` drive the SA UI
 * (which calendar is the family one; which address members must share with). `enrolled` is the set
 * of member ids with a linked personal calendar. */
export type CalendarStatus = {
  ok: boolean;
  backend: string;
  auth: "" | "oauth" | "service_account";
  houseLinked: boolean;
  enrolled: string[];
  familyId: string;
  saEmail: string;
};

export async function calendarStatus(): Promise<CalendarStatus> {
  const off: CalendarStatus = { ok: false, backend: "", auth: "", houseLinked: false, enrolled: [], familyId: "", saEmail: "" };
  if ((import.meta as any).env?.VITE_CALENDAR_ENABLED === "false") return off;
  try {
    const res = await fetch(calendarServer + "status");
    if (!res.ok) return off;
    const d = await res.json().catch(() => ({}));
    return {
      ok: !!d?.ok,
      backend: String(d?.backend || ""),
      auth: d?.auth === "service_account" || d?.auth === "oauth" ? d.auth : "",
      houseLinked: !!d?.house_linked,
      enrolled: Array.isArray(d?.enrolled) ? d.enrolled.map(String) : [],
      familyId: String(d?.family_calendar || ""),
      saEmail: String(d?.sa_email || ""),
    };
  } catch {
    return off;
  }
}

/** Service-account mode: link a calendar id (the member has shared it with the SA email) to a
 * member. The service verifies the SA can reach it first. Throws with a helpful message otherwise. */
export async function calendarLink(userId: string, calendarId: string): Promise<void> {
  const res = await fetch(calendarServer + "enroll/link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId, calendar_id: calendarId }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) throw new Error(d?.error || `Could not link that calendar (${res.status})`);
}

/** A calendar the service account can see (shared with it). `writable` false = shared read-only. */
export type DiscoveredCalendar = { id: string; summary: string; accessRole: string; writable: boolean; primary: boolean };

/** Service-account auto-discovery: every calendar shared with the SA, plus the current family
 * designation and per-member assignments. `error` is set (non-fatal) if Google couldn't be reached. */
export type CalendarsView = {
  ok: boolean;
  saEmail: string;
  family: string;
  calendars: DiscoveredCalendar[];
  members: Record<string, { calendars: string[]; write?: string }>;
  error?: string;
};

export async function calendarCalendars(): Promise<CalendarsView> {
  const off: CalendarsView = { ok: false, saEmail: "", family: "", calendars: [], members: {} };
  try {
    const res = await fetch(calendarServer + "calendars");
    if (!res.ok) return off;
    const d = await res.json().catch(() => ({}));
    return {
      ok: !!d?.ok,
      saEmail: String(d?.sa_email || ""),
      family: String(d?.family || ""),
      calendars: Array.isArray(d?.calendars) ? d.calendars : [],
      members: d?.members && typeof d.members === "object" ? d.members : {},
      error: d?.error ? String(d.error) : undefined,
    };
  } catch {
    return off;
  }
}

/** Designate which discovered calendar is the shared family one. */
export async function calendarSetFamily(calendarId: string): Promise<void> {
  const res = await fetch(calendarServer + "calendars/family", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ calendar_id: calendarId }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) throw new Error(d?.error || `Could not set the family calendar (${res.status})`);
}

/** Assign the set of calendars a member can use (empty list unlinks them). */
export async function calendarAssign(userId: string, calendarIds: string[]): Promise<void> {
  const res = await fetch(calendarServer + "calendars/assign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId, calendar_ids: calendarIds }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) throw new Error(d?.error || `Could not update calendars (${res.status})`);
}

/** Service-account mode: check whether the SA can reach a calendar id yet (used to test the family
 * calendar / confirm a share). Returns {reachable, reason?}. */
export async function calendarVerify(calendarId: string): Promise<{ reachable: boolean; reason?: string }> {
  try {
    const res = await fetch(calendarServer + "enroll/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ calendar_id: calendarId }),
    });
    const d = await res.json().catch(() => ({}));
    return { reachable: !!d?.reachable, reason: d?.reason };
  } catch {
    return { reachable: false, reason: "calendar-service unreachable" };
  }
}

/** Begin linking a Google account for `userId` ("house" for the family calendar). Returns the
 * consent URL to open in a new tab. On the null backend this is a simulated link that already
 * marked the user enrolled, signalled by a "null://" URL. */
export async function calendarEnrollStart(userId: string): Promise<string> {
  const res = await fetch(calendarServer + "enroll/start?user_id=" + encodeURIComponent(userId));
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) throw new Error(d?.error || `Could not start calendar link (${res.status})`);
  return String(d.authUrl || "");
}

/** Disconnect a linked Google account ("house" or a member id). */
export async function calendarRevoke(userId: string): Promise<void> {
  const res = await fetch(calendarServer + "enroll/revoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(`Could not disconnect calendar (${res.status})`);
}

/** Recurring unknown guests surfaced for review/naming (§4.3 / §6). */
export type Guest = { guest_id: string; name: string | null; sightings: number; last_seen: string; recurring: boolean; promoted_user_id: string | null };
export async function listGuests(recurringOnly = true): Promise<Guest[]> {
  try {
    const res = await fetch(visionServer + `guests?recurring=${recurringOnly ? 1 : 0}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.guests || [];
  } catch {
    return [];
  }
}

/** The served face image for a label (`users.id` member or `guest:N` cluster). */
export function faceThumbUrl(labelId: string): string {
  return visionServer + "faces/thumb/" + encodeURIComponent(labelId);
}

/** Every labelled person the cameras have seen — household + each default-id'd guest
 * cluster — with their face, so the admin can put names to faces (§6). `thumbUrl` is
 * null until a face has been captured for that label. */
export type Person = {
  id: string;
  label: string;
  name: string | null;
  class: "household" | "guest";
  sightings?: number;
  recurring?: boolean;
  named: boolean;
  has_thumb: boolean;
  thumbUrl: string | null;
};
export async function listPeople(): Promise<Person[]> {
  try {
    const res = await fetch(visionServer + "people");
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.people || []).map((p: any) => ({
      ...p,
      thumbUrl: p.has_thumb ? faceThumbUrl(p.id) : null,
    }));
  } catch {
    return [];
  }
}

/** Name a recurring guest without promoting them to a household member. */
export async function nameGuest(guestId: string, name: string): Promise<void> {
  const res = await fetch(visionServer + `guests/${encodeURIComponent(guestId)}/name`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Could not name guest (${res.status})`);
}

/** Promote a recurring guest into a named household member's face gallery. */
export async function promoteGuest(guestId: string, userId: string, name?: string): Promise<void> {
  const res = await fetch(visionServer + `guests/${encodeURIComponent(guestId)}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ user_id: userId, name }),
  });
  if (!res.ok) throw new Error(`Could not promote guest (${res.status})`);
}

/**
 * Ask the interactive agent via llm-gateway `/route` (buffered JSON path). Returns
 * the spoken reply text plus the action the agent took, if any.
 */
export async function askAgent(text: string, zone?: string): Promise<AgentReply> {
  // Carry the signed-in member's identity + prefs so the agent knows *who* is
  // asking and can personalise (greet by name, match tone). The llm-gateway
  // consumes `data.user` (separate repo); absent when no one is logged in. A
  // dashboard session is authoritative, so `via:"login"` at full confidence —
  // the satellite/voice path fills the SAME envelope from a speaker-ID match.
  const user = currentUser();
  const payload: Record<string, any> = {};
  if (zone) payload.zone = zone;
  if (user) {
    const userCtx: AgentUserContext = {
      id: user.id,
      name: user.displayName,
      tone: user.prefs?.tone,
      via: "login",
      confidence: 1,
    };
    payload.user = userCtx;
  }
  const res = await fetch(gatewayServer + "route", {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [{ role: "user", content: text }],
      data: Object.keys(payload).length ? payload : undefined,
    }),
  });
  if (!res.ok) throw new Error(`agent failed (${res.status})`);
  const data = await res.json();
  return {
    speech: String(data?.choices?.[0]?.message?.content ?? "").trim(),
    action: data?.x_action,
  };
}

/** Synthesize speech (Fish TTS) and return an audio blob for in-browser playback. */
export async function synthesizeSpeech(text: string): Promise<Blob> {
  const res = await fetch(ttsServer + "tts", {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`tts failed (${res.status})`);
  return res.blob();
}

export type BlindsConfigureActions =
  | "spin"
  | "switch-direction"
  | "home-position"
  | "set-limit";

export const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

/**
 * fetch wrapper for authed (mutation) calls: injects the bearer token and, on a
 * 401, clears the stale session and bounces back to the login gate. Use this for
 * every hub write so identity is attached and expiry is handled in one place.
 */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("unauthorized");
  }
  return res;
}

interface ServerResponse {
  data: any;
  success: boolean;
}

export function getEndPointData(endpoint: string) {
  return fetch(server + endpoint, {
    method: "GET",
  }).then((data) => data.json());
}

export function toggleServerDevice(device: any): Promise<ServerResponse> {
  return new Promise((resolve, reject) => {
    return authedFetch(server + "device-update", {
      method: "POST",
      body: JSON.stringify({
        id: device.id,
        value: device.value,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result) {
          resolve({
            data: result,
            success: true,
          });
        } else {
          reject();
        }
      });
  });
}

/** Channel-addressed device write (Stage 4c). Posts {id, channel, value} to
 * /device-update; the hub routes it to that one channel via node.setChannel. */
export function setServerChannel(
  id: string,
  channel: string,
  value: boolean | number,
): Promise<ServerResponse> {
  return authedFetch(server + "device-update", {
    method: "POST",
    body: JSON.stringify({ id, channel, value }),
  })
    .then((res) => res.json())
    .then((result) => ({ data: result, success: !!result }));
}

export function submitDataChange(
  id: string,
  type: "devices" | "sensors",
  prop: string,
  value: any,
) {
  return authedFetch(server + `${type}-data-set`, {
    method: "POST",
    body: JSON.stringify({
      id,
      data: {
        [prop]: value,
      },
    }),
  }).then(() => true);
}

export function getDeviceProgrammableActions(id: string) {
  return fetch(server + "device-get-actions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      id,
    }),
  })
    .then((res) => res.json())
    .then((actions) => {
      return actions;
    });
}

export function saveEffect(effect: any) {
  return authedFetch(server + "set-effect", {
    method: "POST",
    body: JSON.stringify({ effect }),
  });
}

/** Replace one rule in place by its row id (hub /update-effect). Keeps the rule's id +
 *  list position; used by the single-arm edit flow. */
export function updateEffect(id: number, effect: any) {
  return authedFetch(server + "update-effect", {
    method: "POST",
    body: JSON.stringify({ id, effect }),
  }).then((res) => res.json());
}

/** Reversibly enable/disable one rule by its row id (hub /set-effect-enabled). */
export function setEffectEnabled(id: number, enabled: boolean) {
  return authedFetch(server + "set-effect-enabled", {
    method: "POST",
    body: JSON.stringify({ id, enabled }),
  }).then((res) => res.json());
}

/** Delete one rule by its row id (hub /delete-effect). */
export function deleteEffect(id: number) {
  return authedFetch(server + "delete-effect", {
    method: "POST",
    body: JSON.stringify({ id }),
  }).then((res) => res.json());
}

// ── Pattern Discovery candidate queue (memory-service, docs/DISCOVERY.md §3) ──────────────
// The dashboard review surface (§5 "two surfaces, two gates"): list pending candidates the miner
// found, then accept (→ create the effect on the hub) or decline (anti-fatigue). Accept/decline are
// recorded on memory-service; effect creation stays on the hub via saveEffect.

export function getCandidates(): Promise<{ ok: boolean; candidates: Candidate[] }> {
  return fetch(memoryServer + "memory/candidates").then((r) => r.json());
}

export function acceptCandidate(id: number): Promise<any> {
  return fetch(memoryServer + "memory/candidates/accept", {
    method: "POST",
    headers,
    body: JSON.stringify({ id }),
  }).then((r) => r.json());
}

export function declineCandidate(id: number): Promise<any> {
  return fetch(memoryServer + "memory/candidates/decline", {
    method: "POST",
    headers,
    body: JSON.stringify({ id }),
  }).then((r) => r.json());
}

export function saveEffects(effects: AutoEffect[]) {
  return authedFetch(server + "set-effects", {
    method: "POST",
    body: JSON.stringify({ effects }),
  });
}

/** Canonical zones registry (the house room list). */
export function getZones(): Promise<string[]> {
  return getEndPointData("get-zones");
}

/** Replace the whole zones registry; the server returns the normalized list. */
export function setZones(zones: string[]): Promise<string[]> {
  return authedFetch(server + "set-zones", {
    method: "POST",
    body: JSON.stringify({ zones }),
  }).then((res) => res.json());
}

export function requestCalendarData() {
  return fetch(server + "emma-calendar", {
    method: "GET",
    headers,
  }).then((res) => res.json());
}

export function requestWeatherData() {
  return fetch(server + "emma-weather", {
    method: "GET",
  }).then((res) => res.json());
}

/** Compact forecast for the home hero (hub `GET /weather`). `code` is the raw WMO
 * weather code (the client maps it to an icon); `updatedAt` is null until Open-Meteo
 * has been reached at least once — gate the UI on it rather than trusting a 0° reading. */
export type Weather = {
  currentTemp: number;
  minTemp: number;
  maxTemp: number;
  code: number | null;
  description: string;
  isRising: boolean | null;
  updatedAt: string | null;
};

export async function getWeather(): Promise<Weather | null> {
  try {
    const res = await fetch(server + "weather", { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as Weather;
    return data?.updatedAt ? data : null;
  } catch {
    return null;
  }
}

export function updateHouseData(property: string, value: any) {
  return authedFetch(server + "update-house-data", {
    method: "POST",
    body: JSON.stringify({
      property,
      value,
    }),
  });
}

export async function calibrateSensor(id: string) {
  const res = await authedFetch(server + "sensor-calibrate", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => ({}));
  // The hub returns 400 (IP unknown / sensor not found), 409 (already
  // calibrating) or 5xx (device unreachable). Surface those so the UI can
  // toast and revert, rather than spin forever waiting on progress that the
  // server never started polling for.
  if (!res.ok) {
    throw new Error(data?.error || `Calibration failed (${res.status})`);
  }
  return data;
}
