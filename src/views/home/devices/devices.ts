import { Component } from "../../../core/component";
import { bus } from "../../../core/bus";
import { store } from "../../../store/store";
import { showToaster } from "../../../components/popup-message/popup-message";
import { setServerChannel, visionStreamUrl, ZoneOccupant } from "../../../utils/server-handler";
import template from "./devices.html?raw";
import { Device, DevicesTabState } from "./devices.model";
import { Channel, deviceChannels, withChannelValue } from "./channels";
import { DevicesService, DevicesServiceClass } from "./devices.service";
import { startVisionOccupancy, stopVisionOccupancy } from "../../../utils/vision-handler";

const TILE_ICON_ON: { [cat: string]: string } = {
  light: "iconoir-light-bulb-on",
  "dimmable-light": "iconoir-light-bulb-on",
};
const TILE_ICON_OFF: { [cat: string]: string } = {
  light: "iconoir-light-bulb",
  "dimmable-light": "iconoir-light-bulb",
  blinds: "iconoir-windows",
  "evap-cooler": "iconoir-snow-flake",
  camera: "iconoir-video-camera",
};

/**
 * Decorate a raw device with the display-time fields the generic template renders
 * from: its channel projection (each tagged with the widget that renders it), the
 * lit/wide flags, the tile icon, and a one-line status. Mutates in place so the
 * same object the store/bind hold gets refreshed reactively.
 */
function decorateDevice(device: Device): Device {
  const channels = deviceChannels(device);
  const actuators = channels.filter((c) => c.role === "actuator");
  const soleActuator = actuators.length === 1;

  channels.forEach((c) => {
    if (c.role === "sensor") c.control = "readout";
    else if (c.role === "setting") c.control = "stepper";
    else if (c.kind === "boolean") c.control = soleActuator ? "none" : "chip";
    else c.control = c.precision ? "none" : "slider"; // number actuator
  });

  device.channels = channels;
  device.wide = device.deviceCategory === "evap-cooler" || device.deviceCategory === "camera";
  // Camera live view comes from the vision-service (annotated MJPEG), never the cam
  // directly nor a relayed blob (§3.2/§6). `who` is filled by the occupancy poller.
  if (device.deviceCategory === "camera") device.streamUrl = visionStreamUrl(device.id);
  device.isOn = actuators.some((c) =>
    c.kind === "boolean" ? c.value === true : (c.value as number) > 0,
  );
  device.icon = (device.isOn ? TILE_ICON_ON : TILE_ICON_OFF)[device.deviceCategory]
    ?? TILE_ICON_OFF[device.deviceCategory]
    ?? "iconoir-circle";
  device.status = computeStatus(device, actuators);
  return device;
}

/** The tile body status line, per category. Cooler shows its own readouts instead. */
function computeStatus(device: Device, actuators: Channel[]): string {
  switch (device.deviceCategory) {
    case "light":
      return device.isOn ? "On" : "Off";
    case "dimmable-light": {
      const v = actuators[0]?.value as number;
      return v > 0 ? `On · ${Math.round(v)}%` : "Off";
    }
    case "blinds": {
      const v = actuators[0]?.value as number;
      return v > 0 ? `Open · ${Math.round(v)}%` : "Closed";
    }
    default:
      return "";
  }
}

/** The camera tile's "who is here" headline (§6) — the high-value surface. Names the
 * household members present, counts guests, falls back to a neutral count for unknown
 * people, and "Empty" when no one's there. */
function summariseOccupants(occ: ZoneOccupant[] | undefined): string {
  if (!occ || occ.length === 0) return "Empty";
  const names = occ.filter((o) => o.class === "household" && o.name).map((o) => o.name as string);
  const guests = occ.filter((o) => o.class === "guest").length;
  const unknown = occ.filter((o) => o.class === "unknown").length;
  const parts: string[] = [];
  if (names.length) parts.push(names.join(", "));
  if (guests) parts.push(`${guests} guest${guests === 1 ? "" : "s"}`);
  if (unknown && !names.length && !guests) parts.push(`${unknown} ${unknown === 1 ? "person" : "people"}`);
  else if (unknown) parts.push(`${unknown} more`);
  return parts.join(" + ") || `${occ.length} present`;
}

class DevicesTabClass extends Component<DevicesTabState> {
  devicesService: DevicesServiceClass;
  private unsubscribeDeclare?: () => void;
  private unsubscribeUpdate?: () => void;
  private unsubscribeOccupancy?: () => void;
  private unsubscribeDevices?: () => void;
  private zoneOccupants: Record<string, ZoneOccupant[]> = {};

  constructor(devicesService: DevicesServiceClass) {
    super();
    this.devicesService = devicesService;
    const devices = store.get("devices");
    devices.forEach((device) => decorateDevice(device));
  }

