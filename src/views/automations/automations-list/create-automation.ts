// Unified automation-creation controller (EFFECT_CREATION_REPAIR Phase 5 / D1).
// Replaces the old parallel "Add automation" (new-automation-overlay.html) / "Advanced
// rule" (multi-arm-overlay.html) forms with ONE progressive-disclosure flow: When (trigger)
// -> Do (action) -> Only when (optional per-arm guard) -> staged arms -> Save. A simple
// one-arm rule never needs to touch the "staged arms" concept at all (arms.length stays 0
// and Save posts a single-arm rule directly, exactly like the old simple flow); tapping
// "Add another action" stages the current Do/guard as arm N and clears the editor for the
// next one, growing a multi-arm rule (exactly like the old "Advanced rule" flow) — same
// underlying `trigger + arms` contract (D7), same builder semantics, one authoring surface.
//
// automations-list.ts keeps ownership of opening/closing the overlay and the actual
// save (POST + optimistic-close + duplicate pre-check, per Phases 1/3) — this file owns
// the overlay's OWN state shape, field handlers, staged-arm bookkeeping, and the
// `CreateAutomationState -> Effect` builder.
//
// TIME-TRACK MOUNTING: the overlay's content is rendered by bindrjs setting
// `.content.innerHTML` to the WHOLE template string once per open (see overlay-modal.ts);
// after that, this template's own `:if`/`:foreach` regions react normally (bindrjs's usual
// fine-grained reactivity — DESIGN.md §7 applies to THOSE). A `TimeRangeTrack` is a plain,
// non-bindrjs DOM subtree (time-range-track.ts's own header explains why), so it is mounted
// imperatively into an empty container div AFTER the container appears in the DOM: every
// handler that flips a gate revealing a time-track container (choosing the "Time of day"
// trigger, choosing a time-of-day guard op) schedules a mount on a `setTimeout(0)` (the gate
// itself renders synchronously, but a deferred tick is the documented, defensive pattern for
// this codebase — see the plan's executor brief) and always `destroy()`s any previous
// instance first, so flipping a gate back and forth never leaves two live instances or a
// stale one pointing at a detached node. Instances live in the module-level `tracks` registry
// (NOT on `CreateAutomationState`) because a class instance is a plain object and bindrjs's
// reactive layer recursively Proxies every plain-object property it's handed — wrapping a
// TimeRangeTrack (and, transitively, the raw DOM elements it holds) in a Proxy is exactly the
// kind of foot-gun overlay-modal.ts's own `teardownTimer`/`onCloseHook` module-level `let`s
// already sidestep for the same reason.

import { Device } from "../../home/devices/devices.model";
import { Sensor } from "../../home/sensors/sensors.model";
import { showToaster } from "../../../components/popup-message/popup-message";
import {
  TimeRangeTrack,
  type TimeRangeTrackPointValue,
  type TimeRangeTrackRangeValue,
} from "../../../components/time-range-track/time-range-track";
import { Arm, ArmCondition, Effect, EffectOp, SetAction, Trigger } from "../automations.model";

export type CATriggerMode = "sensor" | "time";
export type CAGuardType = "none" | "time" | "dow";
export type CATimeOp = "before" | "after" | "between";
export type CADow = "weekday" | "weekend";

export type CATargetOption = { device: Device; label: string };
export type CASensorOption = { sensor: Sensor; label: string };

/** A committed action + its optional guard — one row in the "first match wins" arms list. */
export type CAStagedArm = {
  device: Device;
  valueToSet?: string; // evap-cooler sub-channel (fan/water)
  setTo: any;
  guardType: CAGuardType;
  timeOp?: CATimeOp;
  timeFrom?: string;
  timeTo?: string;
  dow?: CADow;
  /** Pre-rendered human summary for the staged-arms row (innerHTML — may carry <strong>). */
  label: string;
};

