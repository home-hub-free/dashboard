import io from "socket.io-client/dist/socket.io.js";
import { server } from "./server-handler";
import { DeviceActions, SensorActions } from "../store/actions";
import { SensorsService } from "../views/home/sensors/sensors.service";
import { syncState } from "./sync";
import { bus } from "../core/bus";

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
    DeviceActions.declare(device);
  });

  socket.on('device-update', (device) => {
    DeviceActions.update(device);
  });

  socket.on('sensor-declare', (sensor) => {
    SensorActions.declare(sensor);
  });

  socket.on('sensor-update', (sensor) => {
    SensorActions.update(sensor);
    SensorsService.formatSensorsValues([sensor]);
  });
}

export function getSocketId() {
  return socket.id;
}
