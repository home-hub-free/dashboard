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

/** Live HLS (main RTSP stream tee'd by the recorder — full quality WITH the mic's
 * audio track). Only recording cameras (`records`) have one. A few seconds behind
 * the MJPEG relay: this is the "sound on" view, not the reflex view. */
export function visionHlsUrl(camId: string): string {
  return `${visionServer}hls/${encodeURIComponent(camId)}/live.m3u8`;
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
  /** Whether this camera archives footage (IP cams with an RTSP main stream). Only
   * recording cams get a Recordings review entry point; face-ID desk/entrance cams don't. */
  records?: boolean;
  /** ONVIF capability summary (cached probe) — null until probed / not an ONVIF cam.
   * Drives which camera controls the tile draws (fixed cams get no D-pad). */
  onvif?: { ptz: boolean; imaging: boolean; events: boolean } | null;
  /** Live in-camera motion event subscription state (CAMERA_ONVIF_CONTROL_PLAN §3). */
  events_attached?: boolean;
  motion_active?: boolean | null;
  /** Privacy mode — the worker isn't pulling from this camera at all (no live view,
   * no recording, no perception). Toggled via the hub `/camera/:id/privacy` proxy. */
  privacy?: boolean;
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

// ── footage review (vision /recordings/* — authenticated dashboard feature) ───
// Listing is bearer-gated (a signed-in member only); the clip URL each segment carries
// is self-signed (short-TTL token) so the <video> element can play + seek it without a
// header. Recording is scoped to the IP-cam fleet (RTSP main) — face-ID cams have none.

/** A recording camera + the distinct days it has footage for (the day picker). */
export type RecordingCamera = { id: string; name: string | null; zone: string | null; days: string[] };

/** One archived segment: its clock span, the signed clip URL to play it, and the
 * identity/event markers that fall inside it (timeline pins the reviewer scrubs to). */
export type RecordingSegment = {
  id: number;
  start: number;
  end: number | null;
  duration: number | null;
  /** Signed, relative clip path from the vision-service — prefix with visionServer. */
  clip: string;
  events: { ts: number; edge: string; identity: { id: string | null; name: string | null; class: string } }[];
};

/** Cameras that record + their footage days. Bearer-gated; [] when unauthed/unavailable. */
export async function fetchRecordingCameras(): Promise<RecordingCamera[]> {
  const token = getToken();
  try {
    const res = await fetch(visionServer + "recordings/cameras", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.cameras || [];
  } catch {
    return [];
  }
}

/** A camera's segments overlapping [start, end] (epoch seconds — usually one local day). */
export async function fetchRecordingSegments(
  camId: string,
  start: number,
  end: number,
): Promise<RecordingSegment[]> {
  const token = getToken();
  try {
    const res = await fetch(
      visionServer + `recordings/${encodeURIComponent(camId)}/segments?start=${start}&end=${end}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data?.segments || [];
  } catch {
    return [];
  }
}

/** Absolute, playable URL for a segment's signed clip path (goes straight to vision). */
export function recordingClipUrl(seg: RecordingSegment): string {
  return visionServer + seg.clip;
}

// ── camera control (hub /camera/:id proxy → the vision-service ONVIF seam) ────
// All CONTROL goes through the hub (auth + audit boundary, CAMERA_ONVIF_CONTROL_PLAN
// §2) — never straight to the vision-service, and never to the camera itself.

export type CameraPreset = { token: string; name: string; x: number | null; y: number | null };
export type CameraImaging = {
  brightness?: number; saturation?: number; contrast?: number; sharpness?: number;
  /** Day/night/IR — only present when the camera exposes IrCutFilter (MC200 fw doesn't). */
  ir_cut?: string;
};
export type CameraControls = {
  cam_id: string;
  zone?: string;
  /** null = not an ONVIF camera (e.g. ESP32-CAM) — no controls to draw. */
  onvif: { ptz: boolean; imaging: boolean; events: boolean } | null;
  reachable: boolean;
  status?: { x: number | null; y: number | null; move_status: string | null };
  presets?: CameraPreset[];
  imaging?: CameraImaging;
};

/** One-shot control summary for the camera tile (capabilities + presets + imaging). */
export async function fetchCameraControls(camId: string): Promise<CameraControls | null> {
  try {
    const res = await fetch(server + `camera/${encodeURIComponent(camId)}/controls`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function cameraPost(camId: string, path: string, body: unknown): Promise<any | null> {
  try {
    const res = await authedFetch(server + `camera/${encodeURIComponent(camId)}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Timed PTZ nudge (auto-stopped service-side; velocities in the -1..1 ONVIF space). */
export function cameraPtzMove(camId: string, vx: number, vy: number, ttlMs = 400) {
  return cameraPost(camId, "/ptz/move", { vx, vy, ttl_ms: ttlMs });
}

export function cameraPtzGoto(camId: string, token: string) {
  return cameraPost(camId, "/ptz/goto", { token });
}

/** Save the camera's CURRENT aim as a named view; resolves to the new preset token. */
export function cameraSavePreset(camId: string, name: string) {
  return cameraPost(camId, "/ptz/preset", { name });
}

export async function cameraDeletePreset(camId: string, token: string): Promise<boolean> {
  try {
    const res = await authedFetch(
      server + `camera/${encodeURIComponent(camId)}/ptz/preset/${encodeURIComponent(token)}`,
      { method: "DELETE", headers },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Partial imaging write (brightness/saturation/contrast/sharpness 0-100, ir_cut). */
export function cameraSetImaging(camId: string, imaging: CameraImaging) {
  return cameraPost(camId, "/imaging", imaging);
}

/** Privacy mode toggle — stop (or resume) ALL watching of this camera: live view,
 * recording and perception end at the vision-service worker. Authenticated + audited
 * through the hub proxy like every other camera control; resolves to
 * `{ privacy: boolean }` on success, null on failure. */
export function cameraSetPrivacy(camId: string, on: boolean) {
  return cameraPost(camId, "/privacy", { on });
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

/** A calendar the service account knows about. `reachable` false = added but not shared with the SA
 * yet (pending). `writable` false = shared read-only. */
export type DiscoveredCalendar = { id: string; summary: string; accessRole: string; writable: boolean; reachable: boolean; primary: boolean };

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

/** Register a calendar by its address (for a primary calendar, the account email) so the SA can use
 * it. Doesn't require the share to exist yet — an un-shared calendar is stored "pending" until you
 * share it with the SA and Recheck. */
export async function calendarAddCalendar(calendarId: string): Promise<void> {
  const res = await fetch(calendarServer + "calendars/add", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ calendar_id: calendarId }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) throw new Error(d?.error || `Could not add that calendar (${res.status})`);
}

/** Re-probe every added calendar — pending ones flip to reachable once they're shared with the SA.
 * Returns the refreshed view (same shape as calendarCalendars). */
export async function calendarRecheck(): Promise<CalendarsView> {
  const off: CalendarsView = { ok: false, saEmail: "", family: "", calendars: [], members: {} };
  try {
    const res = await fetch(calendarServer + "calendars/recheck", { method: "POST" });
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

/** Forget a calendar added by id (typo / no longer wanted). */
export async function calendarRemove(calendarId: string): Promise<void> {
  const res = await fetch(calendarServer + "calendars/remove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ calendar_id: calendarId }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d?.ok) throw new Error(d?.error || `Could not remove that calendar (${res.status})`);
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

/** One image folded into a household member's face profile (auto-heal or manual
 * promote) — the audit trail. `score` = how well it still matches the member (low =
 * a likely wrong auto-heal); `thumbUrl` is the captured face. */
export type MemberCluster = {
  guest_id: string;
  sightings: number;
  first_seen: string;
  last_seen: string;
  score: number | null;
  has_thumb: boolean;
  thumbUrl: string | null;
  /** Normalized [x,y,w,h] of THE face this cluster is about within its thumb (legacy
   * crops can hold several faces) — the full-image viewer rings it. null = unknown. */
  face_box: number[] | null;
  /** The detector looked and found no clear face in this capture. */
  no_face?: boolean;
};
export async function listMemberClusters(userId: string): Promise<MemberCluster[]> {
  try {
    const res = await fetch(visionServer + `faces/${encodeURIComponent(userId)}/clusters`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.clusters || []).map((c: any) => ({
      ...c,
      thumbUrl: c.has_thumb ? faceThumbUrl(c.guest_id) : null,
    }));
  } catch {
    return [];
  }
}

/** "That one wasn't me" — un-merge a wrongly auto-healed cluster from a member; it
 * stops matching them and returns to the review queue for a fresh decision. */
export async function detachCluster(guestId: string): Promise<void> {
  const res = await fetch(visionServer + `faces/clusters/${encodeURIComponent(guestId)}/detach`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Could not detach (${res.status})`);
}

/** One archived photo from an identity's capture ledger — an INGREDIENT of their
 * face profile (the vision-service permanently archives the crop + exact embedding
 * behind every recognition decision). Deleting one removes it for good; a rebuild
 * then averages exactly what remains. */
export type FaceCapture = {
  id: number;
  ts: string;
  kind: string; // enroll | match | promoted | healed | cluster | ambiguous
  score: number | null;
  reinforced: boolean;
  imageUrl: string | null;
};
export async function listFaceCaptures(
  ownerId: string
): Promise<{ total: number; captures: FaceCapture[] }> {
  try {
    const res = await fetch(
      visionServer + `faces/${encodeURIComponent(ownerId)}/captures?limit=500`
    );
    if (!res.ok) return { total: 0, captures: [] };
    const data = await res.json();
    return {
      total: data?.total || 0,
      captures: (data?.captures || []).map((c: any) => ({
        ...c,
        imageUrl: c.image ? visionServer + c.image : null,
      })),
    };
  } catch {
    return { total: 0, captures: [] };
  }
}

/** Permanently delete one archived photo (ledger row + file). Admin-gated. */
export async function deleteFaceCapture(id: number): Promise<void> {
  const res = await fetch(visionServer + `faces/captures/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Could not delete photo (${res.status})`);
}

/** "Re-do the soup": REPLACE a member's face profile with the plain mean of every
 * photo still archived for them — delete the wrong ones first, then rebuild.
 * Returns the new sample count. Admin-gated; 409 when nothing is archived yet. */
export async function rebuildFaceProfile(userId: string, name?: string): Promise<number> {
  const res = await fetch(visionServer + `faces/${encodeURIComponent(userId)}/rebuild`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || null }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `Could not rebuild (${res.status})`);
  }
  return (await res.json())?.samples || 0;
}

/** A tunable recognition threshold (the auto-heal / match / suggest ladder). */
export type FaceThreshold = { key: string; value: number; default: number; overridden: boolean };
export async function getFaceThresholds(): Promise<FaceThreshold[]> {
  try {
    const res = await fetch(visionServer + "faces/thresholds");
    if (!res.ok) return [];
    const data = await res.json();
    return data?.thresholds || [];
  } catch {
    return [];
  }
}

/** Adjust thresholds live. Pass `null` for a key to clear its override (back to default). */
export async function setFaceThresholds(
  updates: Record<string, number | null>,
): Promise<FaceThreshold[]> {
  const res = await fetch(visionServer + "faces/thresholds", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) throw new Error(`Could not save thresholds (${res.status})`);
  const data = await res.json();
  return data?.thresholds || [];
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

/** One card in the "Is this you?" face-review queue (vision `/people/review`).
 * Confidence-tiered: `suggested` set = the system thinks it's that member (the card
 * is addressed to them); null = nobody scored close enough, everyone reviews. The
 * definitely-them tier never surfaces — it auto-merges server-side (`healed`). */
export type ReviewCard = {
  guest_id: string;
  label: string;
  sightings: number;
  last_seen: string;
  tier: "suggest" | "unknown";
  /** Who the system thinks this is: a household member (card addressed to them
   * only) or a NAMED guest like "Abuela" (anyone can confirm). */
  suggested: { kind: "member" | "guest"; id: string; name: string | null; score: number } | null;
  /** Ranked one-tap candidates — the top matches even when nothing clears the
   * suggest bar, so "Who is this?" gets direct "It's <name>" buttons instead of
   * a dropdown dive. Same id space reviewAssign consumes (member id / guest:N).
   * Absent on an older vision-service → the card falls back to "It's me". */
  candidates?: { kind: "member" | "guest"; id: string; name: string | null; score: number }[];
  rejected_user_ids: string[];
  has_thumb: boolean;
  thumbUrl: string | null;
  /** Normalized [x,y,w,h] of THE face within the thumb (legacy crops can hold more
   * than one person) — the card rings it so there's no doubt who's being asked about. */
  face_box: number[] | null;
  /** The detector looked at this thumb and found NO face (blurry/cut-off legacy
   * crop) — the card says so; the thumb self-replaces on the next sighting. */
  no_face?: boolean;
};
export async function listFaceReview(): Promise<{ cards: ReviewCard[]; healed: number }> {
  try {
    const res = await fetch(visionServer + "people/review");
    if (!res.ok) return { cards: [], healed: 0 };
    const data = await res.json();
    const cards = (data?.queue || []).map((c: any) => ({
      ...c,
      thumbUrl: c.has_thumb ? faceThumbUrl(c.guest_id) : null,
    }));
    return { cards, healed: (data?.healed || []).length };
  } catch {
    return { cards: [], healed: 0 };
  }
}

/** "No, that's not me/them" — the cluster is never suggested to (or auto-merged
 * into) that member again; it falls to the next tier for review. */
export async function rejectFaceSuggestion(guestId: string, userId: string): Promise<void> {
  const res = await fetch(visionServer + `guests/${encodeURIComponent(guestId)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(`Could not record answer (${res.status})`);
}

/** Fold a cluster into a NAMED guest ("yes, that's Abuela") — she keeps getting
 * recognised across angles/visits instead of respawning as a new "Person N". */
export async function mergeGuest(guestId: string, intoGuestId: string): Promise<void> {
  const res = await fetch(visionServer + `guests/${encodeURIComponent(guestId)}/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ into: intoGuestId }),
  });
  if (!res.ok) throw new Error(`Could not merge (${res.status})`);
}

/** Discard a guest cluster entirely (a stranger / not-a-face crop). */
export async function forgetGuest(guestId: string): Promise<void> {
  const res = await fetch(visionServer + `guests/${encodeURIComponent(guestId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Could not discard (${res.status})`);
}

/**
 * Ask the interactive agent via llm-gateway `/route` (buffered JSON path). Returns
 * the spoken reply text plus the action the agent took, if any.
 */
// ── Assistant chat history (hub /assistant/chats → gateway chat store) ────────────────────────────
// The hub is the auth boundary: it verifies the bearer token and scopes every call to the signed-in
// member, so the dashboard never names an owner. Voice/satellite chats the member started (identity-
// resolved by voiceprint) appear here too.

export interface AssistantChatTurn {
  role: "user" | "assistant";
  content: string;
  ts: string;
  speakerId?: string;
  speakerName?: string;
}

export interface AssistantChatMeta {
  id: string;
  surface: "dashboard" | "voice";
  zone?: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  closedAt?: string;
  turnCount: number;
}

export interface AssistantChat extends Omit<AssistantChatMeta, "turnCount"> {
  turns: AssistantChatTurn[];
}

export async function listAssistantChats(): Promise<AssistantChatMeta[]> {
  const res = await fetch(server + "assistant/chats", { headers: authHeaders() });
  if (res.status === 401) { handleUnauthorized(); return []; }
  if (!res.ok) throw new Error(`chats failed (${res.status})`);
  return (await res.json()).chats ?? [];
}

export async function getAssistantChat(id: string): Promise<AssistantChat | null> {
  const res = await fetch(server + "assistant/chats/" + encodeURIComponent(id), { headers: authHeaders() });
  if (res.status === 401) { handleUnauthorized(); return null; }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`chat failed (${res.status})`);
  return (await res.json()).chat ?? null;
}

/** End the live conversation so the next message starts a fresh thread ("New chat"). */
export async function closeAssistantChat(): Promise<void> {
  const res = await fetch(server + "assistant/chats/close", { method: "POST", headers: authHeaders() });
  if (res.status === 401) { handleUnauthorized(); return; }
  if (!res.ok) throw new Error(`close failed (${res.status})`);
}

export async function deleteAssistantChat(id: string): Promise<void> {
  const res = await fetch(server + "assistant/chats/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (res.status === 401) { handleUnauthorized(); return; }
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

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
