import { Component } from "../../../core/component";
import { store } from "../../../store/store";
import { Sensor, SensorsTabState } from "./sensors.model";
import { getGlobalPosition } from "../../../utils/utils.service";
import {
  openOverlay,
  updateOverlayData,
  OverlayModal,
} from "../../../components/overlay-modal/overlay-modal";
import SensorEditView from "../overlay-views/sensors-edit.template.html?raw";
import { SensorsService, SensorsServiceClass } from "./sensors.service";
import { showToaster } from "../../../components/popup-message/popup-message";
import * as serverHandler from "../../../utils/server-handler";
import {
  addZone as svcAddZone,
  removeZone as svcRemoveZone,
  zoneOptions,
} from "../../../utils/zones.service";
import { startRadarDebug, stopRadarDebug } from "./radar-debug";

// Seconds between confirming calibration and the actual trigger — a slight grace
// window so the user can step out of the room before the radar reads the baseline.
const CAL_START_DELAY_S = 3;

class SensorsTabClass extends Component<SensorsTabState> {
  sensorsService: SensorsServiceClass;
  private unsubscribeSensors?: () => void;

  constructor(sensorsService: SensorsServiceClass) {
    super();
    this.sensorsService = sensorsService;
  }

  // HEADLESS component: the env band is gone — sensor chips render inside each
  // room card (devices.ts/.html) straight from the store, and ws-handler keeps
  // the store fresh (SensorActions). This component stays mounted for what it
  // still owns: the sensor DETAIL overlay (sensorTouchEnd + its calibration /
  // radar-debug actions) and mirroring live calibration progress into it.
  mount() {
    this.unsubscribeSensors = store.subscribe('sensors', (sensors) => {
      // Mirror live calibration progress into the open detail overlay — its
      // `data` is a detached copy of the sensor, so it won't see WS updates.
      this.syncOverlayCalibration(sensors);
    });
  }

  unmount() {
    this.unsubscribeSensors?.();
    stopRadarDebug();
  }

  sensorTouchEnd(event: any, sensor: Sensor) {
    const rect = getGlobalPosition(event.target);
    openOverlay({
      template: SensorEditView,
      data: {
        ...sensor,
        // Options for the zone <select>, current value ordered first (see
        // zoneOptions). Picks from the shared registry instead of free-typing.
        zoneOptions: zoneOptions(sensor.zone, store.get("zones")),
      },
      actions: {
        saveProp: this.sensorsService.saveProp,
        armCalibration: this.armCalibration.bind(this),
        cancelCalibration: this.cancelCalibration.bind(this),
        startCalibration: this.startCalibration.bind(this),
        toggleRadarDebug: this.toggleRadarDebug.bind(this),
        saveZone: this.saveZone.bind(this),
        addZone: this.addZone.bind(this),
        removeZone: this.removeZone.bind(this),
      },
      startRect: rect,
      padding: { x: 50, y: 200 }
    });
  }

  /** Persist the dropdown's selected zone. Re-orders zoneOptions so the chosen
   * value stays first (= selected) across the overlay re-render. */
  private saveZone(data: any) {
    const el = document.getElementById(data.id + '_zone') as HTMLSelectElement | null;
    const value = el?.value ?? '';
    serverHandler.submitDataChange(data.id, 'sensors', 'zone', value);
    this.patchOverlay({ zone: value, zoneOptions: zoneOptions(value, store.get('zones')) });
  }

  /** Add a new zone to the shared registry and assign it to this sensor. */
  private async addZone(data: any) {
    const input = document.getElementById(data.id + '_zoneNew') as HTMLInputElement | null;
    const name = input?.value?.trim();
    if (!name) return;
    const zones = await svcAddZone(name);
    if (input) input.value = '';
    serverHandler.submitDataChange(data.id, 'sensors', 'zone', name);
    this.patchOverlay({ zone: name, zoneOptions: zoneOptions(name, zones) });
  }

  /** Remove this sensor's current zone from the shared registry, unassigning it. */
  private async removeZone(data: any) {
    if (!data.zone) return;
    const zones = await svcRemoveZone(data.zone);
    serverHandler.submitDataChange(data.id, 'sensors', 'zone', '');
    this.patchOverlay({ zone: '', zoneOptions: zoneOptions('', zones) });
  }