export type CreateAutomationState = {
  // Context — fixed for the whole session (computed once at open time).
  targets: CATargetOption[]; // actuatable devices only (D4), pre-labeled
  sensorOptions: CASensorOption[]; // every sensor, pre-labeled

  // WHEN (trigger)
  triggerMode: CATriggerMode | null;
  sensor: Sensor | null;
  time: string; // "HH:MM" — time trigger
  sensorBool: boolean | null; // boolean-sensor predicate (Active/Inactive) — single-arm only
  valueToCheck: "temp" | "humidity" | null; // value-sensor predicate field
  comparison: "higher-than" | "lower-than"; // D9: mandatory, defaults "higher-than"
  threshold: string; // value-sensor predicate threshold (text, coerced at build time)

  // DO (the arm currently being edited/staged)
  device: Device | null;
  valueToSet?: string; // evap-cooler sub-channel
  setTo: any;

  // ONLY WHEN (the current arm's optional guard)
  guardType: CAGuardType;
  timeOp: CATimeOp | null;
  timeFrom: string;
  timeTo: string;
  dow: CADow | null;

  // Staged arms (D8: index-keyed identity; tap-to-edit; ✕ removes by index).
  arms: CAStagedArm[];
  /** Which `arms[]` index the editor currently holds (null = composing a brand-new arm). */
  editingIndex: number | null;

  /** In-flight guard for the Save button (D5) — set by automations-list.ts around the POST. */
  saving?: boolean;
};

// ---------------------------------------------------------------------------
// Time-track mounting — module-level registry (see file header for why this can't
// live on CreateAutomationState).
// ---------------------------------------------------------------------------

const tracks: { when: TimeRangeTrack | null; guard: TimeRangeTrack | null } = { when: null, guard: null };

function mountWhenTrack(state: CreateAutomationState): void {
  const el = document.getElementById("ca-when-time-mount");
  if (!el) return;
  tracks.when?.destroy();
  tracks.when = new TimeRangeTrack(el, {
    mode: "point",
    value: { at: state.time || "08:00" },
    onChange: (v) => {
      state.time = (v as TimeRangeTrackPointValue).at;
    },
  });
}

function mountGuardTrack(state: CreateAutomationState): void {
  const el = document.getElementById("ca-guard-time-mount");
  if (!el || !state.timeOp) return;
  tracks.guard?.destroy();
  if (state.timeOp === "between") {
    tracks.guard = new TimeRangeTrack(el, {
      mode: "range",
      value: { from: state.timeFrom || "08:00", to: state.timeTo || "09:00" },
      onChange: (v) => {
        const r = v as TimeRangeTrackRangeValue;
        state.timeFrom = r.from;
        state.timeTo = r.to;
      },
    });
  } else {
    tracks.guard = new TimeRangeTrack(el, {
      mode: "point",
      value: { at: state.timeFrom || "08:00" },
      onChange: (v) => {
        state.timeFrom = (v as TimeRangeTrackPointValue).at;
      },
    });
  }
}

/** Overlay `onClose` hook (every close path — Save success, backdrop, superseded-by-another-
 *  overlay) — releases both tracks so a stale instance never lingers into the next session. */
export function destroyCreateAutomationTracks(): void {
  tracks.when?.destroy();
  tracks.when = null;
  tracks.guard?.destroy();
  tracks.guard = null;
}

