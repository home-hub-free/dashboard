import { Component } from "../../../core/component";
import { bus } from "../../../core/bus";
import { store } from "../../../store/store";
import { showToaster } from "../../../components/popup-message/popup-message";
import {
  CameraControls,
  cameraPtzGoto,
  cameraPtzMove,
  cameraSetPrivacy,
  fetchCameraControls,
  setServerChannel,
  visionStreamUrl,
  ZoneOccupant,
  VisionCameraStatus,
} from "../../../utils/server-handler";
import template from "./devices.html?raw";
import { Device, DeviceGroup, DevicesTabState } from "./devices.model";
import { Sensor } from "../sensors/sensors.model";
import { getPins } from "./pins.service";
import { Channel, deviceChannels, withChannelValue } from "./channels";
import { DevicesService, DevicesServiceClass } from "./devices.service";
import { CAM_NUDGE_MS, CAM_NUDGE_SPEED, openCameraControls, openCameraLive } from "./camera-ctl.service";
import { startVisionOccupancy, stopVisionOccupancy } from "../../../utils/vision-handler";

// Tiles with no zone set fall under this bucket; cameras get their own group.
const UNASSIGNED = "_unassigned";
const CAMERAS = "_cameras";
// The signed-in member's pinned devices render first (see pins.service).
const PINNED = "_pinned";
// Which groups start collapsed when the user has no saved preference. Cameras default
// to collapsed so Home opens without N live MJPEG streams running (perf + scroll).
const DEFAULT_COLLAPSED = new Set<string>([CAMERAS]);
const COLLAPSE_KEY = "homeDeviceGroupCollapse";

const TILE_ICON_ON: { [cat: string]: string } = {
  light: "iconoir-light-bulb-on",
  "dimmable-light": "iconoir-light-bulb-on",
};

// Compact tier: tap-is-the-whole-story devices render as a one-row plate — the
// tile earns extra rows only for a live control (a lit dimmable's brightness
// slider, the satellite's mic chip). Category-stable so tiles never jump tiers
// (and reshuffle the grid) when toggled; a camera-equipped satellite is media,
// never compact (hasCamView gate in decorateDevice).
const COMPACT_CATEGORIES = new Set([
  "light",
  "door",
  "blinds",
  "dimmable-light",
  "voice-satellite",
]);

// One scan order in every room: act-on-first (lights → blinds → doors), then
// climate, then speakers, with big media (cameras / camera satellites) sinking
// to the bottom of the section. Unknown categories sort between.
const CATEGORY_ORDER: { [cat: string]: number } = {
  light: 0,
  "dimmable-light": 1,
  blinds: 2,
  door: 3,
  "evap-cooler": 4,
  "voice-satellite": 6,
  camera: 8,
};

function tileOrder(device: Device): number {
  const base = CATEGORY_ORDER[device.deviceCategory] ?? 5;
  return hasCamView(device) ? base + 10 : base;
}

/** Stable in-room tile order: category tier first, then name. */
function sortTiles(devices: Device[]): Device[] {
  return devices
    .slice()
    .sort((a, b) => tileOrder(a) - tileOrder(b) || a.name.localeCompare(b.name));
}
const TILE_ICON_OFF: { [cat: string]: string } = {
  light: "iconoir-light-bulb",
  "dimmable-light": "iconoir-light-bulb",
  blinds: "iconoir-windows",
  "evap-cooler": "iconoir-snow-flake",
  camera: "iconoir-video-camera",
  "voice-satellite": "iconoir-sound-high",
};

/**
 * A tile shows a vision-service live view when the node declares a camera-capability
 * `stream` block — a `camera` proper OR a camera-equipped `voice-satellite` (its OV2640
 * on the board's DVP connector). Gate on the block, not the category, so an audio-only
 * satellite stays picture-free and a ribboned one lights up automatically. `camera`
 * stays true even if the block hasn't landed yet (ONVIF/RTSP cams synthesize late).
 */
