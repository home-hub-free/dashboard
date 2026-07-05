import { Channel } from "./channels";
import { CameraPreset } from "../../../utils/server-handler";

export type Device = {
  id: string;
  deviceCategory:
    | "light"
    | "evap-cooler"
    | "dimmable-light"
    | "blinds"
    | "camera"
    | "presence-relay"
    | "voice-satellite";
  manual: boolean;
  name: string;
  value: any;
  type: "boolean" | "value";
  ip?: string;
  /** Physical room/area the device lives in — install-time topology, user-set in
   * the edit overlay. Drives per-zone routing on the memory/LLM side. */
  zone?: string;
  operationalRanges: string[];
  /** Camera-capability block declared to the hub (§3.3) — present on a `camera` node
   * and on a camera-equipped `voice-satellite`. Its existence (a `path`) is what makes
   * a tile show a live view, not the category — see `hasCamView`. */
  stream?: {
    proto?: string;
    port?: number;
    path?: string;
    snapshot?: string;
    res?: string;
    fps?: number;
  } | null;

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
  /** Decorate-time: this tile shows a vision-service live view (a `camera`, or a
   * camera-equipped `voice-satellite` — gated on the `stream` block, not the category).
   * Drives the `cam-wrap` markup; a satellite also keeps its normal controls below. */
  hasCamView?: boolean;
  /** Camera / camera-satellite: the vision-service annotated MJPEG live-view URL (§6). */
  streamUrl?: string;
  /** Camera only: "who is here" headline from the occupancy world-model
   * ("David + 1 guest", "Empty") — the high-value surface, not the picture (§6). */
  who?: string;
  /** Camera only: vision-worker health badge text ("live · detecting", "live · no
   * detection", "offline") — answers "is the cam making frames AND is detection on?". */
  camHealth?: string;
  /** Camera only: the badge's state-modifier class ("cam-health--ok|warn|down").
   * ONE token — bindrjs `:class` add/removes a single class; the static
   * `cam-health` base class lives in the markup. */
  camHealthClass?: string;
  /** Camera only: badge tooltip — raw worker counters (frames, frame age, backends). */
  camHealthTitle?: string;
  /** Camera only: this tile came from the VISION-SERVICE roster (a static RTSP cam
   * that never declares to the hub — e.g. the Tapo/Mercusys fleet). Its controls go
   * via the hub /camera/:id proxy and the hub device-edit overlay doesn't apply. */
  visionOnly?: boolean;
  /** Camera only: ONVIF capability summary from the worker-status poll — which
   * controls to draw. Fixed cams (C110) get imaging but no D-pad. */
  onvifCaps?: { ptz: boolean; imaging: boolean; events: boolean } | null;
  /** Camera only: PTZ available (onvifCaps.ptz) — gates the tile D-pad + preset chips. */
  ptz?: boolean;
  /** Camera only: imaging service available — gates the tune (settings) affordance. */
  imagingCaps?: boolean;
  /** Camera only: saved views (ONVIF presets) rendered as recall chips. */
  presets?: CameraPreset[];
  /** Camera only: archives footage (IP cams with an RTSP main) → shows the Recordings
   * review entry point in the live view. Face-ID desk/entrance cams are false. */
  records?: boolean;
};

export type DeviceWSEvents = {
  "device-declare": (device: Device) => void;
  "device-update": (device: Device) => void;
};

/**
 * One collapsible section on the device wall. The wall is grouped by `zone` so it
 * stays glanceable as the fleet grows (a flat grid of 20+ tiles is unreadable);
 * cameras get their own group (kind: "cameras") so their live streams don't dominate
 * the layout and only run when that group is expanded. `devices` holds the SAME object
 * references as the flat `devices` array, so a per-device WS patch updates a tile in
 * place without rebuilding the groups.
 */
export type DeviceGroup = {
  /** Stable key for :key + collapse persistence (zone name, "_unassigned", "_cameras"). */
  key: string;
  /** Header label shown to the user. */
  label: string;
  kind: "zone" | "cameras";
  devices: Device[];
  /** Right-aligned header summary ("2 on", "4 cameras"). */
  summary: string;
  collapsed: boolean;
};

export type DevicesTabState = {
  devices: Device[];
  /** Zone-grouped view of `devices` (derived; what the template actually renders). */
  groups: DeviceGroup[];
  /** Whether any device exists at all (empty-state gate). */
  hasDevices: boolean;
  /** Toggle a group's collapsed state (persisted). */
  toggleGroup: (key: string) => void;
  /** Filter tiles by name/zone substring (uncontrolled input → recompute groups). */
  onFilter: (event: Event) => void;
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
  /** Camera ⋯ — the config path (tile tap opens the live lightbox instead). */
  onCamEdit: (event: any, device: Device) => void;
  // Camera tile controls (CAMERA_ONVIF_CONTROL_PLAN): D-pad nudge, preset recall,
  // and the tune overlay (imaging + saved-view management). Primitive args only
  // (bindrjs loop-var rule).
  onCamNudge: (event: Event, deviceId: string, dx: number, dy: number) => void;
  onCamGoto: (event: Event, deviceId: string, token: string) => void;
  onCamSettings: (event: any, deviceId: string) => void;
};
