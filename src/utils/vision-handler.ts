import { bus } from "../core/bus";
import { fetchVisionState } from "./server-handler";

/**
 * vision-service occupancy + health poller — replaces the old per-frame camera blob
 * feed (`ws-camera-handler`). The camera LIVE VIEW comes straight from the
 * vision-service MJPEG endpoint (`visionStreamUrl`, set as an `<img>` src), so the
 * dashboard no longer relays JPEG blobs over a socket.
 *
 * One light poll of `/vision/occupancy` (the digested world-model — never frames)
 * feeds BOTH:
 *   - `vision:occupancy` — WHO is in which room (the §6 headline), and
 *   - `vision:cameras`   — per-camera worker health (frames flowing? detection on or
 *                          the null stub?), so a tile can show stream/detection state.
 *
 * Pull, not push: occupancy is a snapshot the UI reads, mirroring how the agent reads
 * it. The salient edges (person_entered, …) wake the agent, not the tile — so this can
 * be slow. It runs at a relaxed interval and PAUSES entirely while the tab is hidden
 * (occupancy you can't see has no consumer); it fires once immediately on (re)show so a
 * returning user sees fresh state without waiting out the interval.
 */
const POLL_MS = 15000;
let timer: number | undefined;
let started = false;

async function tick() {
  const { zones, cameras } = await fetchVisionState();
  bus.emit("vision:occupancy", zones);
  bus.emit("vision:cameras", cameras);
}

function schedule() {
  if (timer !== undefined) return;
  if (typeof document !== "undefined" && document.hidden) return; // don't poll a hidden tab
  tick();
  timer = window.setInterval(tick, POLL_MS);
}

function pause() {
  if (timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

function onVisibility() {
  if (document.hidden) pause();
  else schedule(); // immediate tick + resume
}

export function startVisionOccupancy() {
  if (started) return;
  started = true;
  document.addEventListener("visibilitychange", onVisibility);
  schedule();
}

export function stopVisionOccupancy() {
  if (!started) return;
  started = false;
  document.removeEventListener("visibilitychange", onVisibility);
  pause();
}