export function hasCamView(device: Device): boolean {
  return device.deviceCategory === "camera" || !!device.stream?.path;
}

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
    // Number actuator (dimmable brightness): the slider is on the tile only
    // while the light is ON — it's the live "how bright" control. Off, the tile
    // is just the switch (tap restores the last level); setting a level while
    // off lives in the detail sheet.
    else c.control = c.precision || (c.value as number) <= 0 ? "none" : "slider";
  });
  // Satellite tile = the glance + the one immediate control: the mic chip
  // (privacy). Volume / camera flip / eco / battery are occasional or set-once —
  // they live in the detail sheet's Controls section (control: "none" here).
  if (device.deviceCategory === "voice-satellite") {
    channels.forEach((c) => {
      if (c.key === "mic") c.control = "chip";
      else c.control = "none";
    });
  }

  // Cooler: the tile is glanceable, not exhaustive — one hero readout (room temp,
  // with the setpoint as its label) plus the fan/water chips. The outlet-air temp
  // (unit-temp — the air blowing out of the unit) and the target stepper are
  // demoted to the detail overlay, which already carries both.
  if (device.deviceCategory === "evap-cooler") {
    const target = Number((device.value ?? {}).target);
    channels.forEach((c) => {
      if (c.key === "unit-temp" || c.key === "target") c.control = "none";
      if (c.key === "room-temp" && Number.isFinite(target)) c.label = `target ${Math.round(target)}°`;
    });
  }

  // Battery readout only exists when the board actually has a cell: the blob key is
  // absent until the firmware's first report, and -1 means "slot empty". Same
  // presence rule for the camera Flip chip — audio-only satellites never report it.
  device.channels = channels.filter((c) => {
    if (c.key === "battery") return ((device.value ?? {}).battery ?? -1) >= 0;
    if (c.key === "flip") return (device.value ?? {}).flip !== undefined;
    // Eco appears once the firmware reports the key (pre-eco satellites don't).
    if (c.key === "eco") return (device.value ?? {}).eco !== undefined;
    return true;
  });
  device.wide =
    device.deviceCategory === "evap-cooler" || hasCamView(device);
  // One-row plate for tap-is-the-whole-story devices (a camera-equipped
  // satellite is media, never compact).
  device.compact = COMPACT_CATEGORIES.has(device.deviceCategory) && !hasCamView(device);
  // Camera live view comes from the vision-service (annotated MJPEG), never the cam
  // directly nor a relayed blob (§3.2/§6). `who` is filled by the occupancy poller.
  // A camera-equipped satellite gets the identical view (same vision-service worker,
  // keyed by device id) stacked above its normal audio/battery controls.
  device.hasCamView = hasCamView(device);
  if (device.hasCamView) {
    device.streamUrl = visionStreamUrl(device.id);
    // The control-bar :foreach must never see undefined — bindrjs renders the
    // region the instant `ptz` flips true, before the controls fetch lands.
    if (!device.presets) device.presets = [];
    // Privacy fields must be concrete before first render (:class needs ONE real
    // token); the occupancy poll + the toggle keep them fresh afterwards.
    device.privacy = !!device.privacy;
    device.privacyClass = device.privacy ? "cam-priv--on" : "cam-priv--off";
  }
  device.isOn = actuators.some((c) =>
    c.kind === "boolean" ? c.value === true : (c.value as number) > 0,
  );
  device.icon = (device.isOn ? TILE_ICON_ON : TILE_ICON_OFF)[device.deviceCategory]
    ?? TILE_ICON_OFF[device.deviceCategory]
    ?? "iconoir-circle";
  device.status = computeStatus(device, actuators);
  return device;
}

/** The tile body status line, per category. */
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
    case "voice-satellite": {
      // The mic chip shows its own state; the glance is the volume plus the one
      // battery fact that IS immediate — it's running low. Full % lives in the
      // detail sheet.
      const vol = device.channels?.find((c) => c.key === "volume")?.value as number;
      const battery = Number((device.value ?? {}).battery ?? -1);
      const low = battery >= 0 && battery <= 25 ? " · Low battery" : "";
      return `Vol ${Math.round(vol ?? 0)}%${low}`;
    }
    case "evap-cooler": {
      const fan = actuators.find((c) => c.key === "fan")?.value === true;
      const water = actuators.find((c) => c.key === "water")?.value === true;
      if (fan && water) return "Cooling · fan + water";
      if (fan) return "Fan on";
      if (water) return "Water on";
      return "Idle";
    }
    default:
      return "";
  }
}

/** The camera tile's "who is here" headline (§6) — the high-value surface. Names the
 * household members present, counts guests, falls back to a neutral count for unknown
 * people, and "Empty" when no one's there.
 *
 * SMART_FACE_ID honesty: a household member whose identity is only ASSUMED (still person
 * held by position across a track dropout, not a live face read) renders HEDGED ("David?").
 * And a `guest` only counts as a guest when its confidence clears GUEST_CONF_FLOOR — a
 * sub-floor guest is a weak/noisy read, folded into the neutral count instead of asserting
 * "1 guest" (the over-count this whole feature exists to stop). */
const GUEST_CONF_FLOOR = 0.45;

