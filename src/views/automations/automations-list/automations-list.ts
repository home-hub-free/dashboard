import { Component } from "../../../core/component";
import { store } from "../../../store/store";
import template from './automations-list.html?raw';
import { DuplicateEffectError, deleteEffect, getEndPointData, saveEffect, setEffectEnabled, updateEffect } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { closeOverlay, openOverlay } from "../../../components/overlay-modal/overlay-modal";
import { TimeRangeTrack, type TimeRangeTrackPointValue } from "../../../components/time-range-track/time-range-track";
import CreateAutomationOverlay from "../overlay-views/create-automation-overlay.html?raw";
import EditAutomationOverlay from "../overlay-views/edit-automation-overlay.html?raw";
import { showToaster } from "../../../components/popup-message/popup-message";
import { EffectActions } from "../../../store/actions";
import { ArmCondition, EditEffect, Effect, SetAction } from "../automations.model";
import { findDuplicateEffect } from "../effect-canonical";
import {
  CreateAutomationState, buildCreateEffect, cancelArmEdit, canStageArm, computeHint, computePreview,
  destroyCreateAutomationTracks, editArm, emptyCreateAutomationState, removeArm, setBool, setChannel,
  setComparison, setDevice, setDow, setGuardType, setSensor, setSensorBool, setTimeOp, setTriggerMode,
  setValueToCheck, stageArm,
} from "./create-automation";
import { AutomationsListTabService, AutomationsListTabServiceClass } from "./automations-list.service";
import { Device } from "../../home/devices/devices.model";
import { Sensor } from "../../home/sensors/sensors.model";
import { AutomationsListTabState, EffectsGroup } from "./automations-list.model";

class AutomationsListClass extends Component<AutomationsListTabState> {
  automationsListTabService: AutomationsListTabServiceClass;
  private unsubscribeEffects?: () => void;

  constructor(automationsListTabService: AutomationsListTabServiceClass) {
    super();
    this.automationsListTabService = automationsListTabService;
  }

  mount() {
    this.createBind({
      id: 'automations-list',
      template,
      bind: {
        effects: store.get('effects'),
        groups: [],
        pendingDeleteId: null,
        toggleEffect: this.toggleEffect.bind(this),
        editEffect: this.editEffect.bind(this),
        requestDelete: this.requestDelete.bind(this),
        cancelDelete: this.cancelDelete.bind(this),
        confirmDelete: this.confirmDelete.bind(this),
      },
    });

    this.unsubscribeEffects = store.subscribe('effects', (effects) => {
      this.bind.effects = effects;
      this.parseEffects();
    });

    this.parseEffects();
  }

  unmount() {
    this.unsubscribeEffects?.();
  }

  private parseEffects() {
    this.bind.effects.map((effect: Effect) => {
      effect.sentence = this.automationsListTabService.parseEffectSentense({
        devices: store.get('devices') || [],
        sensors: store.get('sensors') || [],
      }, effect);
      // Gate the per-row ✎: only simple single-arm rules round-trip through the focused
      // edit overlay (multi-arm / conditioned rules are authored, not edited here).
      effect.editable = isSimpleEditable(effect);
    });
    this.groupEffects();
  }

  private groupEffects() {
    const groups: { [key: string]: EffectsGroup } = {};
    this.bind.effects.forEach((effect: Effect) => {
      // Group by the rule's primary target — the first arm's set node (a multi-arm rule
      // typically drives the same device with different values by context).
      const targetId = effect.arms[0]?.set.nodeId ?? 'unknown';
      if (!groups[targetId]) {
        const device = store.get('devices').find((d: Device) => d.id === targetId);
        groups[targetId] = { effects: [], name: device?.name || 'N/A', icon: deviceIcon(device) };
      }
      groups[targetId].effects.push(effect);
    });
    this.bind.groups = Object.values(groups);
  }

  // ── Manage existing rules (EFFECTS_DYNAMIC: /set-effect-enabled, /delete-effect) ─────
  // Each rule carries its stable row `id` (get-effects-dynamic → summaries), so a row can
  // be disabled (reversible) or deleted by id, then the list re-pulls the canonical view.

  private reloadEffects() {
    return getEndPointData('get-effects-dynamic').then((effects: Effect[]) => {
      EffectActions.load(effects || []);
    });
  }

