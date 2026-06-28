import { Channel } from "./channels";

export type Device = {
  id: string;
  deviceCategory:
    | "light"
    | "evap-cooler"
    | "dimmable-light"
    | "blinds"
    | "camera"
    | "presence-relay";
  manual: boolean;
  name: string;
  value: any;
  type: "boolean" | "value";
  ip?: string;
  /** Physical room/area the device lives in — install-time topology, user-set in
   * the edit overlay. Drives per-zone routing on the memory/LLM side. */
  zone?: string;
  operationalRanges: string[];

  // Stage 4c: display-time decoration computed from the channel projection
  // (see decorateDevice in devices.ts). Optional so raw server payloads still type.
  channels?: Channel[];
  /** Tile chrome icon (iconoir class). */
  icon?: string;
  /** Spans two grid columns (cooler / camera). */
  wide?: boolean;
  /** Any actuator channel is on (drives the lit-tile styling). */
  isOn?: boolean;
  /** One-line tile body status ("On", "On · 80%", "Open · 40%"). */
  status?: string;
  /** Camera only: the vision-service annotated MJPEG live-view URL (§6). */
  streamUrl?: string;
  /** Camera only: "who is here" headline from the occupancy world-model
   * ("David + 1 guest", "Empty") — the high-value surface, not the picture (§6). */
  who?: string;
};

export type DeviceWSEvents = {
  "device-declare": (device: Device) => void;
  "device-update": (device: Device) => void;
};

export type DevicesTabState = {
  devices: Device[];
  onTileClick: (device: Device) => void;
  // One channel-addressed write path (Stage 4c). Handlers take primitives
  // (deviceId, channelKey) rather than the loop's `device`/`channel` objects,
  // because bindrjs only substitutes a loop var when it's followed by `.`/`)` —
  // passing `channel.deviceId`/`channel.key` keeps every ref a safe property access.
  onChannelSet: (event: Event, deviceId: string, channelKey: string, value: boolean | number) => void;
  onChannelSlider: (event: Event, deviceId: string, channelKey: string) => void;
  onChannelStep: (event: Event, deviceId: string, channelKey: string, dir: -1 | 1) => void;
  stop: (event: Event) => void;
  onEditClick: (event: any, device: Device) => void;
};
