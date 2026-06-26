import { AutoEffect } from "../views/automations/automations.model";
import { Candidate } from "../views/automations/discovery-review/discovery-review.model";

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

/** What the agent decided this turn (mirrors llm-gateway /route `x_action`). */
export type AgentAction = { tool: string; args?: any } | { error: string };
export type AgentReply = { speech: string; action?: AgentAction };

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
 * Ask the interactive agent via llm-gateway `/route` (buffered JSON path). Returns
 * the spoken reply text plus the action the agent took, if any.
 */
export async function askAgent(text: string, zone?: string): Promise<AgentReply> {
  const res = await fetch(gatewayServer + "route", {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [{ role: "user", content: text }],
      data: zone ? { zone } : undefined,
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
    return fetch(server + "device-update", {
      method: "POST",
      headers,
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
  return fetch(server + "device-update", {
    method: "POST",
    headers,
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
  return fetch(server + `${type}-data-set`, {
    method: "POST",
    headers,
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
  return fetch(server + "set-effect", {
    method: "POST",
    headers,
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
  return fetch(server + "set-effects", {
    method: "POST",
    headers,
    body: JSON.stringify({ effects }),
  });
}

/** Canonical zones registry (the house room list). */
export function getZones(): Promise<string[]> {
  return getEndPointData("get-zones");
}

/** Replace the whole zones registry; the server returns the normalized list. */
export function setZones(zones: string[]): Promise<string[]> {
  return fetch(server + "set-zones", {
    method: "POST",
    headers,
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
  return fetch(server + "update-house-data", {
    method: "POST",
    headers,
    body: JSON.stringify({
      property,
      value,
    }),
  });
}

export async function calibrateSensor(id: string) {
  const res = await fetch(server + "sensor-calibrate", {
    method: "POST",
    headers,
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