  /** Reversibly flip a rule on/off. The toggle itself is confirmed as soon as it succeeds;
   *  a failed background refresh only warns (it must not read as "the toggle failed"). */
  private toggleEffect(effect: Effect) {
    if (effect.id == null) return; // a just-created rule with no id yet — a resync will fix it
    const next = effect.enabled === false; // currently off → turn on, and vice-versa
    setEffectEnabled(effect.id, next)
      .then(() => {
        showToaster({ from: 'bottom', message: next ? 'Automation on' : 'Automation off', timer: 1600 });
        return this.reloadEffects().catch((err) => {
          showToaster({ from: 'bottom', message: "Updated, but the list didn't refresh — pull to reload", timer: 3000 });
          console.warn('automations-list: post-toggle refresh failed', err);
        });
      })
      .catch((err) => {
        showToaster({ from: 'bottom', message: "Couldn't update the automation", timer: 2500 });
        console.warn('automations-list: toggle failed', err);
      });
  }

  /** First tap on the trash — arm an inline "Delete?" confirm (avoids one-tap data loss). */
  private requestDelete(effect: Effect) {
    this.bind.pendingDeleteId = effect.id ?? null;
  }

  private cancelDelete() {
    this.bind.pendingDeleteId = null;
  }

  /** Second tap — actually remove the rule. Same split as toggleEffect: the delete is
   *  confirmed once it succeeds; a refresh hiccup afterward only warns. */
  private confirmDelete(effect: Effect) {
    this.bind.pendingDeleteId = null;
    if (effect.id == null) return;
    deleteEffect(effect.id)
      .then(() => {
        showToaster({ from: 'bottom', message: 'Automation deleted', timer: 1800 });
        return this.reloadEffects().catch((err) => {
          showToaster({ from: 'bottom', message: "Deleted, but the list didn't refresh — pull to reload", timer: 3000 });
          console.warn('automations-list: post-delete refresh failed', err);
        });
      })
      .catch((err) => {
        showToaster({ from: 'bottom', message: "Couldn't delete the automation", timer: 2500 });
        console.warn('automations-list: delete failed', err);
      });
  }

  // ── Edit a simple single-arm rule (the per-row ✎) ────────────────────────────────────
  // Opens a FOCUSED overlay (not the cascading new-automation form): device + sensor identity
  // are fixed, only the action value + trigger predicate are editable. Built from the rule's
  // current state and saved in place via /update-effect (the id + list position survive).

