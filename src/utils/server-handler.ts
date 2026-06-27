import { AutoEffect } from "../views/automations/automations.model";
import { Candidate } from "../views/automations/discovery-review/discovery-review.model";
import { authHeaders, currentUser, getToken, handleUnauthorized } from "./auth";

// Server URL. Defaults to the fixed Raspberry Pi IP on the home LAN, but can be
// overridden for local development/verification via the VITE_SERVER_URL env var.
export const server =
  (import.meta as any).env?.VITE_SERVER_URL || "http://192.168.1.232:8088/";

// memory-service URL — the Pattern Discovery candidate queue lives here (port 8120), separate from
// the hub. Overridable via VITE_MEMORY_URL; falls back to the canonical LLM box. The browser reaches
// it cross-origin (the service sends permissive CORS), so the hub stays out of the memory path
// (CLAUDE.md "hub never touches memory-service").
export const memoryServer =
  (import.meta as any).env?.VITE_MEMORY_URL || "http://192.168.1.232:8120/";

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
export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, "audio.wav");
  const res = await fetch(voiceServer + "transcribe", { method: "POST", body: form });
  if (!res.ok) throw new Error(`transcribe failed (${res.status})`);
  const data = await res.json();
  return String(data?.text ?? "").trim();
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
