// Client-side channel projection (Stage 4c, see ../../../../docs/DATA_CONTRACTS.md
// in the server repo). Mirrors the server's channelSchema/deviceToChannels so the
// dashboard can render every device generically from its channels — boolean
// actuator → toggle, number actuator → slider, number setting → stepper, sensor →
// readout — instead of hard-coding a layout per category. The legacy fleet doesn't
// self-describe channels, so we derive them here from category + value (the same
// way the server's projection does).

import { Device } from "./devices.model";

export type ChannelRole = "actuator" | "sensor" | "setting";
export type ChannelKind = "boolean" | "number" | "enum";

export interface ChannelSpec {
  key: string;
  role: ChannelRole;
  kind: ChannelKind;
  unit?: string;
  range?: { min: number; max: number; step?: number };
  writable: boolean;
  /** Device owns this value (blinds position) — controlled via the detail overlay. */
  precision?: boolean;
  /** Declared display label / iconoir class (a self-describing device may ship them). */
  label?: string;
  icon?: string;
}

/** A channel spec with its live value and pre-computed display fields the template
 * renders directly (so the HTML stays logic-free). */
export interface Channel extends ChannelSpec {
  /** Owning device id — carried on the channel so template handlers can pass it
   * without referencing the loop's `device` var (bindrjs won't substitute a loop
   * var followed by a comma; property access like `channel.deviceId` is safe). */
  deviceId: string;
  value: boolean | number;
  /** Human label, e.g. "Fan", "Brightness", "Room". */
  label: string;
  /** Formatted reading for readouts/steppers, e.g. "23.5°", "80%". */
  display: string;
  /** iconoir class for the channel's chip/readout. */
  icon: string;
  min: number;
  max: number;
  step: number;
  /** Which widget renders this channel (decided per device in decorateDevice, so
   * the template just switches on it): chip toggle, slider, stepper, sensor
   * readout, or none (handled by the whole-tile tap / tile status). */
  control: "chip" | "slider" | "stepper" | "readout" | "none";
}

const PCT = { min: 0, max: 100, step: 1 };

/** The static channel schema for a device category — kept in lockstep with the
 * server's channels.ts. Returns null for unknown categories. */
export function channelSchema(category: string | undefined): ChannelSpec[] | null {
  switch (category) {
    case "light":
    case "door":
      return [{ key: "power", role: "actuator", kind: "boolean", writable: true }];
    case "dimmable-light":
      return [{ key: "brightness", role: "actuator", kind: "number", unit: "%", range: PCT, writable: true }];
    case "blinds":
      return [{ key: "position", role: "actuator", kind: "number", unit: "%", range: PCT, writable: true, precision: true }];
    case "camera":
      return [];
    // PIR + relay combo board (server channels.ts has had this since Stage 4; the
    // dashboard never did, so the tile rendered dead — scale scan 2026-10-17).
    case "presence-relay":
      return [
        { key: "presence", role: "sensor", kind: "boolean", writable: false },
        { key: "relay", role: "actuator", kind: "boolean", writable: true },
      ];
    case "evap-cooler":
      return [
        { key: "fan", role: "actuator", kind: "boolean", writable: true },
        { key: "water", role: "actuator", kind: "boolean", writable: true },
        { key: "target", role: "setting", kind: "number", unit: "C", range: { min: 16, max: 30, step: 1 }, writable: true },
        { key: "room-temp", role: "sensor", kind: "number", unit: "C", writable: false },
        { key: "unit-temp", role: "sensor", kind: "number", unit: "C", writable: false },
      ];
    // Aura's room speaker/mic — both `setting`s (never latch the manual lock), the
    // device owns the values (NVS-persisted; keep in lockstep with server channels.ts).
    case "voice-satellite":
      return [
        { key: "volume", role: "setting", kind: "number", unit: "%", range: PCT, writable: true, precision: true },
        { key: "mic", role: "setting", kind: "boolean", writable: true, precision: true },
        // Camera 180° rotation — the board mounts its DVP connector opposite the
        // ESP32-CAM's, so a naturally-ribboned module films upside down. Only
        // camera-equipped units report the key; decorateDevice drops the chip when
        // the value blob doesn't carry it (audio-only satellites).
        { key: "flip", role: "setting", kind: "boolean", writable: true, precision: true },
        // Presence power-save: with the zone's presence sensors reporting it empty
        // (hub-side grace-debounced), the satellite sheds camera/mic/WiFi/CPU draw.
        // This is the enable switch; the hub pushes live occupancy separately.
        { key: "eco", role: "setting", kind: "boolean", writable: true, precision: true },
        // Master sleep-sound toggle (docs/plans/SATELLITE_SLEEP_SOUNDS.md). `setting`,
        // not `actuator`, on purpose (R2): an actuator-role dashboard write latches the
        // `manual` lock (device-write-policy.ts on the hub), which would freeze the
        // node's OWN noise automations — an effect arming this toggle would immediately
        // disable itself. The layer mix (which layers are on, at what level) is
        // deliberately NOT a channel (R3) — it rides its own curation route,
        // POST /device-noise-mix, the same family as /device-blinds-configure.
        { key: "noise", role: "setting", kind: "boolean", writable: true, precision: true },
        // Battery % self-reported by the board (VBAT divider). No range: -1 means
        // "no battery plugged" — decorateDevice drops the readout entirely then.
        { key: "battery", role: "sensor", kind: "number", unit: "%", writable: false },
      ];
    default:
      return null;
  }
}

