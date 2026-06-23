import { getEndPointData } from "./server-handler";
import { DeviceActions, SensorActions, EffectActions } from "../store/actions";
import { SensorsService } from "../views/home/sensors/sensors.service";

let syncing = false;

/**
 * Re-pull the full control-plane state (devices, sensors, effects) and replace
 * the store contents. WebSocket deltas are incremental, so any update that lands
 * while the socket is disconnected (display sleep, network blip, server restart)
 * is otherwise lost — this is the authoritative resync used on boot, on WS
 * reconnect, on tab-visibility regain, and by the manual refresh button.
 *
 * Deliberately does NOT touch nav/menu/tab state, so a background resync never
 * yanks the user off the screen they're looking at.
 *
 * Concurrent calls are coalesced — a reconnect that races the visibility handler
 * won't double-fetch.
 */
export async function syncState(): Promise<boolean> {
  if (syncing) return false;
  syncing = true;
  try {
    const [devicesData, sensorsData, effectsData] = await Promise.all([
      getEndPointData("get-devices"),
      getEndPointData("get-sensors"),
      getEndPointData("get-effects-normalized"),
    ]);

    DeviceActions.load(devicesData);

    SensorsService.formatSensorsValues(sensorsData);
    SensorActions.load(sensorsData);

    EffectActions.load(effectsData);

    console.log("State synced:", {
      devices: devicesData.length,
      sensors: sensorsData.length,
      effects: effectsData.length,
    });
    return true;
  } catch (error) {
    console.error("Failed to sync state:", error);
    return false;
  } finally {
    syncing = false;
  }
}
