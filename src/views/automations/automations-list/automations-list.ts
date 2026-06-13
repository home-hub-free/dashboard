import { Component } from "../../../core/component";
import { store } from "../../../store/store";
import template from './automations-list.html?raw';
import { saveEffect } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { closeOverlay, openOverlay } from "../../../components/overlay-modal/overlay-modal";
import NewAutomationOverlay from "../overlay-views/new-automation-overlay.html?raw";
import { showToaster } from "../../../components/popup-message/popup-message";
import { AutoEffect, NewEffect } from "../automations.model";
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
    this.bind.effects.map((effect: AutoEffect) => {
      effect.sentence = this.automationsListTabService.parseEffectSentense({
        devices: store.get('devices') || [],
        sensors: store.get('sensors') || [],
      }, effect);
    });
    this.groupEffects();
  }

  private groupEffects() {
    const groups: { [key: string]: EffectsGroup } = {};
    this.bind.effects.forEach((effect: AutoEffect) => {
      if (!groups[effect.set.id]) {
        const device = store.get('devices').find((d: Device) => d.id === effect.set.id);
        groups[effect.set.id] = { effects: [], name: device?.name || 'N/A' };
      }
      groups[effect.set.id].effects.push(effect);
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
    saveEffect(new EffectBuilder(effect)).then(() => {
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

class EffectBuilder {

  set: { id: string, valueToSet: string, value: any };
  when: { id: string | null, type: 'time' | 'sensor', is: any };

  constructor(newEffect: NewEffect) {
    this.set = {
      id: newEffect.device.id,
      valueToSet: newEffect.valueToSet,
      value: newEffect.setTo,
    }

    if (newEffect.valueToSet) {
      this.set.valueToSet = newEffect.valueToSet;
    }

    let target = null;
    switch (newEffect.trigger) {
      case 'time':
        target = newEffect.time;
      case 'sensor':
        const type = newEffect.sensor?.type;
        if (type === 'value') {
          if (newEffect.sensor?.sensorType === 'temp/humidity') {
            target = this.buildTempHumidityTarget(newEffect);
          } else {
            target = this.buildValueTarget(newEffect);
          }
        } else {
          target = newEffect.sensorState;
        }
    }
    this.when = {
      id: newEffect.sensor?.id || null,
      type: newEffect.trigger,
      is: target,
    }
  }

  private buildTempHumidityTarget(newEffect: NewEffect) {
    return `${newEffect.valueToCheck}:${newEffect.comparassion}:${newEffect.sensorState}`;
  }

  private buildValueTarget(newEffect: NewEffect) {
    return `${newEffect.comparassion}:${newEffect.sensorState}`;
  }
}