const LABELS: { [key: string]: string } = {
  power: "Power",
  brightness: "Brightness",
  position: "Position",
  fan: "Fan",
  water: "Water",
  target: "Target",
  "room-temp": "Room",
  "unit-temp": "Out air", // the probe sits at the unit's outlet — supply air, NOT outdoor temp
  volume: "Volume",
  mic: "Mic",
  flip: "Flip",
  eco: "Eco",
  noise: "Sleep sounds",
  battery: "Battery",
  presence: "Presence",
  relay: "Relay",
  value: "Value",
};

/** Display labels for the firmware's fixed v1 layer roster (devices/voice-satellite/
 * src/noise.cpp — keep the two in lockstep). An id the dashboard doesn't recognize
 * (a future v2 pack layer) falls back to a title-cased raw id in buildNoiseRows
 * rather than disappearing from the sheet. */
export const NOISE_LAYER_LABELS: Record<string, string> = {
  white: "White",
  pink: "Pink",
  brown: "Brown",
  rain: "Rain",
  fan: "Fan",
  ocean: "Ocean",
};

const ICONS: { [key: string]: string } = {
  power: "iconoir-light-bulb-on",
  brightness: "iconoir-sun-light",
  position: "iconoir-windows",
  fan: "iconoir-wind",
  water: "iconoir-droplet",
  target: "iconoir-home-temperature-in",
  "room-temp": "iconoir-temperature-high",
  "unit-temp": "iconoir-air-conditioner", // air blowing out of the unit (outlet), not an outdoor reading
  volume: "iconoir-sound-high",
  mic: "iconoir-mic",
  flip: "iconoir-flip",
  eco: "iconoir-leaf",
  battery: "iconoir-battery-50", // level-accurate icon assigned in decorateDevice
  presence: "iconoir-running",
  relay: "iconoir-switch-on",
  value: "iconoir-circle",
};

