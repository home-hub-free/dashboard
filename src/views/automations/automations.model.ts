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

// Dynamic effect contract (mirrors server src/automation/effect.model.ts). As of
// EFFECTS_DYNAMIC Stage 4b this is the shape the dashboard reads (GET /get-effects-dynamic)
// and posts (POST /set-effect): one master trigger + an ordered list of arms (first arm whose
// conditions all hold wins). Single-arm rules are today's flat case; multi-arm rules (e.g.
// authored by the agent/Discovery) were invisible while the dashboard spoke the flat shape.
export type SetAction = { nodeId: string; channel: string; value: boolean | number };

export type Trigger =
  | { source: "sensor"; nodeId: string; channel: string }
  | { source: "time"; at: string };

export type ArmCondition =
  | { kind: "time"; op: "before" | "after" | "between"; from: string; to?: string }
  | { kind: "dow"; days: number[] }
  | { kind: "sensor"; nodeId: string; channel: string; op: EffectOp; value: boolean | number }
  | { kind: "state"; nodeId: string; channel: string; op: EffectOp; value: boolean | number };

export type Arm = { when: ArmCondition[]; set: SetAction };

export type Effect = {
  // Stable row id — present when loaded from /get-effects-summaries (the management
  // view), enabling per-rule disable/delete. Absent on the id-less runtime view.
  id?: number;
  trigger: Trigger;
  arms: Arm[];
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

// ── Multi-arm authoring (EFFECTS_DYNAMIC §9 / DISCOVERY D4) ──────────────────────────────
// The agent and Discovery already create context-conditioned multi-arm rules; this is the
// hand-authoring counterpart. A rule = one master trigger + an ordered list of arms (first
// arm whose guards ALL hold wins; an arm with no guard is the else/default). The UI composes
// one arm at a time into `arms`, mirroring the dynamic `Effect` contract above. v1 supports
// the time-of-day / day-type guards Discovery emits (sensor/state guards are a follow-on).

/** A guard the authoring UI can attach to an arm — the subset Discovery produces. */
export type NewArmGuard =
  | { kind: 'time'; op: 'before' | 'after' | 'between'; from: string; to?: string }
  | { kind: 'dow'; days: number[] };

/** The per-arm editor's working state (same shallow shape as the single-arm form). */
export type CurrentArm = {
  device: Device | null;
  valueToSet?: string;            // evap-cooler sub-channel (fan/water)
  setTo: any;
  guardType: 'none' | 'time' | 'dow';
  timeOp?: 'before' | 'after' | 'between';
  timeFrom?: string;
  timeTo?: string;
  dow?: 'weekday' | 'weekend';
};

/** An arm already staged into the rule, with a human label for the staged list. */
export type StagedArm = {
  device: Device;
  valueToSet?: string;
  setTo: any;
  guards: NewArmGuard[];
  label: string;
};

export type NewMultiArmEffect = {
  trigger: 'sensor' | 'time' | null;
  sensor?: Sensor;
  sensorChannel?: string;         // presence | temperature | humidity (value sensors)
  time?: string;
  current: CurrentArm;
  arms: StagedArm[];
};