// ---------------------------------------------------------------------------
// Native-control resync — a SEPARATE gotcha from the time-track mounting above, worth its
// own note: bindrjs's `:value="expr"` binding (there is no dedicated "value" handler type —
// it falls through to the generic `attr` one) only ever calls `element.setAttribute("value",
// x)`. Per the HTML spec, that only updates what a <select>/<input> DISPLAYS while the
// control's "dirty value flag" is still false — i.e. before the user has ever picked/typed
// into it. Once they have, the browser's own live value takes over and further
// `setAttribute` calls are silently ignored (they still land, just not visibly). So a
// PROGRAMMATIC reset of `state.device`/`state.setTo`/`state.threshold` (stageArm's
// resetEditor, editArm loading a different arm, setDevice/setSensor clearing the
// now-irrelevant value for a freshly picked device/sensor) updates the reactive state
// correctly, but can leave the on-screen control showing a stale, already-dirtied value —
// caught the same way as the dependency-tracking bug above (a Playwright screenshot, not an
// assertion). Fixed the same way DOM-owning code elsewhere in this codebase (TimeRangeTrack
// itself, media-enroll.ts's live video/canvas) handles a case bindrjs's own reactivity
// can't: reach into the DOM directly and set the LIVE `.value` PROPERTY (not the attribute).
// These three are the only native form controls this flow ever resets out from under the
// user (the rest are custom `.toggle-button`s, which correctly re-render from `:class:active`
// every time since there's no separate browser-native "dirty" value to fight).
function syncNativeControls(state: CreateAutomationState): void {
  const deviceSel = document.getElementById("ca-device-select") as HTMLSelectElement | null;
  if (deviceSel) deviceSel.value = state.device?.id ?? "null";

  const setToInput = document.getElementById("ca-setto-input") as HTMLInputElement | null;
  if (setToInput) setToInput.value = state.setTo === null || state.setTo === undefined ? "" : String(state.setTo);

  const thresholdInput = document.getElementById("ca-threshold-input") as HTMLInputElement | null;
  if (thresholdInput) thresholdInput.value = state.threshold ?? "";
}

// ---------------------------------------------------------------------------
// Target/sensor labeling (D4) — actuatable-only targets, "Name — zone (category)" ONLY when
// the name is ambiguous within the filtered list; sensors always "Name — zone".
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<string, string> = {
  light: "light",
  "dimmable-light": "dimmable",
  blinds: "blinds",
  door: "door",
  "evap-cooler": "cooler",
  "presence-relay": "relay",
};
const categoryLabel = (cat: string): string => CATEGORY_LABEL[cat] || cat;

export function buildTargetOptions(devices: Device[]): CATargetOption[] {
  const eligible = devices.filter((d) => d.deviceCategory !== "camera" && d.deviceCategory !== "voice-satellite");
  const nameCounts = new Map<string, number>();
  eligible.forEach((d) => nameCounts.set(d.name, (nameCounts.get(d.name) || 0) + 1));
  return eligible.map((device) => {
    const ambiguous = (nameCounts.get(device.name) || 0) > 1;
    const zone = device.zone || "Unassigned";
    const label = ambiguous
      ? `${device.name} — ${zone} (${categoryLabel(device.deviceCategory)})`
      : `${device.name} — ${zone}`;
    return { device, label };
  });
}

