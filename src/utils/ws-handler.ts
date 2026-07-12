import io from "socket.io-client/dist/socket.io.js";
import { server } from "./server-handler";
import { DeviceActions, SensorActions } from "../store/actions";
import { SensorsService } from "../views/home/sensors/sensors.service";
import { syncState } from "./sync";
import { bus } from "../core/bus";
import { store } from "../store/store";
import {
  entranceTile,
  entranceChip,
  flareTile,
  reseatReadout,
  reseatChip,
  wasSelfWrite,
} from "./live-motion";

/** The cooler tile's one live on-plate number — its outlet/room air temperature.
 * Returns a stable comparable (or null for non-coolers) so the handler can tell a
 * genuine reading tick from an unrelated blob patch (manual lock, name, ranges). */
function coolerReadout(device: { deviceCategory?: string; value?: any } | undefined): string | null {
  if (!device || device.deviceCategory !== "evap-cooler") return null;
  const t = (device.value ?? {})["room-temp"];
  return t == null ? null : String(t);
}

// `server` is a same-origin path prefix ("/api/") behind nginx (and via the Vite dev
// proxy), or an absolute URL when VITE_SERVER_URL is set for direct dev. Socket.IO reads
// its URL arg as a *namespace*, so for the relative case we pass the engine `path`
// explicitly (`/api/socket.io/` → nginx strips `/api` → the hub's default `/socket.io/`);
// for an absolute origin we connect to it with the default path.
const socket = /^https?:\/\//.test(server)
  ? io.connect(server, { path: "/socket.io/" })
  : io.connect({ path: `${server}socket.io/` });

export let socketId = '';

// The first `connect` is the initial boot connection — initial state is already
// loaded by main.ts, so we skip the resync. Every subsequent `connect` is a
// reconnect after a drop, where we MUST pull full state because WS deltas are
// incremental and anything that changed while we were offline was missed.
let hasConnectedBefore = false;

async function resync() {
  bus.emit('ws:status', { state: 'syncing' });
  await syncState();
  bus.emit('ws:status', {
    state: socket.connected ? 'connected' : 'disconnected',
  });
}

/** Manual escape hatch for the home-screen app — pull full state on demand. */
export async function refreshNow() {
  await resync();
}

export function initWebSockets() {
  socket.on("connect", () => {
    console.log("WS ready");
    socketId = socket.id;
    if (hasConnectedBefore) {
      console.log("WS reconnected — resyncing state");
      resync();
    } else {
      hasConnectedBefore = true;
      bus.emit('ws:status', { state: 'connected' });
    }
  });

  socket.on("disconnect", (reason: string) => {
    console.warn("WS disconnected:", reason);
    bus.emit('ws:status', { state: 'disconnected' });
  });

  // A kiosk/home-screen display sleeps and wakes; the socket can look alive but
  // have silently missed events while the tab was backgrounded. Re-pull on every
  // return to visibility so the screen is never stale when someone walks up to it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resync();
    }
  });

  socket.on('device-declare', (device) => {
    const isNew = !store.get('devices').some((d) => d.id === device.id);
    DeviceActions.declare(device);
    // A genuinely-new device rises in; a device merely re-declaring on boot/ping
    // (already known) must not replay an entrance.
    if (isNew) entranceTile(device.id);
  });

  socket.on('device-update', (device) => {
    // Snapshot the pre-update reading — the store holds DECORATED devices, so
    // `isOn` is already computed — then apply the patch (which re-decorates
    // synchronously via the store subscription) and read the settled state back.
    const before = store.get('devices').find((d) => d.id === device.id);
    const prevOn = before?.isOn;
    const prevReadout = coolerReadout(before);
    DeviceActions.update(device);
    const after = store.get('devices').find((d) => d.id === device.id);
    if (!after) return;

    // A light/actuator flipped without us → announce it. Our own taps echo back
    // over WS; those stay silent (the CSS fill transition is feedback enough).
    if (prevOn !== undefined && prevOn !== after.isOn && !wasSelfWrite(device.id)) {
      flareTile(device.id, after.isOn === true);
    }
    // The cooler's hero reading ticked → reseat the digits (a live instrument).
    const nextReadout = coolerReadout(after);
    if (nextReadout !== null && prevReadout !== null && nextReadout !== prevReadout) {
      reseatReadout(device.id);
    }
  });

  socket.on('sensor-declare', (sensor) => {
    const isNew = !store.get('sensors').some((s) => s.id === sensor.id);
    SensorActions.declare(sensor);
    if (isNew) entranceChip(sensor.id);
  });

  socket.on('sensor-update', (sensor) => {
    // Compare the formatted reading before/after so a periodic report with an
    // unchanged value doesn't flash. (SensorActions.update mutates the stored
    // object in place, so capture the snapshot as a string first.)
    const before = store.get('sensors').find((s) => s.id === sensor.id);
    const prev = before ? JSON.stringify(before.value) : null;
    SensorActions.update(sensor);
    SensorsService.formatSensorsValues([sensor]);
    const after = store.get('sensors').find((s) => s.id === sensor.id);
    if (after && prev !== null && JSON.stringify(after.value) !== prev) {
      reseatChip(sensor.id);
    }
  });
}

export function getSocketId() {
  return socket.id;
}
