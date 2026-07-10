import * as serverHandler from "../../../utils/server-handler";
import type { SensorBins } from "../../../utils/server-handler";

/**
 * Live radar bins view for the presence-sensor detail overlay.
 *
 * Drives the device's bounded engineering-mode window via the hub
 * (POST /sensor-debug → device streams per-gate energies; GET /sensor-bins
 * proxies the latest frame) and draws it straight onto a <canvas>.
 *
 * The canvas is drawn imperatively — NOT through bindrjs — because frames
 * arrive at ~1.6 Hz and patching overlay data that often would re-render the
 * whole sheet (and wipe the canvas) on every frame. bindrjs re-renders from
 * unrelated patches are fine: the next poll tick redraws.
 *
 * Liveness = the canvas being in the DOM (plus the caller's alive() check).
 * When the overlay closes or the section unmounts, the tick finds no canvas
 * and shuts the device's debug window off. The device also self-expires, so
 * a killed tab can't strand the radar in engineering mode.
 */

const POLL_MS = 600;
const WINDOW_S = 60;          // device-side window per arm request
const REARM_MS = 25_000;      // re-arm well inside that window

export function radarCanvasId(sensorId: string): string {
  return `radar_bins_${sensorId}`;
}

type Session = {
  id: string;
  alive: () => boolean;
  timer?: ReturnType<typeof setTimeout>;
  lastArmAt: number;
  stopped: boolean;
};

let session: Session | null = null;

/** Arm the device's debug window and start the poll/draw loop. Throws if the
 * initial arm fails (device unreachable / not a debuggable sensor). */
export async function startRadarDebug(id: string, alive: () => boolean): Promise<void> {
  stopRadarDebug(); // one live view at a time
  await serverHandler.sensorDebug(id, true, WINDOW_S);
  const s: Session = { id, alive, lastArmAt: Date.now(), stopped: false };
  session = s;
  void tick(s);
}

/** Stop the loop; tells the device to leave engineering mode unless the
 * session is being abandoned because the start itself failed. */
export function stopRadarDebug(sendOff = true) {
  const s = session;
  if (!s) return;
  session = null;
  s.stopped = true;
  if (s.timer) clearTimeout(s.timer);
  if (sendOff) serverHandler.sensorDebug(s.id, false).catch(() => {});
}

async function tick(s: Session) {
  if (s.stopped) return;

  const canvas = document.getElementById(radarCanvasId(s.id)) as HTMLCanvasElement | null;
  if (!canvas || !s.alive()) {
    if (session === s) stopRadarDebug();
    return;
  }

  if (Date.now() - s.lastArmAt > REARM_MS) {
    s.lastArmAt = Date.now();
    serverHandler.sensorDebug(s.id, true, WINDOW_S).catch(() => {});
  }

  try {
    const frame = await serverHandler.fetchSensorBins(s.id);
    if (s.stopped) return;
    if (frame.starting || (frame.debug && frame.age_ms < 0)) {
      drawStatus(canvas, "Entering radar engineering mode…");
    } else if (!frame.debug) {
      // Window expired (or the device rebooted) — force a re-arm next tick.
      s.lastArmAt = 0;
      drawStatus(canvas, "Radar debug window closed — re-arming…");
    } else {
      drawBins(canvas, frame);
    }
  } catch {
    if (!s.stopped) drawStatus(canvas, "Device not answering…");
  }

  if (!s.stopped) s.timer = setTimeout(() => void tick(s), POLL_MS);
}

// ---- Canvas rendering -------------------------------------------------------

const MAX_DB = 95; // the LD2402's documented threshold range is 0..95 dB

function toDb(raw: number): number {
  if (!raw || raw <= 1) return 0;
  const db = 10 * Math.log10(raw);
  return Math.min(Math.max(db, 0), MAX_DB);
}

function cssColor(el: HTMLElement, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 180;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawStatus(canvas: HTMLCanvasElement, message: string) {
  const ctx = prepare(canvas);
  if (!ctx) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = cssColor(canvas, "--color-text-tertiary", "#8d8578");
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, w / 2, h / 2);
}

function drawBins(canvas: HTMLCanvasElement, frame: SensorBins) {
  const ctx = prepare(canvas);
  if (!ctx) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;

  const colQuiet = cssColor(canvas, "--color-secondary", "#7d9ab5"); // stone blue
  const colMicro = cssColor(canvas, "--color-warning", "#d98e36");  // honey
  const colHot = cssColor(canvas, "--color-error", "#d95f4c");      // brick
  const colOk = cssColor(canvas, "--color-success", "#74a980");     // sage
  const colText = cssColor(canvas, "--color-text-secondary", "#cdc3b2");
  const colFaint = cssColor(canvas, "--color-text-tertiary", "#8d8578");
  const colGrid = cssColor(canvas, "--color-border", "#322c26");

  ctx.clearRect(0, 0, w, h);

  const padL = 26, padR = 6, padT = 22, padB = 18;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const n = frame.bins.length || 14;
  const gap = 3;
  const barW = (plotW - gap * (n - 1)) / n;
  const yFor = (db: number) => padT + plotH * (1 - db / MAX_DB);

  // dB gridlines
  ctx.font = "9px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const db of [0, 30, 60, 90]) {
    const y = yFor(db);
    ctx.strokeStyle = colGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillStyle = colFaint;
    ctx.fillText(String(db), padL - 4, y);
  }

  for (let i = 0; i < n; i++) {
    const x = padL + i * (barW + gap);
    const energy = toDb(frame.bins[i]);
    const thrMotion = toDb(frame.thr_motion[i]);
    const thrMicro = toDb(frame.thr_micro[i]);

    // Bar, colored by which threshold it clears (what the radar would act on).
    ctx.fillStyle =
      thrMotion && energy >= thrMotion ? colHot :
      thrMicro && energy >= thrMicro ? colMicro :
      colQuiet;
    const yTop = yFor(energy);
    ctx.fillRect(x, yTop, barW, padT + plotH - yTop);

    // Threshold marks: motion solid, micro-motion dashed.
    if (thrMotion) {
      ctx.strokeStyle = colText;
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, yFor(thrMotion));
      ctx.lineTo(x + barW, yFor(thrMotion));
      ctx.stroke();
    }
    if (thrMicro) {
      ctx.strokeStyle = colFaint;
      ctx.setLineDash([3, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yFor(thrMicro));
      ctx.lineTo(x + barW, yFor(thrMicro));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Distance labels every other gate (gate i spans (i..i+1) × gate_m meters).
  const gateM = frame.gate_m || 0.7;
  ctx.fillStyle = colFaint;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 1; i < n; i += 2) {
    const x = padL + i * (barW + gap) + barW / 2;
    ctx.fillText(`${((i + 1) * gateM).toFixed(1)}m`, x, padT + plotH + 4);
  }

  // Header: presence dot + target distance + frame age.
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "11px sans-serif";
  const present = frame.presence === 1 || frame.ot1 === 1;
  ctx.fillStyle = present ? colOk : colFaint;
  ctx.beginPath();
  ctx.arc(padL + 4, padT / 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colText;
  const dist = frame.dist_mm > 0 ? ` · target ${(frame.dist_mm / 1000).toFixed(1)} m` : "";
  const age = frame.age_ms >= 0 ? ` · ${(frame.age_ms / 1000).toFixed(1)}s ago` : "";
  ctx.fillText(`${present ? "presence" : "clear"}${dist}${age}`, padL + 14, padT / 2);
}