  // `event` first so the loop var `effect` ends the template call — a loop var followed by a
  // comma silently fails to substitute in bindrjs (DESIGN.md §7).
  private editEffect(event: MouseEvent, effect: Effect) {
    if (effect.id == null || !effect.editable) return;
    const edit = buildEditState(effect, store.get('devices') || [], store.get('sensors') || []);
    if (!edit) {
      showToaster({ from: 'bottom', message: "Can't edit this rule", timer: 2000 });
      return;
    }
    const rect = getGlobalPosition(event.target as HTMLElement);
    openOverlay({
      template: EditAutomationOverlay,
      data: edit,
      actions: {
        setActionBool: (v: boolean, e: EditEffect) => { e.setTo = v; },
        setSensorState: (v: boolean, e: EditEffect) => { e.sensorState = v; },
        setOp: (v: 'gt' | 'lt', e: EditEffect) => { e.op = v; },
        saveEdit: (e: EditEffect) => this.saveEditedEffect(e),
        cancelEdit: () => closeOverlay(),
      },
      onClose: () => destroyEditTimeTrack(),
      startRect: rect,
      padding: { x: 10, y: 140 },
    });
    // Trigger identity (time vs sensor) is fixed for the life of this overlay (only the
    // predicate/value is editable), so this is the only mount this session ever needs —
    // no re-mount path like the create-flow's (Phase 5.3).
    if (edit.triggerKind === 'time') {
      setTimeout(() => mountEditTimeTrack(edit), 0);
    }
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  private saveEditedEffect(e: EditEffect) {
    // Optimistic close (D5): the update POST resolving IS the save — close + confirm right
    // away rather than gating on a second round-trip that has nothing to do with whether the
    // edit itself succeeded (the old chain kept the modal open, and blamed the edit, on a
    // refresh failure alone).
    updateEffect(e.id, buildEditedEffect(e))
      .then(() => {
        closeOverlay();
        showToaster({ from: 'bottom', message: 'Automation updated', timer: 2000 });
        return this.reloadEffects().catch((err) => {
          showToaster({ from: 'bottom', message: "Updated, but the list didn't refresh — pull to reload", timer: 3000 });
          console.warn('automations-list: post-edit refresh failed', err);
        });
      })
      .catch((err) => {
        showToaster({ from: 'bottom', message: "Couldn't update the automation", timer: 2500 });
        console.warn('automations-list: edit failed', err);
      });
  }

  // ── Unified creation flow (EFFECT_CREATION_REPAIR Phase 5 / D1) ──────────────────────
  // ONE progressive-disclosure overlay replaces the old parallel "Add automation" / "Advanced
  // rule" forms — see create-automation.ts for the field handlers + `trigger + arms` builder.
  // This class keeps ownership of open/close + the actual save (POST + optimistic-close +
  // duplicate pre-check), exactly like the two flows it replaces did.

  // Public: the single "Add automation" CTA lives in the parent view header (so it sits above
  // the rule list, not buried under it) and delegates here.
  openCreateAutomation(event: MouseEvent) {
    const rect = getGlobalPosition(event.target as HTMLElement);
    const state = emptyCreateAutomationState(store.get('devices') || [], store.get('sensors') || []);
    openOverlay({
      template: CreateAutomationOverlay,
      data: state,
      actions: {
        setTriggerMode, setSensor, setSensorBool, setValueToCheck, setComparison,
        setDevice, setBool, setChannel, setGuardType, setTimeOp, setDow,
        stageArm, editArm, removeArm, cancelArmEdit, canStageArm, computeHint, computePreview,
        save: (s: CreateAutomationState) => this.saveCreateEffect(s),
      },
      onClose: () => destroyCreateAutomationTracks(),
      startRect: rect,
      padding: { x: 10, y: 140 },
    });
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  private saveCreateEffect(state: CreateAutomationState) {
    if (state.saving) return; // in-flight guard (D5) — a double-tap can't fire a second create
    const built = buildCreateEffect(state);
    // Client pre-check (D2/3.2): catch the common case (re-tapping Save, or authoring a rule
    // that already exists) instantly, with zero round-trip — the server 409 below stays as the
    // belt for state the client's local store hasn't caught up with yet.
    if (findDuplicateEffect(built, store.get('effects'))) {
      showToaster({ from: 'bottom', message: 'That automation already exists', timer: 2500 });
      return; // no POST; the modal stays open, `saving` was never set
    }
    state.saving = true;
    // Optimistic close (D5): the POST resolving IS the save — close + confirm immediately,
    // then re-pull the dynamic server view in the background so the list reflects the
    // canonical, server-assigned form. A refresh failure there only warns; it must never
    // re-open the modal or read as the save having failed.
    saveEffect(built)
      .then(() => {
        closeOverlay();
        showToaster({ from: 'bottom', message: 'Saved automation', timer: 2000 });
        return this.reloadEffects().catch((err) => {
          showToaster({ from: 'bottom', message: "Saved, but the list didn't refresh — pull to reload", timer: 3000 });
          console.warn('automations-list: post-save refresh failed', err);
        });
      })
      .catch((err) => {
        state.saving = false;
        if (err instanceof DuplicateEffectError) {
          // Belt case: the client pre-check above missed it (stale local `effects`) but the
          // server's own D2 guard still caught it — same message, modal stays open either way.
          showToaster({ from: 'bottom', message: 'That automation already exists', timer: 2500 });
        } else {
          showToaster({ from: 'bottom', message: "Couldn't save the automation", timer: 2500 });
        }
        console.warn('automations-list: saveCreateEffect failed', err);
      });
  }
}
export const AutomationsList = new AutomationsListClass(AutomationsListTabService);

// ---------------------------------------------------------------------------
// Focused single-arm edit (the per-row ✎). Editable = one arm whose trigger/guard is the simple
// new-automation shape; the overlay edits only the action value + trigger predicate and saves the
// rebuilt rule in place via /update-effect.
// ---------------------------------------------------------------------------

// Module-level (non-reactive) registry for the edit overlay's own time-track (Phase 5.3) —
// same rationale as create-automation.ts's `tracks`: a TimeRangeTrack instance can't live on
// the (bindrjs-Proxied) `EditEffect` data object without its internal DOM refs getting
// recursively wrapped too.
let editTimeTrack: TimeRangeTrack | null = null;

function mountEditTimeTrack(edit: EditEffect): void {
  const el = document.getElementById('edit-time-track-mount');
  if (!el) return;
  editTimeTrack?.destroy();
  // A stale non-"HH:MM" value (e.g. a pre-D10 "sunset" rule authored before the picker
  // existed) falls back to a plain default rather than handing the track an unparsable seed.
  const seed = /^\d{2}:\d{2}$/.test(edit.time || '') ? edit.time! : '08:00';
  editTimeTrack = new TimeRangeTrack(el, {
    mode: 'point',
    value: { at: seed },
    onChange: (v) => {
      edit.time = (v as TimeRangeTrackPointValue).at;
    },
  });
}

/** Overlay `onClose` — every close path (Save, Cancel, backdrop, a superseding overlay). */
function destroyEditTimeTrack(): void {
  editTimeTrack?.destroy();
  editTimeTrack = null;
}

/** Tile-style iconoir glyph for a rule's target device (mirrors the home tiles). */
function deviceIcon(device: Device | undefined): string {
  switch (device?.deviceCategory) {
    case 'light':
    case 'dimmable-light':
      return 'iconoir-light-bulb';
    case 'blinds':
      return 'iconoir-windows';
    case 'evap-cooler':
      return 'iconoir-snow-flake';
    case 'camera':
      return 'iconoir-video-camera';
    default:
      return 'iconoir-flash';
  }
}

/** Coerce a form value (often a string) to the typed boolean | number. Still needed here for
 *  the focused-edit builder below (buildEditedEffect); the create-flow's own copy lives in
 *  create-automation.ts — see that file's header for why the two aren't shared. */
function coerce(v: any): boolean | number {
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return isNaN(n) ? (v as any) : n;
}

/** True for a rule the focused edit overlay can round-trip: one arm, and either a time trigger with
 *  no guard or a sensor trigger whose sole guard restates that sensor edge. Multi-arm / conditioned
 *  rules (time-of-day, day-of-week, state guards) are authored via the unified overlay, not edited here. */
function isSimpleEditable(effect: Effect): boolean {
  if (effect.arms.length !== 1) return false;
  const arm = effect.arms[0];
  const t = effect.trigger;
  if (t.source === 'time') return arm.when.length === 0;
  if (arm.when.length !== 1) return false;
  const c = arm.when[0];
  return c.kind === 'sensor' && c.nodeId === t.nodeId && c.channel === t.channel;
}

/** Human label for a cooler's actuator sub-channel (shown fixed in the edit header). */
function coolerChannelLabel(channel: string): string {
  if (channel === 'fan') return 'Fan';
  if (channel === 'water') return 'Water pump';
  if (channel === 'target') return 'Target temperature';
  return channel;
}

/** Project a simple single-arm Effect into the focused edit overlay's working state. Returns null
 *  if the rule's target device is unknown (nothing to render the action editor against). */
function buildEditState(effect: Effect, devices: Device[], sensors: Sensor[]): EditEffect | null {
  const arm = effect.arms[0];
  const set = arm.set;
  const device = devices.find((d) => d.id === set.nodeId);
  if (!device) return null;

  const isCooler = device.deviceCategory === 'evap-cooler';
  const base: EditEffect = {
    id: effect.id!,
    sentence: effect.sentence || '',
    device,
    deviceType: device.type,
    category: device.deviceCategory,
    channel: set.channel,
    channelLabel: isCooler ? coolerChannelLabel(set.channel) : undefined,
    setTo: set.value,
    triggerKind: 'time',
    enabled: effect.enabled !== false,
  };

  const trigger = effect.trigger; // local const so TS keeps the discriminated narrowing below
  if (trigger.source === 'time') {
    base.triggerKind = 'time';
    base.time = trigger.at;
    return base;
  }

  const sensor = sensors.find((s) => s.id === trigger.nodeId);
  const cond = arm.when[0] as Extract<ArmCondition, { kind: 'sensor' }>;
  base.sensor = sensor;
  base.sensorChannel = trigger.channel;
  base.sensorName = sensor?.name ?? 'the sensor';
  if (typeof cond.value === 'boolean') {
    base.triggerKind = 'sensorBool';
    base.sensorState = cond.value;
  } else {
    base.triggerKind = 'sensorValue';
    base.op = cond.op === 'lt' ? 'lt' : 'gt';
    base.threshold = Number(cond.value);
  }
  return base;
}

/** Inverse of buildEditState: reassemble the dynamic `trigger + arms` rule from the edited state.
 *  Mirrors the single-arm shape create-automation.ts's buildCreateEffect also produces, so an
 *  edited rule is indistinguishable from a freshly authored one (only the values changed).
 *  `enabled` is carried through unchanged. */
export function buildEditedEffect(e: EditEffect): Effect {
  const set: SetAction = { nodeId: e.device.id, channel: e.channel, value: coerce(e.setTo) };

  if (e.triggerKind === 'time') {
    return { trigger: { source: 'time', at: String(e.time ?? '') }, arms: [{ when: [], set }], enabled: e.enabled };
  }

  const nodeId = e.sensor!.id;
  const channel = e.sensorChannel || 'presence';
  const condition: ArmCondition =
    e.triggerKind === 'sensorBool'
      ? { kind: 'sensor', nodeId, channel, op: 'eq', value: !!e.sensorState }
      : { kind: 'sensor', nodeId, channel, op: e.op || 'gt', value: coerce(e.threshold) };
  return { trigger: { source: 'sensor', nodeId, channel }, arms: [{ when: [condition], set }], enabled: e.enabled };
}
