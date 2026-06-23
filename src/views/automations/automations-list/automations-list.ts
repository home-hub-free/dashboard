import { Component } from "../../../core/component";
import { store } from "../../../store/store";
import template from './automations-list.html?raw';
import { getEndPointData, saveEffect } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { closeOverlay, openOverlay } from "../../../components/overlay-modal/overlay-modal";
import NewAutomationOverlay from "../overlay-views/new-automation-overlay.html?raw";
import { showToaster } from "../../../components/popup-message/popup-message";
import { EffectActions } from "../../../store/actions";
import { Condition, EffectOp, NewEffect, NormalizedEffect } from "../automations.model";
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
    this.bind.effects.map((effect: NormalizedEffect) => {
      effect.sentence = this.automationsListTabService.parseEffectSentense({
        devices: store.get('devices') || [],
        sensors: store.get('sensors') || [],
      }, effect);
    });
    this.groupEffects();
  }

  private groupEffects() {
    const groups: { [key: string]: EffectsGroup } = {};
    this.bind.effects.forEach((effect: NormalizedEffect) => {
      if (!groups[effect.set.nodeId]) {
        const device = store.get('devices').find((d: Device) => d.id === effect.set.nodeId);
        groups[effect.set.nodeId] = { effects: [], name: device?.name || 'N/A' };
      }
      groups[effect.set.nodeId].effects.push(effect);
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
    // Stage 4b: the write path posts the normalized contract directly (the same
    // shape the store holds). We still re-pull the server view afterwards so the
    // list reflects the canonical, server-assigned form.
    saveEffect(buildNormalizedEffect(effect))
      .then(() => getEndPointData('get-effects-normalized'))
      .then((effects: NormalizedEffect[]) => {
        EffectActions.load(effects || []);
        closeOverlay();
        showToaster({
          from: 'bottom',
          message: 'Saved automation',
          timer: 2000
        });
      });
  }
}
export const AutomationsList = new AutomationsListClass(AutomationsListTabService);

// ---------------------------------------------------------------------------
// Normalized-effect construction (Stage 4b). Mirrors the server's
// effects-normalize.ts so the dashboard authors rules in the stored contract.
// ---------------------------------------------------------------------------

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

function buildNormalizedEffect(newEffect: NewEffect): NormalizedEffect {
  const channel = newEffect.valueToSet || primaryChannel(newEffect.device.deviceCategory);
  const set = { nodeId: newEffect.device.id, channel, value: coerce(newEffect.setTo) };

  let when: Condition;
  if (newEffect.trigger === 'time') {
    when = { source: 'time', at: String(newEffect.time ?? '') };
  } else {
    const sensor = newEffect.sensor!;
    const field = sensor.sensorType === 'temp/humidity' ? newEffect.valueToCheck : undefined;
    when =
      sensor.type === 'value'
        ? {
            source: 'sensor',
            nodeId: sensor.id,
            channel: valueChannel(field),
            op: comparisonToOp(newEffect.comparassion),
            value: coerce(newEffect.sensorState),
          }
        : {
            source: 'sensor',
            nodeId: sensor.id,
            channel: 'presence',
            op: 'eq',
            value: coerce(newEffect.sensorState),
          };
  }

  return { when, set, enabled: true };
}