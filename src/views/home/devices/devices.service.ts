import {
  openOverlay,
  updateOverlayData,
} from "../../../components/overlay-modal/overlay-modal";
import { showToaster } from "../../../components/popup-message/popup-message";
import { store } from "../../../store/store";
import {
  BlindsConfigureActions,
  headers,
  server,
  setServerChannel,
  submitDataChange,
  toggleServerDevice,
} from "../../../utils/server-handler";
import { channelSchema } from "./channels";
import { getGlobalPosition } from "../../../utils/utils.service";
import {
  addZone as svcAddZone,
  removeZone as svcRemoveZone,
  zoneOptions,
} from "../../../utils/zones.service";
import DeviceEditView from "../overlay-views/devices-edit.template.html?raw";
import { Device } from "./devices.model";

const DeviceInputType: { [key in Device["deviceCategory"]]?: string } = {
  "evap-cooler": "button",
  "dimmable-light": "range",
  blinds: "range",
};

const SCROLL_THRESHOLD = 5;

/** Stepper origin when a cooler somehow has no numeric target yet (matches the
 * server's Node.initialValue default). Not a display fallback — the template shows
 * the real value; this only seeds the first ± press. */
const DEFAULT_TARGET = 26;

export class DevicesServiceClass {
  originalValue = 0;
  touchStartPosition = 0;
  currentTouchPosition = 0;
  initialY = 0;
  currentY = 0;
  initialScroll = 0;
  scrollChange = 0;
  recordSwipe = false;
  swipeOnAxis: "clientX" | "clientY" = "clientX";
  currentTimeout: any;

  constructor() {}

  deviceTouchStart(event: any, device: Device) {
    const listElement = window.document.getElementById("tab-content");
    this.initialScroll = listElement?.scrollTop || 0;
    this.recordSwipe = false;

    let rect = getGlobalPosition(event.target);
    this.touchStartPosition = event.touches[0][this.swipeOnAxis];
    this.initialY = event.touches[0]["clientY"];

    let inputType: any = "text";
    if (device.type === "value") {
      inputType = DeviceInputType[device.deviceCategory];
    }

    const parsedRanges = this.parseOperationalRanges(device.operationalRanges);

    this.currentTimeout = setTimeout(() => {
      this.recordSwipe = true;
      if (!this.originalValue && device.deviceCategory === "evap-cooler") {
        this.originalValue = device.value;
      }

      if (!this.originalValue && device.deviceCategory !== "evap-cooler") {
        this.originalValue = parseInt(device.value);
      }

      openOverlay({
        template: DeviceEditView,
        data: {
          ...device,
          inputType,
          parsedRanges,
          // Options for the zone <select>, current value ordered first (see
          // zoneOptions). Picks from the shared registry instead of free-typing.
          zoneOptions: zoneOptions(device.zone, store.get("zones")),
        },
        actions: {
          saveProp: this.saveProp.bind(this),
          updateDevice: this.updateDevice.bind(this),
          configureBlinds: this.configureBlinds.bind(this),
          updateEvapCoolerTarget: this.updateEvapCoolerTarget.bind(this),
          setCoolerChannel: this.setCoolerChannel.bind(this),
          saveOperationalRanges: this.saveOperationalRanges.bind(this),
          removeOperationalRange: this.removeOperationalRange.bind(this),
          saveZone: this.saveZone.bind(this),
          addZone: this.addZone.bind(this),
          removeZone: this.removeZone.bind(this),
        },
        startRect: rect,
        padding: { x: 6, y: 50 },
      });
    }, 600);
  }

  deviceTouchMove(event: TouchEvent, device: Device) {
    const newTouchPositionX: any = event.touches[0][this.swipeOnAxis];
    const newY = event.touches[0]["clientY"];

    this.currentTouchPosition = newTouchPositionX - this.touchStartPosition;
    this.currentY = Math.abs(newY - this.initialY);

    const listElement = window.document.getElementById("tab-content");
    this.scrollChange = Math.abs(
      listElement?.scrollTop || 0 - this.initialScroll,
    );

    const calculated = Math.round(
      this.originalValue + this.currentTouchPosition / 2,
    );
    const newValue = calculated < 0 ? 0 : calculated > 100 ? 100 : calculated;

    // Scroll threshold to avoid activating elements while scrolling
    if (this.scrollChange >= SCROLL_THRESHOLD) {
      clearTimeout(this.currentTimeout);
    }

    if (
      this.recordSwipe &&
      device.type === "value" &&
      newValue >= 0 &&
      newValue <= 100
    ) {
      device.value = newValue;
      updateOverlayData({ ...device, value: newValue });
      if (newValue % 10 === 0) {
        this.updateDevice(device);
      }
    }
  }

  deviceTouchEnd(event: any, device: Device) {
    if (this.recordSwipe && device.type === "value") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.recordSwipe = false;
      this.originalValue = 0;
      setTimeout(() => {
        this.updateDevice(device);
      }, 50);
      return;
    }

    if (this.currentTimeout) clearTimeout(this.currentTimeout);

    if (this.recordSwipe && device.type === "boolean") return;