function summariseOccupants(occ: ZoneOccupant[] | undefined): string {
  if (!occ || occ.length === 0) return "Empty";
  const names = occ
    .filter((o) => o.class === "household" && o.name)
    .map((o) => (o.assumed ? `${o.name}?` : (o.name as string)));
  // A guest is only counted as one when it's a confident read; weaker guest reads fold
  // into the neutral bucket rather than over-asserting a distinct visitor.
  const guests = occ.filter((o) => o.class === "guest" && o.confidence >= GUEST_CONF_FLOOR).length;
  const unknown = occ.filter(
    (o) => o.class === "unknown" || (o.class === "guest" && o.confidence < GUEST_CONF_FLOOR),
  ).length;
  const parts: string[] = [];
  if (names.length) parts.push(names.join(", "));
  if (guests) parts.push(`${guests} guest${guests === 1 ? "" : "s"}`);
  if (unknown && !names.length && !guests) parts.push(`${unknown} ${unknown === 1 ? "person" : "people"}`);
  else if (unknown) parts.push(`${unknown} more`);
  return parts.join(" + ") || `${occ.length} present`;
}

/** Camera tile health badge — answers the two questions at a glance: is the camera
 * making frames (blobs), and is the box actually detecting on them? Traffic-light:
 *   green  "live · detecting/ID on" — frames fresh AND a real perception backend
 *   amber  "live · no detection"    — frames fresh but detector is the null stub
 *   amber  "stalled"                — worker present but frames went stale
 *   red    "offline" / "no worker"  — no frames / vision-service has no worker
 * The tooltip carries the raw counters (frames_seen, frame age, backend names). */
function summariseCamHealth(
  st: VisionCameraStatus | undefined,
): { text: string; state: "ok" | "warn" | "down" | "priv"; title: string } {
  if (!st) {
    // Resident-facing word, not infra jargon; the tooltip keeps the real cause.
    return { text: "offline", state: "down", title: "vision-service has no worker for this camera (not on roster / no stream URL)" };
  }
  if (st.privacy) {
    return { text: "privacy", state: "priv", title: "Privacy mode — this camera is not being streamed, recorded or analyzed" };
  }
  const title =
    `frames: ${st.frames_seen} · last frame: ${st.last_frame_age_s ?? "—"}s ago · ` +
    `detector: ${st.detector} · face: ${st.face} · rec: ${st.rec_mode}`;
  const fresh = st.connected && st.last_frame_age_s !== null && st.last_frame_age_s < 5;
  if (!st.connected || st.last_frame_age_s === null) return { text: "offline", state: "down", title };
  if (!fresh) return { text: "stalled", state: "warn", title };
  if (st.detector === "null") return { text: "live · no detection", state: "warn", title };
  return { text: st.face === "null" ? "live · detecting" : "live · ID on", state: "ok", title };
}

// PTZ nudge tuning (CAM_NUDGE_*) lives in camera-ctl.service — shared with the lightbox.

/** Display name for a camera that exists only in the vision roster (static RTSP
 * fleet — no hub device row carrying a user-set name): its zone, capitalized. */
function camDisplayName(status: VisionCameraStatus): string {
  const zone = (status.zone || "").trim();
  if (zone && zone !== "_") return zone.charAt(0).toUpperCase() + zone.slice(1);
  return status.id;
}

/** Persisted collapse state — a Set of group keys the user has collapsed. Survives
 * reloads so a wall-mounted hub keeps the rooms you fold. Falls back to the defaults
 * (cameras collapsed) on first run / unreadable storage. */
