import { bus } from "../core/bus";
import { fetchOccupancy } from "./server-handler";

/**
 * vision-service occupancy poller — replaces the old per-frame camera blob feed
 * (`ws-camera-handler`). The camera LIVE VIEW now comes straight from the
 * vision-service MJPEG endpoint (`visionStreamUrl`, set on the tile as an
 * `<img>` src), so the dashboard no longer relays JPEG blobs over a socket.
 *
 * What this poller adds is the high-value surface (§6): WHO is in which room. It
 * pulls `/vision/occupancy` (the digested world-model — never frames) on a light
 * interval and broadcasts it on the bus; the camera tile maps its `zone` to the
 * occupants and renders the headline ("David + 1 guest — living room").
 *
 * Pull, not push: occupancy is a snapshot the UI reads, mirroring how the agent
 * reads it. The salient edges (person_entered, …) wake the agent, not the tile.
 */
const POLL_MS = 3000;
let timer: number | undefined;

export function startVisionOccupancy() {
  if (timer !== undefined) return;
  const tick = async () => {
    const zones = await fetchOccupancy();
    bus.emit("vision:occupancy", zones);
  };
  tick();
  timer = window.setInterval(tick, POLL_MS);
}

export function stopVisionOccupancy() {
  if (timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}