    if (
      this.scrollChange >= SCROLL_THRESHOLD ||
      this.currentY >= SCROLL_THRESHOLD
    ) {
      this.scrollChange = 0;
      this.initialY = 0;
      this.currentY = 0;
      return;
    }
  }

  editClick(event: any, device: Device) {
    const parsedRanges = this.parseOperationalRanges(device.operationalRanges);
    let rect = getGlobalPosition(event.target);
    let inputType = DeviceInputType[device.deviceCategory];

    openOverlay({
      template: DeviceEditView,
      data: {
        ...device,
        inputType,
        parsedRanges,
        // Options for the zone <select>, current value ordered first (see
        // zoneOptions). Picks from the shared registry instead of free-typing.
        zoneOptions: zoneOptions(device.zone, store.get("zones")),
      },
      actions: {
        saveProp: this.saveProp.bind(this),
        updateDevice: this.updateDevice.bind(this),
        configureBlinds: this.configureBlinds.bind(this),
        updateEvapCoolerTarget: this.updateEvapCoolerTarget.bind(this),
        setCoolerChannel: this.setCoolerChannel.bind(this),
        saveOperationalRanges: this.saveOperationalRanges.bind(this),
        removeOperationalRange: this.removeOperationalRange.bind(this),
        saveZone: this.saveZone.bind(this),
        addZone: this.addZone.bind(this),
        removeZone: this.removeZone.bind(this),
      },
      startRect: rect,
      padding: { x: 6, y: 50 },
    });
  }

  updateDevice(device: Device) {
    toggleServerDevice(device)
      .then(({ success }) => {
        if (!success) {
          return showToaster({
            message: "Something went wrong",
            from: "bottom",
            timer: 2000,
          });
        }
      })
      .catch(() => {
        showToaster({
          message: "Couldn't connect to device",
          from: "bottom",
          timer: 2000,
        });
        // Revert value if failed
        device.value = !device.value;
      });
  }

  /** Step the cooler target ±1 °C, clamped to the schema range, via a
   * channel-addressed write. Routing through the channel path (vs the old
   * whole-value POST) means the hub folds just `target` into the blob and can never
   * drop a sibling channel — and a `setting` channel doesn't latch `manual`, so the
   * closed loop keeps tracking the new setpoint. */
  updateEvapCoolerTarget(device: any, operator: -1 | 1) {
    const range = channelSchema("evap-cooler")?.find((s) => s.key === "target")?.range;
    const min = range?.min ?? 16;
    const max = range?.max ?? 30;
    const step = range?.step ?? 1;
    const current = typeof device.value?.target === "number" ? device.value.target : DEFAULT_TARGET;
    const next = Math.min(max, Math.max(min, current + step * operator));
    if (next === current) return Promise.resolve({ success: true });
    return this.writeOverlayChannel(device, "target", next);
  }

  /** Toggle a cooler actuator channel (fan / water) via a channel-addressed write,
   * replacing the old "mutate device.value then POST the whole blob" path that
   * could ship a stale/partial value and wipe `target`. */
  setCoolerChannel(device: any, channel: string, value: boolean) {
    return this.writeOverlayChannel(device, channel, value);
  }

  /** Channel-addressed write from the detail overlay. Optimistically folds the one
   * channel into the overlay's value (so the UI reacts immediately), posts
   * {id, channel, value} to /device-update, and reverts on failure. The authoritative
   * value (and the tile/store) re-syncs from the server's device-update broadcast. */
  private writeOverlayChannel(device: any, channel: string, value: boolean | number) {
    const previous = device.value;
    updateOverlayData({ ...device, value: { ...(device.value ?? {}), [channel]: value } });
    return setServerChannel(device.id, channel, value)
      .then((res) => {
        if (!res.success) {
          updateOverlayData({ ...device, value: previous });
          showToaster({ message: "Something went wrong", from: "bottom", timer: 2000 });
        }
        return res;
      })
      .catch(() => {
        updateOverlayData({ ...device, value: previous });
        showToaster({ message: "Couldn't connect to device", from: "bottom", timer: 2000 });
        return { success: false };
      });
  }

  /** Persist the dropdown's selected zone. Re-orders zoneOptions so the chosen
   * value stays first (= selected) across the overlay re-render. */
  saveZone(data: any) {
    const el = document.getElementById(data.id + "_zone") as HTMLSelectElement | null;
    const value = el?.value ?? "";
    data.zone = value;
    submitDataChange(data.id, "devices", "zone", value);
    updateOverlayData({ ...data, zoneOptions: zoneOptions(value, store.get("zones")) });
  }

  /** Add a new zone to the shared registry and assign it to this device. */
  async addZone(data: any) {
    const input = document.getElementById(data.id + "_zoneNew") as HTMLInputElement | null;
    const name = input?.value?.trim();
    if (!name) return;
    const zones = await svcAddZone(name);
    if (input) input.value = "";
    data.zone = name;
    submitDataChange(data.id, "devices", "zone", name);
    updateOverlayData({ ...data, zoneOptions: zoneOptions(name, zones) });
  }

  /** Remove this device's current zone from the shared registry, unassigning it. */
  async removeZone(data: any) {
    if (!data.zone) return;
    const zones = await svcRemoveZone(data.zone);
    data.zone = "";
    submitDataChange(data.id, "devices", "zone", "");
    updateOverlayData({ ...data, zoneOptions: zoneOptions("", zones) });
  }

  saveProp(data: any, prop: string, value?: any) {
    if (value == null) {
      let element: HTMLInputElement | null = document.getElementById(
        data.id + `_${prop}`,
      ) as HTMLInputElement;
      value = element?.value;
      if (prop === "manual") {
        value = !element.checked;
      }
    }
    if (value !== undefined) {
      data[prop] = value;
      updateOverlayData({ ...data });
      submitDataChange(data.id, "devices", prop, value).then(() => {
        showToaster({
          from: "bottom",
          message: `Saved device ${prop}`,
          timer: 2000,
        });
      });
    }
  }

  saveOperationalRanges(device: Device) {
    let elements: HTMLInputElement[] = [
      document.getElementById(
        device.id + "_operationalRangesFrom",
      ) as HTMLInputElement,
      document.getElementById(
        device.id + "_operationalRangesTo",
      ) as HTMLInputElement,
    ];

    const start = elements[0].value;
    const end = elements[1].value;
    const range = [start, end].join("-");

    if (!start || !end) {
      showToaster({
        from: "bottom",
        message: "Missing value in operational range time",
        timer: 3000,
      });
      return;
    }
    const startValue = parseInt(start.split(":").join(""));
    const endValue = parseInt(end.split(":").join(""));
    if (startValue > endValue) {
      showToaster({
        from: "bottom",
        message: "Invalid range",
        timer: 3000,
      });
      return;
    }

    device.operationalRanges.push(range);
    const parsedRanges = this.parseOperationalRanges(device.operationalRanges);
    updateOverlayData({ ...device, parsedRanges });

    submitDataChange(
      device.id,
      "devices",
      "operationalRanges",
      device.operationalRanges,
    );
  }

  removeOperationalRange(device: Device, index: any) {
    if (device.operationalRanges.length === 1) {
      device.operationalRanges = [];
    } else {
      device.operationalRanges.splice(index, 1);
    }

    const parsedRanges = this.parseOperationalRanges(device.operationalRanges);
    updateOverlayData({ ...device, parsedRanges });
    submitDataChange(
      device.id,
      "devices",
      "operationalRanges",
      device.operationalRanges,
    );
  }

  updateCameraSetting(property: string, ip: string, value: string) {
    return fetch("http://" + ip + ":81/settings", {
      method: "POST",
      body: JSON.stringify({
        var: property,
        val: value,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        console.log(result);
      });
  }

  getDeviceById(id: string): Device | null {
    return store.get('devices').find((device) => device.id === id) || null;
  }

  configureBlinds(device: any, action: BlindsConfigureActions) {
    return new Promise((resolve, reject) => {
      return fetch(server + "device-blinds-configure", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: device.id,
          action,
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

  parseOperationalRanges(operationalRanges: string[]) {
    const rangesForGraph: any = { am: [], pm: [] };

    function to12hLabelAndDecimal(hour24: number) {
      // Extract hour and minutes as integers
      const hourInt = Math.floor(hour24) % 24; // 0-23
      const minuteDecimal = hour24 - Math.floor(hour24);
      const minutes = Math.round(minuteDecimal * 60);

      // Convert to 12h hour for label
      let hour12 = hourInt % 12;
      if (hour12 === 0) hour12 = 12;

      // Format label with zero-padded HH:MM
      const labelHour = hour12.toString().padStart(2, "0");
      const labelMinutes = minutes.toString().padStart(2, "0");
      const label = `${labelHour}:${labelMinutes}`;

      // Decimal hour for graph (0 to 12 scale)
      const decimal = ((hourInt % 12) + minutes / 60).toFixed(2);

      return { label, decimal };
    }

    operationalRanges.forEach((rangeStr) => {
      const [startStr, endStr] = rangeStr.split("-");
      const [startH, startM] = startStr.split(":").map(Number);
      const [endH, endM] = endStr.split(":").map(Number);

      const start24 = startH + startM / 60;
      const end24 = endH + endM / 60;

      if (end24 <= 12) {
        // Fully AM
        rangesForGraph.am.push({
          start: to12hLabelAndDecimal(start24),
          end: to12hLabelAndDecimal(end24),
        });
      } else if (start24 >= 12) {
        // Fully PM
        rangesForGraph.pm.push({
          start: to12hLabelAndDecimal(start24),
          end: to12hLabelAndDecimal(end24),
        });
      } else {
        // Crosses noon - split into AM and PM parts
        rangesForGraph.am.push({
          start: to12hLabelAndDecimal(start24),
          end: { label: "12:00", decimal: 12 },
        });
        rangesForGraph.pm.push({
          start: { label: "12:00", decimal: 0 },
          end: to12hLabelAndDecimal(end24),
        });
      }
    });

    return rangesForGraph;
  }
}
export const DevicesService = new DevicesServiceClass();