function loadCollapse(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return new Set<string>(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set<string>(DEFAULT_COLLAPSED);
}

function saveCollapse(set: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/** Right-aligned header summary: "2 on" for a room, "4 cameras" for the camera group. */
function groupSummary(kind: DeviceGroup["kind"], devices: Device[]): string {
  if (kind === "cameras") {
    return `${devices.length} camera${devices.length === 1 ? "" : "s"}`;
  }
  const on = devices.filter((d) => d.isOn).length;
  return `${on} on`;
}

/** How many light/dimmable tiles in the list are on — gates "Lights off". */
function countLightsOn(devices: Device[]): number {
  return devices.filter(
    (d) => (d.deviceCategory === "light" || d.deviceCategory === "dimmable-light") && d.isOn,
  ).length;
}

/**
 * A room's ambient glance, fused from its sensors: one temp/humidity reading
 * (already formatted by SensorsService — "26 °C"/"40 %" — but parse defensively:
 * a WS race can still hand us the raw "t:h" string) and a motion state — null
 * when the room has no boolean sensor at all, so the header shows nothing
 * rather than a fake "clear".
 */
function zoneEnv(sensors: Sensor[], zone: string): { reading?: string; motion: boolean | null } {
  const inZone = sensors.filter((s) => (s.zone || "").trim() === zone);
  let reading: string | undefined;
  const th = inZone.find((s) => s.type === "value" && s.value != null);
  if (th) {
    const v: any = th.value;
    let t = NaN;
    let h = NaN;
    if (typeof v === "string" && v.includes(":")) {
      [t, h] = v.split(":").map(parseFloat);
    } else if (typeof v === "object") {
      t = parseFloat(v.temperature);
      h = parseFloat(v.humidity);
    }
    if (Number.isFinite(t)) reading = `${t}°${Number.isFinite(h) ? ` · ${h}%` : ""}`;
  }
  const booleans = inZone.filter((s) => s.type === "boolean");
  const motion = booleans.length ? booleans.some((s) => s.value === true) : null;
  return { reading, motion };
}

/**
 * Split the flat device list into the rendered, room-grouped, optionally-filtered
 * groups. The signed-in member's PINNED devices render first; cameras keep their
 * own group; everything else groups by `zone` (registry order first, then any
 * extra zones, then Unassigned). Each room header fuses in its sensors' ambient
 * glance (temp/humidity + motion), and zones that have sensors but no devices
 * still render as rooms (header only). A non-empty filter matches device name or
 * zone and force-expands every surviving group; empty groups drop out.
 */
function buildGroups(
  devices: Device[],
  zoneOrder: string[],
  collapsed: Set<string>,
  filter: string,
  sensors: Sensor[],
  pins: string[],
): DeviceGroup[] {
  const f = filter.trim().toLowerCase();
  const match = (d: Device) =>
    !f || d.name.toLowerCase().includes(f) || (d.zone || "").toLowerCase().includes(f);

  const cams: Device[] = [];
  const byZone = new Map<string, Device[]>();
  for (const d of devices) {
    if (!match(d)) continue;
    if (d.deviceCategory === "camera") {
      cams.push(d);
      continue;
    }
    const zone = d.zone && d.zone.trim() ? d.zone : UNASSIGNED;
    (byZone.get(zone) ?? byZone.set(zone, []).get(zone)!).push(d);
  }

  // Rooms that only have sensors still deserve a header (Outdoor readings).
  const sensorZones = new Set(
    sensors.map((s) => (s.zone || "").trim()).filter((z) => z && (!f || z.toLowerCase().includes(f))),
  );

  // Registry order first, then any zones present on devices/sensors but not in
  // the registry, then the Unassigned bucket — the house's configured order.
  const ordered: string[] = [];
  const wants = (z: string) => byZone.has(z) || sensorZones.has(z);
  for (const z of zoneOrder) if (wants(z) && z !== UNASSIGNED) ordered.push(z);
  for (const z of byZone.keys()) if (!ordered.includes(z) && z !== UNASSIGNED) ordered.push(z);
  for (const z of sensorZones) if (!ordered.includes(z) && z !== UNASSIGNED) ordered.push(z);
  if (byZone.has(UNASSIGNED)) ordered.push(UNASSIGNED);

  const groups: DeviceGroup[] = [];

  // Pinned strip — the member's own shortcuts, in the order they pinned them.
  const pinned = pins
    .map((id) => devices.find((d) => d.id === id))
    .filter((d): d is Device => !!d && match(d));
  if (pinned.length) {
    groups.push({
      key: PINNED,
      label: "Pinned",
      kind: "pinned",
      devices: pinned,
      summary: groupSummary("pinned", pinned),
      collapsed: !f && collapsed.has(PINNED),
      lightsOn: countLightsOn(pinned),
    });
  }

  for (const zone of ordered) {
    // Same scan order in every room (lights → blinds → doors → climate →
    // speakers → cameras) — findability comes from the pattern repeating.
    const list = sortTiles(byZone.get(zone) ?? []);
    const env = zone === UNASSIGNED ? { reading: undefined, motion: null } : zoneEnv(sensors, zone);
    groups.push({
      key: zone,
      label: zone === UNASSIGNED ? "Unassigned" : zone,
      kind: "zone",
      devices: list,
      summary: list.length ? groupSummary("zone", list) : "",
      collapsed: !f && collapsed.has(zone),
      envReading: env.reading,
      envMotion: env.motion,
      lightsOn: countLightsOn(list),
    });
  }

  if (cams.length) {
    groups.push({
      key: CAMERAS,
      label: "Cameras",
      kind: "cameras",
      devices: sortTiles(cams),
      summary: groupSummary("cameras", cams),
      collapsed: !f && collapsed.has(CAMERAS),
      lightsOn: 0,
    });
  }
  return groups;
}

class DevicesTabClass extends Component<DevicesTabState> {
  devicesService: DevicesServiceClass;
  private unsubscribeDeclare?: () => void;
  private unsubscribeUpdate?: () => void;
  private unsubscribeOccupancy?: () => void;
  private unsubscribeCameras?: () => void;
  private unsubscribeDevices?: () => void;
  private unsubscribeSensors?: () => void;
  private unsubscribePins?: () => void;
  private unsubscribeSync?: () => void;
  private zoneOccupants: Record<string, ZoneOccupant[]> = {};
  private camStatus: Record<string, VisionCameraStatus> = {};
  private collapsed = loadCollapse();
  private filterText = "";
  // Latest per-camera worker statuses (vision poll) — kept so vision-only tiles can
  // be re-synthesized after a store sync replaces bind.devices.
  private lastCameras: VisionCameraStatus[] = [];
  // Per-camera control summary (capabilities/presets/imaging) via the hub proxy —
  // fetched once per camera when the poll first shows it is ONVIF-capable.
  private camControls: Record<string, CameraControls> = {};
  private camCtlRequested = new Set<string>();

  constructor(devicesService: DevicesServiceClass) {
    super();
    this.devicesService = devicesService;
    const devices = store.get("devices");
    devices.forEach((device) => decorateDevice(device));
  }

  /** Rebuild the room-grouped view from the flat `devices` array. Cheap + derived, so
   * we recompute (and reassign, to re-render the gated sections) on any structural
   * change: store sync, declare, zone edit, collapse toggle, filter, sensor tick, pins. */
  private groups(): DeviceGroup[] {
    return buildGroups(
      this.bind.devices || [],
      store.get("zones") || [],
      this.collapsed,
      this.filterText,
      store.get("sensors") || [],
      getPins(),
    );
  }

  mount() {
    this.createBind({
      id: "devices",
      template,
      bind: {
        devices: store.get("devices").map(decorateDevice),
        groups: buildGroups(
          store.get("devices").map(decorateDevice),
          store.get("zones") || [],
          this.collapsed,
          "",
          store.get("sensors") || [],
          getPins(),
        ),
        hasDevices: (store.get("devices") || []).length > 0,
        // Skeleton plates until the first full resync settles (sync:done) — a
        // fresh boot has an empty store and we must not flash "no devices".
        loading: (store.get("devices") || []).length === 0,
        searchOpen: false,

        // Room-rail tap: make sure the section is expanded, then bring it up.
        jumpTo: (key: string) => {
          if (this.collapsed.has(key)) {
            this.collapsed.delete(key);
            saveCollapse(this.collapsed);
            this.bind.groups = this.groups();
          }
          requestAnimationFrame(() => {
            document.getElementById(`zsec-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        },

        // The rail is the primary finder; the text filter hides behind this.
        toggleSearch: () => {
          const open = !this.bind.searchOpen;
          this.bind.searchOpen = open;
          if (!open && this.filterText) {
            this.filterText = "";
            this.bind.groups = this.groups();
          }
          if (open) {
            requestAnimationFrame(() =>
              (document.querySelector(".device-filter-input") as HTMLInputElement | null)?.focus(),
            );
          }
        },

        // Header action: every light in the room, off — one tap on the way out.
        onLightsOff: (event: Event, key: string) => {
          event.stopPropagation();
          const group = (this.bind.groups || []).find((g) => g.key === key);
          if (!group) return;
          for (const device of group.devices) {
            if (device.deviceCategory !== "light" && device.deviceCategory !== "dimmable-light") continue;
            const primary = (device.channels || []).find((c) => c.role === "actuator");
            if (!primary || !device.isOn) continue;
            this.writeChannel(device, primary, primary.kind === "boolean" ? false : 0);
          }
          this.bind.groups = this.groups();
        },

        // Collapse/expand a zone (or the camera group) — persisted across reloads.
        toggleGroup: (key: string) => {
          if (this.collapsed.has(key)) this.collapsed.delete(key);
          else this.collapsed.add(key);
          saveCollapse(this.collapsed);
          this.bind.groups = this.groups();
        },

        // Uncontrolled filter input (no :value binding) so typing never loses the
        // caret to a re-render; just read it and rebuild the groups.
        onFilter: (event: Event) => {
          this.filterText = (event.target as HTMLInputElement).value || "";
          this.bind.groups = this.groups();
        },

        // The whole tile is the switch for single-actuator devices.
        onTileClick: (device: Device) => {
          const cat = device.deviceCategory;
          if (cat === "camera") {
            // Watching is the primary action — fullscreen live lightbox. Config
            // moved behind the ⋯ on the cam label (onCamEdit).
            openCameraLive({ target: this.tileEl(device.id) }, device);
            return;
          }
          if (cat === "blinds") {
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

        // Camera banner tap = the fullscreen live lightbox. Cameras also get here
        // via the whole-tile tap (propagation is stopped so it opens once); for a
        // camera-equipped satellite the banner is the ONLY expand path — its tile
        // body is the audio controls, so the tile tap can't mean "watch".
        onCamExpand: (event: Event, device: Device) => {
          event.stopPropagation();
          openCameraLive({ target: this.tileEl(device.id) }, device);
        },

        // Camera ⋯ — the config path (tap on the tile itself = live lightbox).
        // Vision-roster cams have no hub device row, so the hub edit overlay
        // doesn't apply; they get the camera tune overlay (views + image).
        onCamEdit: (event: any, device: Device) => {
          event.stopPropagation();
          if (device.visionOnly) this.openCamTune(device);
          else this.devicesService.editClick({ target: this.tileEl(device.id) }, device);
        },

        // ── camera tile controls (CAMERA_ONVIF_CONTROL_PLAN §2/§4) ────────────
        // One tap = one short auto-stopped nudge; the arrows can never leave the
        // camera moving. Fire-and-forget with a toast on failure — the live view
        // itself is the feedback.
        onCamNudge: (event: Event, deviceId: string, dx: number, dy: number) => {
          event.stopPropagation();
          cameraPtzMove(deviceId, dx * CAM_NUDGE_SPEED, dy * CAM_NUDGE_SPEED, CAM_NUDGE_MS)
            .then((ok) => {
              if (!ok) showToaster({ message: "Couldn't move the camera", from: "bottom", timer: 2000 });
            });
        },

        onCamGoto: (event: Event, deviceId: string, token: string) => {
          event.stopPropagation();
          cameraPtzGoto(deviceId, token).then((ok) => {
            if (!ok) showToaster({ message: "Couldn't recall that view", from: "bottom", timer: 2000 });
          });
        },

        onCamSettings: (event: any, deviceId: string) => {
          event.stopPropagation();
          const device = this.findCamera(deviceId);
          if (device) this.openCamTune(device);
        },

        // Privacy switch — the "stop watching this camera" control (label-row shield).
        onCamPrivacy: (event: Event, device: Device) => {
          event.stopPropagation();
          this.toggleCamPrivacy(device);
        },
      },
    });

    this.unsubscribeDevices = store.subscribe("devices", (devices) => {
      this.bind.devices = devices.map(decorateDevice);
      // A store sync replaces the array — re-merge the vision-only camera tiles.
      this.syncVisionTiles(this.lastCameras);
      this.bind.hasDevices = this.bind.devices.length > 0;
      if (this.bind.hasDevices) this.bind.loading = false;
      this.bind.groups = this.groups();
      this.applyOccupancy();
    });

    // Room headers carry the zone's ambient glance — refresh them on sensor ticks.
    this.unsubscribeSensors = store.subscribe("sensors", () => {
      this.bind.groups = this.groups();
    });

    // The member's pinned strip.
    this.unsubscribePins = bus.on("pins:changed", () => {
      this.bind.groups = this.groups();
    });

    // First full resync settled (either way) → leave the skeleton state. On
    // failure the empty state + offline banner tell the real story.
    this.unsubscribeSync = bus.on("sync:done", () => {
      this.bind.loading = false;
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
    // Per-camera worker health (same poll) — drives the tile's stream/detection
    // badge, synthesizes tiles for vision-roster-only cameras (static RTSP fleet),
    // and lazily fetches each ONVIF camera's control summary (D-pad/presets/image).
    this.unsubscribeCameras = bus.on("vision:cameras", (cameras) => {
      this.camStatus = {};
      (cameras || []).forEach((c) => (this.camStatus[c.id] = c));
      this.syncVisionTiles(cameras || []);
      this.fetchCamControls(cameras || []);
      this.applyOccupancy();
    });
    startVisionOccupancy();
  }

  unmount() {
    this.unsubscribeDevices?.();
    this.unsubscribeSensors?.();
    this.unsubscribePins?.();
    this.unsubscribeSync?.();
    this.unsubscribeDeclare?.();
    this.unsubscribeUpdate?.();
    this.unsubscribeOccupancy?.();
    this.unsubscribeCameras?.();
    stopVisionOccupancy();
  }

  /** Recompute each group's header summary in place (leaf mutation → just the header
   * text repaints) so "2 on" tracks live toggles without rebuilding/re-rendering every
   * tile. group.devices share refs with bind.devices, so isOn is already fresh. */
  private refreshSummaries() {
    (this.bind.groups || []).forEach((g) => {
      g.summary = g.kind === "cameras"
        ? `${g.devices.length} camera${g.devices.length === 1 ? "" : "s"}`
        : `${g.devices.filter((d) => d.isOn).length} on`;
      // Leaf mutation: the header lamp / "Lights off" affordance track via
      // :class bindings (class bindings re-evaluate on leaf ticks; :if doesn't).
      g.lightsOn = countLightsOn(g.devices);
    });
  }

  /** Reconcile tiles for cameras that live only in the vision roster (static RTSP
   * fleet — they never declare to the hub): push a synthetic camera Device into the
   * BOUND devices array (the same path a hub `device:declare` takes — items must
   * enter bindrjs through a bound array or their template region never evaluates),
   * drop tiles whose camera vanished, keep zones fresh. Rebuilds the groups only on
   * a structural change (the poll runs every 15s). */
  private syncVisionTiles(cameras: VisionCameraStatus[]) {
    this.lastCameras = cameras;
    const current: Device[] = this.bind.devices || [];
    const wanted = new Map(cameras.map((c) => [c.id, c]));
    let changed = false;

    // Keep everything except synthetic tiles whose camera left the vision roster.
    const next = current.filter((d) => {
      const keep = !d.visionOnly || wanted.has(d.id);
      if (!keep) changed = true;
      return keep;
    });
    for (const status of cameras) {
      const existing = next.find((d) => d.id === status.id);
      if (existing) {
        if (existing.visionOnly && existing.zone !== status.zone) {
          existing.zone = status.zone;
          existing.name = camDisplayName(status);
          changed = true;
        }
        continue; // hub roster wins on id clash
      }
      next.push(decorateDevice({
        id: status.id,
        deviceCategory: "camera",
        name: camDisplayName(status),
        zone: status.zone,
        manual: false,
        value: null,
        type: "boolean",
        operationalRanges: [],
        visionOnly: true,
      } as unknown as Device));
      changed = true;
    }
    if (changed) {
      // Whole-array reassignment (never push into the bound array) — the only
      // add-an-item path bindrjs re-renders reliably (DESIGN.md §7).
      this.bind.devices = next;
      this.bind.groups = this.groups();
    }
  }

  /** Fetch each ONVIF-capable camera's control summary once (hub /camera/:id proxy):
   * which controls to draw + its saved views + imaging values. Retries next poll on
   * failure (camera may have been rebooting). */
  private fetchCamControls(cameras: VisionCameraStatus[]) {
    for (const status of cameras) {
      if (!status.onvif || this.camCtlRequested.has(status.id)) continue;
      this.camCtlRequested.add(status.id);
      fetchCameraControls(status.id).then((ctl) => {
        if (ctl) {
          this.camControls[status.id] = ctl;
          this.applyOccupancy();
        } else {
          this.camCtlRequested.delete(status.id);
        }
      });
    }
  }

  /** Every tile with a live view — `camera` nodes (hub-declared + vision-only) plus
   * camera-equipped satellites — so occupancy/health enrichment reaches them all.
   * Satellites carry no ONVIF caps, so the PTZ/imaging fields stay false for them. */
  private cameraTiles(): Device[] {
    return (this.bind.devices || []).filter(hasCamView);
  }

  private findCamera(deviceId: string): Device | undefined {
    return this.cameraTiles().find((d) => d.id === deviceId);
  }

  /** Open the camera tune overlay (saved views + image). Fetches the control summary
   * on demand if the lazy poll hasn't landed yet. */
  private async openCamTune(device: Device) {
    let ctl = this.camControls[device.id];
    if (!ctl) {
      ctl = (await fetchCameraControls(device.id)) || undefined as any;
      if (ctl) this.camControls[device.id] = ctl;
    }
    if (!ctl || !ctl.onvif) {
      showToaster({ message: "This camera has no remote controls", from: "bottom", timer: 2000 });
      return;
    }
    openCameraControls({ target: this.tileEl(device.id) }, device, ctl, (camId, fresh) => {
      this.camControls[camId] = fresh;
      this.applyOccupancy();
    });
  }

  /** Push the latest per-zone occupancy + worker health + ONVIF control state onto
   * each camera tile (hub-declared and vision-only alike). */
  private applyOccupancy() {
    this.cameraTiles().forEach((device) => {
      device.who = summariseOccupants(this.zoneOccupants[device.zone || "_"]);
      const health = summariseCamHealth(this.camStatus[device.id]);
      device.camHealth = health.text;
      // Single token — bindrjs :class add/removes ONE class (multi-word throws in
      // DOMTokenList.add and aborts the whole rebind pass, blanking the tile).
      device.camHealthClass = `cam-health--${health.state}`;
      device.camHealthTitle = health.title;
      // Which controls the tile draws (fixed cams: no D-pad; ESP32-CAMs: nothing).
      // Order matters: presets BEFORE the ptz flag — flipping `ptz` re-renders the
      // control bar immediately and its :foreach must already have a real array.
      const caps = this.camControls[device.id]?.onvif ?? this.camStatus[device.id]?.onvif ?? null;
      device.presets = this.camControls[device.id]?.presets || device.presets || [];
      device.onvifCaps = caps;
      device.ptz = !!caps?.ptz;
      device.imagingCaps = !!caps?.imaging;
      // Only the IP-cam fleet archives footage → only they get a Recordings entry point.
      device.records = !!this.camStatus[device.id]?.records;
      // Privacy mode: gates the tile's stream <img> off and lights the toggle.
      device.privacy = !!this.camStatus[device.id]?.privacy;
      device.privacyClass = device.privacy ? "cam-priv--on" : "cam-priv--off";
    });
  }

  /** Flip a camera's privacy mode (stop/resume streaming + recording + perception).
   * Optimistic — the tile flips instantly; reverts with a toast if the hub/vision
   * call fails. The worker-status poll keeps it honest afterwards. */
  private toggleCamPrivacy(device: Device) {
    const next = !device.privacy;
    const paint = (on: boolean) => {
      device.privacy = on;
      device.privacyClass = on ? "cam-priv--on" : "cam-priv--off";
      if (this.camStatus[device.id]) this.camStatus[device.id].privacy = on;
      this.applyOccupancy();
    };
    paint(next);
    cameraSetPrivacy(device.id, next).then((result) => {
      if (result) return;
      paint(!next);
      showToaster({
        message: next ? "Couldn't enable privacy mode" : "Couldn't resume the camera",
        from: "bottom",
        timer: 2500,
      });
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
    this.refreshSummaries();

    setServerChannel(device.id, channel.key, value)
      .then(({ success }) => {
        if (!success) this.revertChannel(device, previous, "Something went wrong");
      })
      .catch(() => this.revertChannel(device, previous, "Couldn't connect to device"));
  }

  private revertChannel(device: Device, previous: any, message: string) {
    device.value = previous;
    decorateDevice(device);
    this.refreshSummaries();
    showToaster({ message, from: "bottom", timer: 2000 });
  }

  // Anchor element used to position the detail overlay for tiles without a
  // dedicated edit affordance (blinds / camera open it on tap). Tiles now live inside
  // collapsible zone sections (DOM order ≠ flat `devices` order), so we locate by the
  // tile's own id rather than indexing the flat array.
  private tileEl(deviceId: string): HTMLElement {
    return (document.getElementById(`tile-${deviceId}`) as HTMLElement)
      || (document.getElementById("devices") as HTMLElement);
  }

  private onDeviceDeclare(declaredDevice: Device) {
    if (!this.bind.devices) this.bind.devices = [];
    const device = this.bind.devices.find((d) => d.id === declaredDevice.id);
    if (!device) {
      this.bind.devices.push(decorateDevice(declaredDevice));
      this.bind.hasDevices = true;
      this.bind.groups = this.groups(); // structural — a new tile/zone may appear
    }
    // A newly-declared camera picks up its live view (visionStreamUrl in decorate)
    // + its "who" headline (next occupancy poll) automatically — no per-cam subscribe.
  }

  private onDeviceUpdate(updatedDevice: Device) {
    const device = this.bind.devices.find((d) => d.id === updatedDevice.id);
    if (device) {
      const zoneChanged = updatedDevice.zone != null && updatedDevice.zone !== device.zone;
      device.value = updatedDevice.value;
      device.manual = updatedDevice.manual;
      device.name = updatedDevice.name;
      device.zone = updatedDevice.zone ?? device.zone;
      device.operationalRanges = updatedDevice.operationalRanges;
      decorateDevice(device);
      // A zone/name change reshuffles which section the tile belongs to → rebuild;
      // otherwise the in-place leaf patch above already repainted the tile, so just
      // refresh the header counts.
      if (zoneChanged) this.bind.groups = this.groups();
      else this.refreshSummaries();
      if (device.deviceCategory === "camera") this.applyOccupancy();
    }
  }
}

export const DevicesTab = new DevicesTabClass(DevicesService);
