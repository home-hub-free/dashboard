import { Device } from "../home/devices/devices.model";
import { Sensor } from "../home/sensors/sensors.model";

export type AutoEffect = {
  set: {
    id: string;
    // For multi value devices
    valueToSet?: string;
    value: any;
  };
  when: {
    id: string;
    type: string;
    is: any;
  };
  sentence?: string
};

// Normalized effect contract (mirrors server src/db/effects-normalize.ts).
// As of Stage 4b this is the stored shape end-to-end: served by
// GET /get-effects-normalized and posted as-is by the write path
// (buildNormalizedEffect → /set-effect).
export type EffectOp = "eq" | "gt" | "lt";

export type Condition =
  | { source: "sensor"; nodeId: string; channel: string; op: EffectOp; value: boolean | number }
  | { source: "time"; at: string };

export type NormalizedEffect = {
  when: Condition;
  set: { nodeId: string; channel: string; value: boolean | number };
  enabled: boolean;
  sentence?: string;
};

export type NewEffect = {
  device: Device;
  // For multi value devices
  valueToSet?: any;
  setTo: any;
  trigger: 'time' | 'sensor';
  sensor?: Sensor;
  sensorState?: boolean | string;
  valueToCheck?: string; // For multi value type sensors
  comparassion?: 'higher-than' | 'lower-than' // For value based sensors we have this comparassion prop
  time?: Date
}