  mount() {
    this.createBind({
      id: "devices",
      template,
      bind: {
        devices: store.get("devices").map(decorateDevice),

        // The whole tile is the switch for single-actuator devices.
        onTileClick: (device: Device) => {
          const cat = device.deviceCategory;
          if (cat === "blinds" || cat === "camera") {
            this.devicesService.editClick({ target: this.tileEl(device.id) }, device);
            return;
          }
          if (cat === "evap-cooler") return; // controlled via its chips/stepper
          const primary = (device.channels || []).find((c) => c.role === "actuator");
          if (!primary) return;
          if (primary.kind === "boolean") {
            this.writeChannel(device, primary, !primary.value);
          } else {
            const v = primary.value as number;
            if (v > 0) {
              (device as any)._last = v;
              this.writeChannel(device, primary, 0);
            } else {
              this.writeChannel(device, primary, (device as any)._last || primary.max);
            }
          }
        },

        // Boolean chips (cooler fan/water).
        onChannelSet: (event: Event, deviceId: string, channelKey: string, value: boolean | number) => {
          event.stopPropagation();
          const found = this.find(deviceId, channelKey);
          if (found) this.writeChannel(found.device, found.channel, value);
        },

        // Number actuator slider (dimmable brightness) — commit on change.
        onChannelSlider: (event: Event, deviceId: string, channelKey: string) => {
          event.stopPropagation();
          const found = this.find(deviceId, channelKey);
          if (found) this.writeChannel(found.device, found.channel, parseInt((event.target as HTMLInputElement).value));
        },

        // Number setting stepper (cooler target).
        onChannelStep: (event: Event, deviceId: string, channelKey: string, dir: -1 | 1) => {
          event.stopPropagation();
          const found = this.find(deviceId, channelKey);
          if (!found) return;
          const { channel } = found;
          const next = Math.min(channel.max, Math.max(channel.min, (channel.value as number) + dir * channel.step));
          if (next !== channel.value) this.writeChannel(found.device, channel, next);
        },

        stop: (event: Event) => event.stopPropagation(),
        onEditClick: (event: any, device: Device) => {
          event.stopPropagation();
          this.devicesService.editClick(event, device);
        },
      },
    });

    this.unsubscribeDevices = store.subscribe("devices", (devices) => {
      this.bind.devices = devices.map(decorateDevice);
      this.applyOccupancy();
    });

    this.unsubscribeDeclare = bus.on("device:declare", (declaredDevice) => {
      this.onDeviceDeclare(declaredDevice);
    });

    this.unsubscribeUpdate = bus.on("device:update", (updatedDevice) => {
      this.onDeviceUpdate(updatedDevice);
    });

    // Camera "who is here" headline — fed by the vision-service occupancy poller.
    this.unsubscribeOccupancy = bus.on("vision:occupancy", (zones) => {
      this.zoneOccupants = zones || {};
      this.applyOccupancy();
    });
    startVisionOccupancy();
  }

  unmount() {
    this.unsubscribeDevices?.();
    this.unsubscribeDeclare?.();
    this.unsubscribeUpdate?.();
    this.unsubscribeOccupancy?.();
    stopVisionOccupancy();
  }

  /** Push the latest per-zone occupancy onto each camera tile's `who` headline. */
  private applyOccupancy() {
    (this.bind.devices || []).forEach((device) => {
      if (device.deviceCategory !== "camera") return;
      device.who = summariseOccupants(this.zoneOccupants[device.zone || "_"]);
    });
  }

  /** Resolve a (deviceId, channelKey) pair to the live bound device + channel. */
  private find(deviceId: string, channelKey: string): { device: Device; channel: Channel } | null {
    const device = this.bind.devices.find((d) => d.id === deviceId);
    const channel = device?.channels?.find((c) => c.key === channelKey);
    return device && channel ? { device, channel } : null;
  }

  /** The single channel-addressed write path: optimistically fold the value into
   * the blob + re-decorate, post {id, channel, value}, and revert on failure. */
  private writeChannel(device: Device, channel: Channel, value: boolean | number) {
    const previous = device.value;
    device.value = withChannelValue(device.deviceCategory, device.value, channel.key, value);
    decorateDevice(device);

    setServerChannel(device.id, channel.key, value)
      .then(({ success }) => {
        if (!success) this.revertChannel(device, previous, "Something went wrong");
      })
      .catch(() => this.revertChannel(device, previous, "Couldn't connect to device"));
  }

  private revertChannel(device: Device, previous: any, message: string) {
    device.value = previous;
    decorateDevice(device);
    showToaster({ message, from: "bottom", timer: 2000 });
  }

  // Anchor element used to position the detail overlay for tiles without a
  // dedicated edit affordance (blinds / camera open it on tap).
  private tileEl(deviceId: string): HTMLElement {
    const index = this.bind.devices.findIndex((d) => d.id === deviceId);
    return (document.querySelectorAll("#devices .device-tile")[index] as HTMLElement)
      || (document.getElementById("devices") as HTMLElement);
  }

  private onDeviceDeclare(declaredDevice: Device) {
    if (!this.bind.devices) this.bind.devices = [];
    const device = this.bind.devices.find((d) => d.id === declaredDevice.id);
    if (!device) {
      this.bind.devices.push(decorateDevice(declaredDevice));
    }
    // A newly-declared camera picks up its live view (visionStreamUrl in decorate)
    // + its "who" headline (next occupancy poll) automatically — no per-cam subscribe.
  }

  private onDeviceUpdate(updatedDevice: Device) {
    const device = this.bind.devices.find((d) => d.id === updatedDevice.id);
    if (device) {
      device.value = updatedDevice.value;
      device.manual = updatedDevice.manual;
      device.name = updatedDevice.name;
      device.zone = updatedDevice.zone ?? device.zone;
      device.operationalRanges = updatedDevice.operationalRanges;
      decorateDevice(device);
      if (device.deviceCategory === "camera") this.applyOccupancy();
    }
  }
}

export const DevicesTab = new DevicesTabClass(DevicesService);