function toBoolean(v: any): boolean {
  return v === true || v === 1 || v === "true" || v === "1";
}
function toNumber(v: any): number {
  const n = typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** A plain `{...}` value blob (not null, not an array). */
export function isPlainObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** The value blob is keyed per channel: a known blob category OR any device whose
 * live value is an object (a custom-built multi-channel device). Mirrors the hub's
 * `isObjectBlobValue` so optimistic writes fold exactly like the server does. */
export function isObjectBlob(category: string | undefined, value: any): boolean {
  return (
    category === "evap-cooler" || category === "voice-satellite" || category === "presence-relay" || isPlainObject(value)
  );
}

/** "soil-moisture" → "Soil Moisture" — the label for a channel key no table knows. */
export function titleCaseKey(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Normalize a hub-declared channel spec (a custom device's own `channels[]`,
 * forwarded verbatim by the hub) into the shape the tile renders from. Tolerates a
 * minimal declaration: `{key}` alone becomes a boolean/number actuator by the
 * live value's type; `writable:false` or `role:"sensor"` makes it a readout. */
function normalizeSpec(raw: any, value: any): ChannelSpec | null {
  if (!raw || typeof raw.key !== "string" || !raw.key) return null;
  const live = isPlainObject(value) ? value[raw.key] : value;
  const kind: ChannelKind =
    raw.kind === "boolean" || raw.kind === "number" || raw.kind === "enum"
      ? raw.kind
      : typeof live === "boolean"
        ? "boolean"
        : "number";
  const writable = raw.writable !== undefined ? !!raw.writable : raw.role !== "sensor";
  const role: ChannelRole =
    raw.role === "actuator" || raw.role === "sensor" || raw.role === "setting" ? raw.role : writable ? "actuator" : "sensor";
  return {
    key: raw.key,
    role,
    kind,
    writable,
    ...(raw.unit ? { unit: String(raw.unit) } : {}),
    ...(raw.range && Number.isFinite(Number(raw.range.min)) && Number.isFinite(Number(raw.range.max))
      ? { range: { min: Number(raw.range.min), max: Number(raw.range.max), step: Number(raw.range.step) || 1 } }
      : {}),
    ...(raw.options ? { options: raw.options } : {}),
    ...(raw.precision ? { precision: true } : {}),
    ...(raw.label ? { label: String(raw.label) } : {}),
    ...(raw.icon ? { icon: String(raw.icon) } : {}),
  };
}

/** Last resort for a device with no schema anywhere: read the channels off the
 * value's shape. A scalar is one switch/level; a blob is one channel per scalar
 * key — booleans as switches, numbers as readouts (we can't know a number is a
 * setpoint without the device saying so). */
function inferSpecs(value: any): ChannelSpec[] {
  if (isPlainObject(value)) {
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
      .map(([key, v]) =>
        typeof v === "boolean"
          ? { key, role: "actuator" as const, kind: "boolean" as const, writable: true }
          : { key, role: "sensor" as const, kind: "number" as const, writable: false },
      );
  }
  if (typeof value === "boolean") return [{ key: "value", role: "actuator", kind: "boolean", writable: true }];
  return [{ key: "value", role: "actuator", kind: "number", range: PCT, writable: true }];
}

/**
 * The effective channel specs for a device, in priority order:
 *  1. the device's OWN declared schema (hub `channelAware` + `channels[]`) — a
 *     custom build describes itself once in firmware and the tile just works;
 *  2. the dashboard's hard-coded schema for a known category (keeps every tuned
 *     behaviour for the existing fleet);
 *  3. the hub-synthesized `channels[]` it forwards for the category, if any;
 *  4. channels inferred from the value's shape.
 * Never returns null — camera stays [] by schema.
 */
export function specsFor(device: Device): ChannelSpec[] {
  const declared = Array.isArray(device.channels) ? device.channels : [];
  const normalizedDeclared = declared.map((c) => normalizeSpec(c, device.value)).filter((c): c is ChannelSpec => !!c);
  if (device.channelAware && normalizedDeclared.length) return normalizedDeclared;
  const known = channelSchema(device.deviceCategory);
  if (known) return known;
  if (normalizedDeclared.length) return normalizedDeclared;
  return inferSpecs(device.value);
}

/** Whether the dashboard has a tuned, hard-coded layout for this category. */
export function isKnownCategory(category: string | undefined): boolean {
  return channelSchema(category) !== null;
}

/** Read one channel's live value out of a device's legacy value blob. */
function readChannelValue(category: string | undefined, spec: ChannelSpec, value: any): boolean | number {
  let raw: any;
  if (isObjectBlob(category, value)) {
    raw = (value ?? {})[spec.key];
  } else {
    raw = value;
  }
  return spec.kind === "boolean" ? toBoolean(raw) : toNumber(raw);
}

/** Format a channel value for display (units, rounding). */
function formatValue(spec: ChannelSpec, value: boolean | number): string {
  if (spec.kind === "boolean") return value ? "On" : "Off";
  const n = value as number;
  if (spec.unit === "C") return `${n.toFixed(1)}°`;
  if (spec.unit === "%") return `${Math.round(n)}%`;
  const rounded = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return spec.unit ? `${rounded} ${spec.unit}` : rounded;
}

/** Project a device into its live, display-ready channels. Camera (and any
 * unknown category) yields []. */
export function deviceChannels(device: Device): Channel[] {
  const specs = specsFor(device);
  return specs.map((spec) => {
    const value = readChannelValue(device.deviceCategory, spec, device.value);
    return {
      ...spec,
      deviceId: device.id,
      value,
      label: spec.label ?? LABELS[spec.key] ?? titleCaseKey(spec.key),
      display: formatValue(spec, value),
      icon: spec.icon ?? ICONS[spec.key] ?? (spec.role === "sensor" ? "iconoir-dashboard-speed" : "iconoir-switch-on"),
      min: spec.range?.min ?? 0,
      max: spec.range?.max ?? 100,
      step: spec.range?.step ?? 1,
      control: "none", // assigned per-device in decorateDevice
    };
  });
}

/** Write a channel value back into the device's legacy value blob, returning the
 * new blob (mirrors the server's withChannelValue). Used for optimistic UI. */
export function withChannelValue(
  category: string | undefined,
  value: any,
  key: string,
  next: boolean | number,
): any {
  // Object-blob categories merge into the blob (mirrors the server's
  // isObjectBlobCategory) — replacing the whole value with the scalar briefly
  // wiped the satellite's sibling channels (mic/battery) until the WS echo.
  if (isObjectBlob(category, value)) {
    return { ...(value ?? {}), [key]: next };
  }
  return next;
}