export function buildSensorOptions(sensors: Sensor[]): CASensorOption[] {
  return sensors.map((sensor) => ({ sensor, label: `${sensor.name} — ${sensor.zone || "Unassigned"}` }));
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function emptyCreateAutomationState(devices: Device[], sensors: Sensor[]): CreateAutomationState {
  return {
    targets: buildTargetOptions(devices),
    sensorOptions: buildSensorOptions(sensors),

    triggerMode: null,
    sensor: null,
    time: "08:00",
    sensorBool: null,
    valueToCheck: null,
    comparison: "higher-than", // D9
    threshold: "",

    device: null,
    valueToSet: undefined,
    setTo: null,

    guardType: "none",
    timeOp: null,
    timeFrom: "08:00",
    timeTo: "09:00",
    dow: null,

    arms: [],
    editingIndex: null,
    saving: false,
  };
}

// ---------------------------------------------------------------------------
// WHEN handlers
// ---------------------------------------------------------------------------

export function setTriggerMode(mode: CATriggerMode, state: CreateAutomationState): void {
  state.triggerMode = mode;
  if (mode === "time") {
    setTimeout(() => mountWhenTrack(state), 0);
  } else {
    tracks.when?.destroy();
    tracks.when = null;
  }
}

export function setSensor(id: string, state: CreateAutomationState): void {
  const opt = state.sensorOptions.find((o) => o.sensor.id === id);
  state.sensor = opt ? opt.sensor : null;
  // A different sensor may have a different type — the predicate fields are meaningless
  // until re-chosen against the new sensor.
  state.sensorBool = null;
  state.valueToCheck = null;
  state.threshold = "";
  syncNativeControls(state); // the threshold input may still be mounted (same sensor type)
}

export function setSensorBool(v: boolean, state: CreateAutomationState): void {
  state.sensorBool = v;
}
export function setValueToCheck(v: "temp" | "humidity", state: CreateAutomationState): void {
  state.valueToCheck = v;
}
export function setComparison(v: "higher-than" | "lower-than", state: CreateAutomationState): void {
  state.comparison = v;
}

// ---------------------------------------------------------------------------
// DO handlers
// ---------------------------------------------------------------------------

export function setDevice(id: string, state: CreateAutomationState): void {
  const opt = state.targets.find((o) => o.device.id === id);
  state.device = opt ? opt.device : null;
  state.valueToSet = undefined;
  state.setTo = null;
  syncNativeControls(state); // the "set to" input may still be mounted (same device shape)
}

export function setBool(v: boolean, state: CreateAutomationState): void {
  state.setTo = v;
}

export function setChannel(v: "fan" | "water", state: CreateAutomationState): void {
  state.valueToSet = v;
  state.setTo = null;
}

// ---------------------------------------------------------------------------
// ONLY WHEN (guard) handlers
// ---------------------------------------------------------------------------

export function setGuardType(v: CAGuardType, state: CreateAutomationState): void {
  state.guardType = v;
  if (v !== "time") {
    // Require an explicit op pick again next time "Time of day" is chosen, rather than
    // silently resurrecting whatever op/track was live before — simpler to reason about
    // than trying to keep a torn-down track's state coherent across the round-trip.
    state.timeOp = null;
    tracks.guard?.destroy();
    tracks.guard = null;
  }
}

export function setTimeOp(op: CATimeOp, state: CreateAutomationState): void {
  state.timeOp = op;
  setTimeout(() => mountGuardTrack(state), 0);
}

export function setDow(v: CADow, state: CreateAutomationState): void {
  state.dow = v;
}

// ---------------------------------------------------------------------------
// Validity helpers (also drive inline hints / disabled Save — 5.2, D9, D10)
// ---------------------------------------------------------------------------

// NOTE on the pattern below: every one of these functions is called FROM a template
// expression (`:if`/`:class`/`${}`), never assigned to a stored field — bindrjs auto-tracks
// a handler's dependencies from whichever reactive properties actually got READ (via the
// Proxy `get` trap) during its most recent evaluation, and REPLACES the tracked set each
// time (it does not accumulate across calls). A `state.device && isSetToValid(state)`-style
// short-circuit therefore has a real, empirically-caught failure mode: on the FIRST call
// where `state.device` is still null, `isSetToValid` (and the fields it reads) never runs
// at all, so those fields aren't in the dependency set yet — and if `device` doesn't change
// again for a while (e.g. it flips non-null once, then only `setTo` changes afterward), the
// handler can go stale for exactly the field that just changed. Caught live via a Playwright
// screenshot of the staged-arms flow: the "Review & save" preview showed "1 action staged"
// with a leftover device phrase after 2 arms were already staged. Fix: read every field this
// function could ever need into a local BEFORE any branching, so the Proxy `get` (and thus
// the tracked dependency) always happens unconditionally, on every single call.

function isSetToValid(state: Pick<CreateAutomationState, "device" | "valueToSet" | "setTo">): boolean {
  const device = state.device;
  const valueToSet = state.valueToSet;
  const setTo = state.setTo;
  if (!device) return false;
  if (device.type === "boolean") return setTo === true || setTo === false;
  if (device.deviceCategory === "evap-cooler") return !!valueToSet && (setTo === true || setTo === false);
  return setTo !== null && setTo !== undefined && setTo !== "" && !isNaN(Number(setTo));
}

function isGuardValid(state: Pick<CreateAutomationState, "guardType" | "timeOp" | "dow">): boolean {
  const guardType = state.guardType;
  const timeOp = state.timeOp;
  const dow = state.dow;
  if (guardType === "time") return !!timeOp;
  if (guardType === "dow") return !!dow;
  return true;
}

/** Whether the CURRENT Do/guard editor can be staged as an arm right now (also gates the
 *  "Add another action" / "Save arm" button — D10: an incomplete guard can't silently
 *  collapse to "Always"). */
export function canStageArm(state: CreateAutomationState): boolean {
  const device = state.device;
  const setToOk = isSetToValid(state); // unconditional — see the file-section note above
  const guardOk = isGuardValid(state);
  return !!device && setToOk && guardOk;
}

function guardHint(guardType: CAGuardType): string {
  if (guardType === "time") return 'Pick before, after, or between for "Only when" — or set it back to Always.';
  if (guardType === "dow") return 'Pick weekdays or weekends for "Only when" — or set it back to Always.';
  return "";
}

/** '' = ready to save. Non-empty = the inline hint to show, with Save disabled (5.2: inline
 *  hints, not toasts, for incomplete/invalid state). */
export function computeHint(state: CreateAutomationState): string {
  // Unconditional reads — see the file-section note above.
  const triggerMode = state.triggerMode;
  const time = state.time;
  const sensor = state.sensor;
  const sensorBool = state.sensorBool;
  const valueToCheck = state.valueToCheck;
  const threshold = state.threshold;
  const armsLength = state.arms.length;
  const device = state.device;
  const guardType = state.guardType;
  const setToOk = isSetToValid(state);
  const guardOk = isGuardValid(state);

  if (!triggerMode) return "Choose what starts this automation.";

  if (triggerMode === "time") {
    if (!time) return "Pick a time.";
  } else {
    if (!sensor) return "Pick a sensor.";
    // The sensor's own predicate only matters while the rule is (or might become) a single
    // arm — once "Add another action" has staged anything, the rule branches by guard alone
    // (matches the multi-arm contract: bare trigger, no per-arm sensor-value condition).
    if (armsLength === 0) {
      if (sensor.type === "boolean") {
        if (sensorBool === null) return "Say whether the sensor should be Active or Inactive.";
      } else {
        if (!valueToCheck) return "Choose which value to check.";
        if (threshold === "" || isNaN(Number(threshold))) return "Enter a value to compare against.";
      }
    }
  }

  const doStarted = !!device;

  if (armsLength === 0) {
    // No arm staged yet — the current editor IS the (only) arm; it must be complete.
    if (!doStarted) return "Pick a device to control.";
    if (!setToOk) return "Choose what it should do.";
    if (!guardOk) return guardHint(guardType);
    return "";
  }

  // One or more arms already staged — Save can fire on those alone. The current editor is
  // optional, but a PARTIALLY filled one can't be silently dropped on the floor.
  if (doStarted) {
    if (!setToOk) return "Finish this action, or tap Cancel to leave it out.";
    if (!guardOk) return guardHint(guardType);
  }
  return "";
}

/** Live one-line summary of what Save will do right now — the form's "Review" surface
 *  (no separate step; this line updates as the user fills in fields). PLAIN TEXT ONLY — no
 *  `<strong>`/markup: the template renders this via `${}` INTERPOLATION, not `:innerHTML`.
 *  That's not a style choice, it's load-bearing: bindrjs's `:innerHTML` handler computes
 *  itself exactly ONCE, straight from `HTMLBindHandler.compute()`, OUTSIDE the
 *  `_reactive.collect()` wrapper that every other binding type (`:if`, `:class`, `${}`
 *  interpolation, `:attr`) goes through in `computeAndRebind` — so it never gets ANY
 *  dependencies recorded and never recomputes again after its first paint, even though nothing
 *  about it *looks* different from a `${}` interpolation in the template source. Caught the
 *  same way as the two bugs above: a screenshot showed this exact line frozen at "1 action
 *  staged" after a second arm was staged (the live `.ca-arm-row` list — driven by `:foreach`,
 *  which IS wired through `computeAndRebind` — correctly showed 2). `${}` interpolation is the
 *  one binding type here proven to update live; giving up the bold device name is the price
 *  of using it instead of `:innerHTML`. */
export function computePreview(state: CreateAutomationState): string {
  // Unconditional reads — see the file-section note above.
  const armsLength = state.arms.length;
  const device = state.device;
  const valueToSet = state.valueToSet;
  const setTo = state.setTo;
  const setToOk = isSetToValid(state);
  const editingIndex = state.editingIndex;
  const triggerMode = state.triggerMode;
  const time = state.time;
  const sensor = state.sensor;

  const bits: string[] = [];
  if (armsLength) bits.push(`${armsLength} action${armsLength > 1 ? "s" : ""} staged`);
  if (device && setToOk) {
    const phrase = `${device.name} ${valuePhrase(valueToSet, setTo)}`;
    bits.push(editingIndex !== null ? `editing: ${phrase}` : phrase);
  }
  if (!bits.length) return "";
  const when = triggerMode === "time" ? `at ${time}` : sensor ? `when ${sensor.name} changes` : "";
  return `${bits.join(" + ")}${when ? ` — ${when}` : ""}.`;
}

// ---------------------------------------------------------------------------
// Staged-arm bookkeeping (D8)
// ---------------------------------------------------------------------------

type ArmFields = Pick<
  CAStagedArm,
  "device" | "valueToSet" | "setTo" | "guardType" | "timeOp" | "timeFrom" | "timeTo" | "dow"
>;

function currentArmFields(state: CreateAutomationState): ArmFields {
  return {
    device: state.device!,
    valueToSet: state.valueToSet,
    setTo: state.setTo,
    guardType: state.guardType,
    timeOp: state.timeOp ?? undefined,
    timeFrom: state.timeFrom,
    timeTo: state.timeTo,
    dow: state.dow ?? undefined,
  };
}

/** Structural equality for D8's "identical arm already staged" guard — same device/value/
 *  guard, regardless of how the value was typed in (coerced, like effect-canonical.ts). */
function armsMatch(a: ArmFields, b: CAStagedArm): boolean {
  if (a.device.id !== b.device.id) return false;
  if ((a.valueToSet || "") !== (b.valueToSet || "")) return false;
  if (coerce(a.setTo) !== coerce(b.setTo)) return false;
  if (a.guardType !== b.guardType) return false;
  if (a.guardType === "time") {
    if (a.timeOp !== b.timeOp) return false;
    if (a.timeOp === "between") return a.timeFrom === b.timeFrom && a.timeTo === b.timeTo;
    return a.timeFrom === b.timeFrom;
  }
  if (a.guardType === "dow") return a.dow === b.dow;
  return true; // 'none' — device/value/guardType already matched
}

function valuePhrase(valueToSet: string | undefined, setTo: any): string {
  if (valueToSet) return `${valueToSet === "fan" ? "fan" : "water pump"} ${setTo === true || setTo === "true" ? "on" : "off"}`;
  if (setTo === true || setTo === "true") return "turns on";
  if (setTo === false || setTo === "false") return "turns off";
  return `sets to ${setTo}`;
}

function guardPhrase(a: Pick<CAStagedArm, "guardType" | "timeOp" | "timeFrom" | "timeTo" | "dow">): string {
  if (a.guardType === "time" && a.timeOp) {
    return a.timeOp === "between" ? `between ${a.timeFrom} and ${a.timeTo}` : `${a.timeOp} ${a.timeFrom}`;
  }
  if (a.guardType === "dow" && a.dow) return a.dow === "weekend" ? "on weekends" : "on weekdays";
  return "";
}

function armLabel(a: ArmFields): string {
  const guard = guardPhrase(a);
  return `<strong>${a.device.name}</strong> ${valuePhrase(a.valueToSet, a.setTo)} — ${guard || "always"}`;
}

function resetEditor(state: CreateAutomationState): void {
  state.device = null;
  state.valueToSet = undefined;
  state.setTo = null;
  state.guardType = "none";
  state.timeOp = null;
  state.timeFrom = "08:00";
  state.timeTo = "09:00";
  state.dow = null;
  state.editingIndex = null;
  tracks.guard?.destroy();
  tracks.guard = null;
  syncNativeControls(state);
}

/** "Add another action" (fresh arm) / "Save arm" (editingIndex set) — stages or replaces,
 *  blocking a structural duplicate of an already-staged arm with a toast (D8). */
export function stageArm(state: CreateAutomationState): void {
  if (!canStageArm(state)) return; // belt — the button is .busy-gated on the same check
  const fields = currentArmFields(state);
  const collides = state.arms.some((a, i) => i !== state.editingIndex && armsMatch(fields, a));
  if (collides) {
    showToaster({ from: "bottom", message: "That action is already in this rule", timer: 2200 });
    return;
  }
  const staged: CAStagedArm = { ...fields, label: armLabel(fields) };
  if (state.editingIndex !== null) {
    const next = [...state.arms];
    next[state.editingIndex] = staged;
    state.arms = next; // reassign — re-renders the staged-arms :foreach (DESIGN.md §7)
  } else {
    state.arms = [...state.arms, staged];
  }
  resetEditor(state);
}

/** Tap-to-edit (D8): loads a staged arm's fields back into the editor. */
export function editArm(index: number, state: CreateAutomationState): void {
  const arm = state.arms[index];
  if (!arm) return;
  state.device = arm.device;
  state.valueToSet = arm.valueToSet;
  state.setTo = arm.setTo;
  state.guardType = arm.guardType;
  state.timeOp = arm.timeOp ?? null;
  if (arm.timeFrom) state.timeFrom = arm.timeFrom;
  if (arm.timeTo) state.timeTo = arm.timeTo;
  state.dow = arm.dow ?? null;
  state.editingIndex = index;
  if (arm.guardType === "time" && arm.timeOp) {
    setTimeout(() => mountGuardTrack(state), 0);
  } else {
    tracks.guard?.destroy();
    tracks.guard = null;
  }
  syncNativeControls(state);
}

/** ✕ on a staged row — removes by index (D8); cancels the edit in progress if it targeted
 *  this row, and keeps `editingIndex` pointed at the same logical arm otherwise. */
export function removeArm(index: number, state: CreateAutomationState): void {
  state.arms = state.arms.filter((_, i) => i !== index);
  if (state.editingIndex === index) {
    resetEditor(state);
  } else if (state.editingIndex !== null && state.editingIndex > index) {
    state.editingIndex -= 1;
  }
}

/** Abandon an in-progress edit without altering the staged list. */
export function cancelArmEdit(state: CreateAutomationState): void {
  resetEditor(state);
}

// ---------------------------------------------------------------------------
// Effect builder (D7: byte-identical POST contract). Single-arm vs multi-arm is decided
// purely by `arms.length` at the moment Save is pressed — matches the pre-existing
// buildDynamicEffect/buildMultiArmEffect split this replaces (see the real-world audit
// fixture verified in the plan's Phase 5.2).
// ---------------------------------------------------------------------------

/** Coerce a form value (often a string) to the typed boolean | number. Duplicated (not
 *  imported) from automations-list.ts's private helper of the same name/behavior — sharing
 *  it would mean this file and automations-list.ts importing from each other (a real
 *  circular-import risk, since automations-list.ts imports the handlers/builder from HERE).
 *  Both copies are tiny and side-effect-free; if the coercion rule ever changes, grep for
 *  `function coerce(` to update both. */
function coerce(v: any): boolean | number {
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  return isNaN(n) ? (v as any) : n;
}

function primaryChannel(category: string | undefined): string {
  switch (category) {
    case "light":
    case "door":
      return "power";
    case "dimmable-light":
      return "brightness";
    case "blinds":
      return "position";
    case "evap-cooler":
      return "fan"; // multi-channel; real cooler arms carry valueToSet
    default:
      return "value";
  }
}

function valueChannel(field: string | undefined): string {
  if (field === "temp") return "temperature";
  if (field === "humidity") return "humidity";
  return field || "value";
}

function comparisonToOp(comparison: string | undefined): EffectOp {
  return comparison === "higher-than" ? "gt" : comparison === "lower-than" ? "lt" : "eq";
}

function armSetAction(a: ArmFields): SetAction {
  const channel = a.valueToSet || primaryChannel(a.device.deviceCategory);
  return { nodeId: a.device.id, channel, value: coerce(a.setTo) };
}

function guardConditions(a: Pick<CAStagedArm, "guardType" | "timeOp" | "timeFrom" | "timeTo" | "dow">): ArmCondition[] {
  if (a.guardType === "time" && a.timeOp) {
    return a.timeOp === "between"
      ? [{ kind: "time", op: "between", from: a.timeFrom || "", to: a.timeTo || "" }]
      : [{ kind: "time", op: a.timeOp, from: a.timeFrom || "" }];
  }
  if (a.guardType === "dow") {
    return [{ kind: "dow", days: a.dow === "weekend" ? [0, 6] : [1, 2, 3, 4, 5] }];
  }
  return [];
}

export function buildCreateEffect(state: CreateAutomationState): Effect {
  const isMultiArm = state.arms.length > 0;

  const sensorChannel = (sensor: Sensor): string =>
    sensor.type === "value" ? valueChannel(state.valueToCheck ?? undefined) : "presence";

  const trigger: Trigger =
    state.triggerMode === "time"
      ? { source: "time", at: String(state.time || "") }
      : { source: "sensor", nodeId: state.sensor!.id, channel: sensorChannel(state.sensor!) };

  if (!isMultiArm) {
    const set = armSetAction(currentArmFields(state));
    // The "Only when" guard is always offered once a device is picked, REGARDLESS of arm
    // count (D1's progressive disclosure doesn't gate it on going multi-arm) — a single-arm
    // rule can legitimately want BOTH the trigger's own predicate AND a guard ("when motion
    // is Active, turn on the light, but only between 18:00 and 23:00"). Folding only the
    // predicate in and silently dropping a configured guard here would be exactly the kind
    // of silent-wrong-behavior bug this whole plan exists to kill.
    const guardConds = guardConditions(currentArmFields(state));
    if (state.triggerMode === "time") {
      // A time-kind guard layered on a time TRIGGER is redundant with the trigger's own
      // `at` (the rule already fires at an exact instant) — keep only a dow guard, which
      // is still meaningful ("at 22:00, weekdays only").
      const dowOnly = guardConds.filter((c) => c.kind === "dow");
      return { trigger, arms: [{ when: dowOnly, set }], enabled: true };
    }
    // Single-arm sensor rule: fold the trigger's own predicate into the one arm's guard
    // (mirrors the retired buildDynamicEffect) — the rule only fires on the matching edge —
    // AHEAD of any additional time/dow guard the user configured.
    const sensor = state.sensor!;
    const channel = sensorChannel(sensor);
    const op: EffectOp = sensor.type === "value" ? comparisonToOp(state.comparison) : "eq";
    const value = sensor.type === "value" ? coerce(state.threshold) : coerce(state.sensorBool);
    const condition: ArmCondition = { kind: "sensor", nodeId: sensor.id, channel, op, value };
    return { trigger, arms: [{ when: [condition, ...guardConds], set }], enabled: true };
  }

  // Multi-arm: the staged list, plus the current editor IF it holds a complete, not-yet-
  // staged (or being-edited) arm — Save never silently drops a filled-in action.
  const finalArms: ArmFields[] = [...state.arms];
  if (state.device && isSetToValid(state) && isGuardValid(state)) {
    const current = currentArmFields(state);
    if (state.editingIndex !== null) finalArms[state.editingIndex] = current;
    else finalArms.push(current);
  }
  const arms: Arm[] = finalArms.map((a) => ({ when: guardConditions(a), set: armSetAction(a) }));
  return { trigger, arms, enabled: true };
}
