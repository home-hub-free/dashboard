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
  battery: "Battery",
  value: "Value",
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
  battery: "iconoir-battery-50", // level-accurate icon assigned in decorateDevice
  value: "iconoir-circle",
};

function toBoolean(v: any): boolean {
  return v === true || v === 1 || v === "true" || v === "1";
}
function toNumber(v: any): number {
  const n = typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Read one channel's live value out of a device's legacy value blob. */
function readChannelValue(category: string | undefined, spec: ChannelSpec, value: any): boolean | number {
  let raw: any;
  if (category === "evap-cooler" || category === "voice-satellite") {
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
  return String(n);
}

/** Project a device into its live, display-ready channels. Camera (and any
 * unknown category) yields []. */
export function deviceChannels(device: Device): Channel[] {
  const specs = channelSchema(device.deviceCategory);
  if (!specs) return [];
  return specs.map((spec) => {
    const value = readChannelValue(device.deviceCategory, spec, device.value);
    return {
      ...spec,
      deviceId: device.id,
      value,
      label: LABELS[spec.key] ?? spec.key,
      display: formatValue(spec, value),
      icon: ICONS[spec.key] ?? "iconoir-circle",
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
  if (category === "evap-cooler" || category === "voice-satellite") {
    return { ...(value ?? {}), [key]: next };
  }
  return next;
}
