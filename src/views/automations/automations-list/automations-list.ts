import { Component } from "../../../core/component";
import { store } from "../../../store/store";
import template from './automations-list.html?raw';
import { getEndPointData, saveEffect } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { closeOverlay, openOverlay } from "../../../components/overlay-modal/overlay-modal";
import NewAutomationOverlay from "../overlay-views/new-automation-overlay.html?raw";
import MultiArmOverlay from "../overlay-views/multi-arm-overlay.html?raw";
import { showToaster } from "../../../components/popup-message/popup-message";
import { EffectActions } from "../../../store/actions";
import {
  Arm, ArmCondition, CurrentArm, Effect, EffectOp, NewArmGuard, NewEffect,
  NewMultiArmEffect, SetAction, StagedArm, Trigger,
} from "../automations.model";
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
        newAutomation: this.newAutomation.bind(this),
        newMultiArmAutomation: this.newMultiArmAutomation.bind(this),
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

  private newAutomation(event: MouseEvent) {
    const rect = getGlobalPosition(event.target as HTMLElement);

    openOverlay({
      template: NewAutomationOverlay,
      data: {
        newEffect: {
          device: null,
          setTo: null,
          trigger: null,
        },
        devices: store.get('devices'),
        sensors: store.get('sensors'),
      },
      actions: {
        setNewEffectDevice: this.setNewEffectDevice.bind(this),
        setNewEffectSensor: this.setNewEffectSensor.bind(this),
        saveNewEffect: this.saveNewEffect.bind(this),
      },
      startRect: rect,
      padding: { x: 10, y: 140 },
    });
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  private setNewEffectDevice(deviceId: string, newEffect: NewEffect) {
    const device: Device = store.get('devices').find((device: Device) => device.id === deviceId) as Device;
    newEffect.device = device;
  }

  private setNewEffectSensor(sensorId: string, newEffect: NewEffect) {
    const sensor = store.get('sensors').find((s: Sensor) => s.id === sensorId);
    if (sensor) {
      newEffect.sensor = sensor;
    }
  }

  private saveNewEffect(effect: NewEffect) {
    // Stage 4b: the write path posts the dynamic `trigger + arms` contract (the hub parses
    // it natively). We re-pull the dynamic server view afterwards so the list reflects the
    // canonical, server-assigned form — including any multi-arm rules.
    saveEffect(buildDynamicEffect(effect))
      .then(() => getEndPointData('get-effects-dynamic'))
      .then((effects: Effect[]) => {
        EffectActions.load(effects || []);
        closeOverlay();
        showToaster({
          from: 'bottom',
          message: 'Saved automation',
          timer: 2000
        });
      });
  }

  // ── Multi-arm authoring (EFFECTS_DYNAMIC §9 / DISCOVERY D4) ──────────────────────────
  // Compose one arm at a time into an ordered list, then save the whole `trigger + arms`
  // rule. Every handler that gates dependent rendering REASSIGNS the object it touches
  // (`newEffect.current` / `newEffect.arms`) so bindrjs re-renders — leaf inputs that gate
  // nothing (timeFrom/timeTo/setTo/dow) mutate in place and are read at add-arm time.

  private newMultiArmAutomation(event: MouseEvent) {
    const rect = getGlobalPosition(event.target as HTMLElement);
    openOverlay({
      template: MultiArmOverlay,
      data: {
        newEffect: emptyMultiArm(),
        devices: store.get('devices'),
        sensors: store.get('sensors'),
      },
      actions: {
        setTrigger: (v: string, e: NewMultiArmEffect) => { e.trigger = v === 'null' ? null : (v as 'sensor' | 'time'); },
        setTriggerSensor: (id: string, e: NewMultiArmEffect) => this.setMaSensor(id, e),
        setArmDevice: (id: string, e: NewMultiArmEffect) => this.setMaArmDevice(id, e),
        setArmChannel: (v: string, e: NewMultiArmEffect) => { e.current = { ...e.current, valueToSet: v === 'null' ? undefined : v, setTo: null }; },
        setGuardType: (v: string, e: NewMultiArmEffect) => { e.current = { ...e.current, guardType: (v as CurrentArm['guardType']), timeOp: undefined, timeFrom: '', timeTo: '', dow: undefined }; },
        setTimeOp: (v: string, e: NewMultiArmEffect) => { e.current = { ...e.current, timeOp: v === 'null' ? undefined : (v as NonNullable<CurrentArm['timeOp']>) }; },
        addArm: (e: NewMultiArmEffect) => this.addMaArm(e),
        removeArm: (label: string, e: NewMultiArmEffect) => { e.arms = e.arms.filter((a) => a.label !== label); },
        saveRule: (e: NewMultiArmEffect) => this.saveMaRule(e),
      },
      startRect: rect,
      padding: { x: 10, y: 140 },
    });
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  private setMaSensor(id: string, e: NewMultiArmEffect) {
    const sensor = store.get('sensors').find((s: Sensor) => s.id === id);
    if (sensor) {
      e.sensor = sensor;
      e.sensorChannel = sensor.type === 'value' ? 'temperature' : 'presence';
    }
  }

  private setMaArmDevice(id: string, e: NewMultiArmEffect) {
    const device = store.get('devices').find((d: Device) => d.id === id) as Device;
    e.current = { ...e.current, device: device ?? null, setTo: null, valueToSet: undefined };
  }

  private addMaArm(e: NewMultiArmEffect) {
    const c = e.current;
    if (!c.device || c.setTo === null || c.setTo === undefined || c.setTo === 'null') {
      showToaster({ from: 'bottom', message: 'Pick a device and a value first', timer: 2000 });
      return;
    }
    const guards = currentArmGuards(c);
    const staged: StagedArm = {
      device: c.device,
      valueToSet: c.valueToSet,
      setTo: c.setTo,
      guards,
      label: stagedArmLabel(c.device, c.valueToSet, c.setTo, guards),
    };
    e.arms = [...e.arms, staged];                                  // reassign → re-render staged list
    e.current = { device: null, setTo: null, guardType: 'none' };  // reset the editor
  }

  private saveMaRule(e: NewMultiArmEffect) {
    if (!e.trigger || (e.trigger === 'sensor' && !e.sensor) || e.arms.length === 0) {
      showToaster({ from: 'bottom', message: 'Set a trigger and add at least one arm', timer: 2500 });
      return;
    }
    saveEffect(buildMultiArmEffect(e))
      .then(() => getEndPointData('get-effects-dynamic'))
      .then((effects: Effect[]) => {
        EffectActions.load(effects || []);
        closeOverlay();
        showToaster({ from: 'bottom', message: 'Saved automation', timer: 2000 });
      });
  }
}
export const AutomationsList = new AutomationsListClass(AutomationsListTabService);

// ---------------------------------------------------------------------------
// Dynamic-effect construction (EFFECTS_DYNAMIC Stage 4b). The new-automation form
// authors a single-arm rule in the `trigger + arms` contract: the sensor edge is the
// trigger, and its value predicate becomes the arm's sensor condition (re-checked
// against live state at fire time — exactly the flat semantics). Multi-arm authoring
// (context-conditioned rules) is a follow-on; the agent/Discovery already create them
// and they now display correctly here.
// ---------------------------------------------------------------------------

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

/** Primary actuator channel for a single-value device category. */
function primaryChannel(category: string | undefined): string {
  switch (category) {
    case 'light':
    case 'door':
      return 'power';
    case 'dimmable-light':
      return 'brightness';
    case 'blinds':
      return 'position';
    case 'evap-cooler':
      return 'fan'; // multi-channel; real cooler rules carry valueToSet
    default:
      return 'value';
  }
}

/** The channel a temp/humidity sensor field maps to. */
function valueChannel(field: string | undefined): string {
  if (field === 'temp') return 'temperature';
  if (field === 'humidity') return 'humidity';
  return field || 'value';
}

function comparisonToOp(comparison: string | undefined): EffectOp {
  return comparison === 'higher-than' ? 'gt' : comparison === 'lower-than' ? 'lt' : 'eq';
}

/** Coerce a form value (often a string) to the typed boolean | number. */
function coerce(v: any): boolean | number {
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return isNaN(n) ? (v as any) : n;
}

export function buildDynamicEffect(newEffect: NewEffect): Effect {
  const channel = newEffect.valueToSet || primaryChannel(newEffect.device.deviceCategory);
  const set = { nodeId: newEffect.device.id, channel, value: coerce(newEffect.setTo) };

  if (newEffect.trigger === 'time') {
    // A clock trigger with one unconditional arm ("at <time>, do X").
    const trigger: Trigger = { source: 'time', at: String(newEffect.time ?? '') };
    return { trigger, arms: [{ when: [], set }], enabled: true };
  }

  const sensor = newEffect.sensor!;
  const field = sensor.sensorType === 'temp/humidity' ? newEffect.valueToCheck : undefined;
  const sensorChannel = sensor.type === 'value' ? valueChannel(field) : 'presence';
  const op: EffectOp = sensor.type === 'value' ? comparisonToOp(newEffect.comparassion) : 'eq';

  const trigger: Trigger = { source: 'sensor', nodeId: sensor.id, channel: sensorChannel };
  // The sensor edge wakes the rule; the value predicate becomes the arm's guard.
  const condition: ArmCondition = {
    kind: 'sensor',
    nodeId: sensor.id,
    channel: sensorChannel,
    op,
    value: coerce(newEffect.sensorState),
  };
  const arm: Arm = { when: [condition], set };
  return { trigger, arms: [arm], enabled: true };
}

// ---------------------------------------------------------------------------
// Multi-arm construction (EFFECTS_DYNAMIC §9). Builds the `trigger + arms` contract from the
// staged authoring state — the same shape the agent/Discovery emit, so a hand-authored
// dynamic rule is indistinguishable from a discovered one once saved.
// ---------------------------------------------------------------------------

export function emptyMultiArm(): NewMultiArmEffect {
  return { trigger: null, arms: [], current: { device: null, setTo: null, guardType: 'none' } };
}

/** Derive an arm's dynamic guards from the current-arm editor (time-of-day / day-type — the
 *  subset Discovery produces; an empty list makes this the else/default arm). */
function currentArmGuards(c: CurrentArm): NewArmGuard[] {
  if (c.guardType === 'time' && c.timeOp) {
    return c.timeOp === 'between'
      ? [{ kind: 'time', op: 'between', from: c.timeFrom || '', to: c.timeTo || '' }]
      : [{ kind: 'time', op: c.timeOp, from: c.timeFrom || '' }];
  }
  if (c.guardType === 'dow') {
    return [{ kind: 'dow', days: c.dow === 'weekend' ? [0, 6] : [1, 2, 3, 4, 5] }];
  }
  return [];
}

function guardToArmCondition(g: NewArmGuard): ArmCondition {
  if (g.kind === 'time') {
    return g.op === 'between'
      ? { kind: 'time', op: 'between', from: g.from, to: g.to }
      : { kind: 'time', op: g.op, from: g.from };
  }
  return { kind: 'dow', days: g.days };
}

export function buildMultiArmEffect(e: NewMultiArmEffect): Effect {
  const trigger: Trigger =
    e.trigger === 'time'
      ? { source: 'time', at: String(e.time ?? '') }
      : { source: 'sensor', nodeId: e.sensor!.id, channel: e.sensorChannel || 'presence' };

  const arms: Arm[] = e.arms.map((a) => {
    const channel = a.valueToSet || primaryChannel(a.device.deviceCategory);
    const set: SetAction = { nodeId: a.device.id, channel, value: coerce(a.setTo) };
    return { when: a.guards.map(guardToArmCondition), set };
  });
  return { trigger, arms, enabled: true };
}

/** Human label for a staged arm, shown in the ordered arms list. */
function stagedArmLabel(device: Device, valueToSet: string | undefined, setTo: any, guards: NewArmGuard[]): string {
  const where = guards.length ? guards.map(guardPhrase).join(' and ') : 'default (else)';
  return `${device.name}: ${valuePhrase(valueToSet, setTo)} — ${where}`;
}

function valuePhrase(valueToSet: string | undefined, setTo: any): string {
  if (valueToSet) return `${valueToSet} = ${setTo}`;
  if (setTo === true || setTo === 'true') return 'on';
  if (setTo === false || setTo === 'false') return 'off';
  return `to ${setTo}`;
}

function guardPhrase(g: NewArmGuard): string {
  if (g.kind === 'dow') {
    return g.days.length === 2 && g.days.includes(0) && g.days.includes(6) ? 'on weekends' : 'on weekdays';
  }
  return g.op === 'between' ? `between ${g.from} and ${g.to ?? '?'}` : `${g.op} ${g.from}`;
}