  // --- Calibration (detail overlay, 2-step) --------------------------------

  /** Step 1: arm — reveals the disclaimer + confirm/cancel. */
  private armCalibration() {
    this.patchOverlay({ calibrateArmed: true });
  }

  private cancelCalibration() {
    this.patchOverlay({ calibrateArmed: false });
  }

  /** Step 2: confirmed — count down (grace period to leave the room), then fire. */
  private startCalibration(data: any) {
    const id = data?.id;
    if (!id) return;

    let remaining = CAL_START_DELAY_S;
    this.patchOverlay({
      calibrateArmed: false,
      calibrationStarting: true,
      calibrationCountdown: remaining,
    });

    const tick = () => {
      remaining -= 1;
      if (remaining > 0) {
        if (this.overlayShows(id)) this.patchOverlay({ calibrationCountdown: remaining });
        setTimeout(tick, 1000);
      } else {
        this.fireCalibration(id);
      }
    };
    setTimeout(tick, 1000);
  }

  /** Trigger the server-side calibration; the device + WS poll drive progress. */
  private async fireCalibration(id: string) {
    if (this.overlayShows(id)) {
      this.patchOverlay({ calibrationStarting: false, calibrating: true, calPct: 0 });
    }
    try {
      await serverHandler.calibrateSensor(id);
    } catch (error: any) {
      // IP unknown / already calibrating / device unreachable / network error.
      console.error('Failed to calibrate sensor:', error);
      if (this.overlayShows(id)) this.patchOverlay({ calibrating: false });
      showToaster({
        from: 'bottom',
        message: error?.message || 'Could not start calibration',
        timer: 3000,
      });
    }
  }

  // --- Live radar bins (presence debug view) --------------------------------

  /** Toggle the radar engineering-mode live view. The poll/draw loop lives in
   * radar-debug.ts; its alive() check ends the session (and turns the device's
   * debug window off) as soon as the overlay closes or leaves this sensor. */
  private async toggleRadarDebug(data: any) {
    const id = data?.id;
    if (!id) return;

    if (data.radarDebug) {
      stopRadarDebug();
      this.patchOverlay({ radarDebug: false });
      return;
    }

    // Reveal the canvas first so the loop's first frame has somewhere to draw.
    this.patchOverlay({ radarDebug: true });
    try {
      await startRadarDebug(id, () => {
        const bind: any = OverlayModal.bind;
        return this.overlayShows(id) && !!bind?.data?.radarDebug;
      });
    } catch (error: any) {
      stopRadarDebug(false);
      if (this.overlayShows(id)) this.patchOverlay({ radarDebug: false });
      showToaster({
        from: 'bottom',
        message: error?.message || 'Could not start the radar view',
        timer: 3000,
      });
    }
  }

  /** True when the detail overlay is open on the given sensor. */
  private overlayShows(id: string): boolean {
    const bind: any = OverlayModal.bind;
    return !!bind?.visible && bind?.data?.id === id;
  }

  /** Reactively merge a patch into the open overlay's data (fresh object — the
   * bindrjs reactivity pattern; nested mutation alone won't re-render). */
  private patchOverlay(patch: Record<string, any>) {
    const current: any = (OverlayModal.bind as any)?.data || {};
    updateOverlayData({ ...current, ...patch });
  }

  /** Push server-driven calibrating/calPct from the store sensor into the open
   * overlay (which holds a detached copy that the WS path never touches). */
  private syncOverlayCalibration(sensors: Sensor[]) {
    const data: any = (OverlayModal.bind as any)?.data;
    if (!(OverlayModal.bind as any)?.visible || !data?.id) return;
    const sensor: any = sensors.find((s) => s.id === data.id);
    if (!sensor || sensor.calibrating === undefined) return;

    const calPct = sensor.calPct || 0;
    if (data.calibrating === sensor.calibrating && data.calPct === calPct) return;
    this.patchOverlay({
      calibrating: sensor.calibrating,
      calPct,
      ...(sensor.calibrating ? { calibrationStarting: false } : {}),
    });
  }

}

export const SensorsTab = new SensorsTabClass(SensorsService);