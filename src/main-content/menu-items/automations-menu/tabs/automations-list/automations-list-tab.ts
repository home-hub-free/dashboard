import { Bind } from "bindrjs";
import template from './automations-list-tab.html?raw';
import { NavBarItems } from "../../../../../nav-bar/nav-bar.contants";
import { getEndPointData, saveEffect } from "../../../../../utils/server-handler";
import { Tab } from "../../../../tabs/tabs.model";
import { getGlobalPosition } from "../../../../../utils/utils.service";
import { closeOverlay, openOverlay } from "../../../../../overlay-modal/overlay-modal";
import NewAutomationOverlay from "../../overlay-views/new-automation-overlay.html?raw";
import { showToaster } from "../../../../../popup-message/popup-message";
import { AutoEffect, NewEffect } from "../../automations-menu.model";
import { AutomationsListTabService, AutomationsListTabServiceClass } from "./automations-list-tab.service";
import { DevicesTab } from "../../../home-menu/tabs/devices/devices-tab";
import { SensorsTab } from "../../../home-menu/tabs/sensors/sensors-tab";
import { Device } from "../../../home-menu/tabs/devices/devices-tab.model";
import { Sensor } from "../../../home-menu/tabs/sensors/sensors-tab.model";
import { AutomationsListTabState } from "./automations-list-tab.model";


class AutomationsListClass {
  bind!: AutomationsListTabState;

  #definition = NavBarItems.find((i) => i.id === 'automations')?.tabs?.find(t => t.id === 'automations-list') as Tab;
  #data!: any;
  newEffect = {};

  constructor(automationsListTabService: AutomationsListTabServiceClass) {
    getEndPointData(this.#definition.endpoint || '').then((data) => {
      this.#data = data;
      this.#data.map((effect: AutoEffect) => {
        effect.sentence = automationsListTabService.parseEffectSentense({
          devices: DevicesTab.data,
          sensors: SensorsTab.data,
        }, effect);
      });
      if (this.bind) this.bind.effects = data;
    });
  }

  initView() {
    const { bind } = new Bind<AutomationsListTabState>({
      id: 'automations-list',
      template,
      bind: {
        effects: this.#data,
        newAutomation: this.newAutomation.bind(this),
      }
    });
    this.bind = bind;
  }

  newAutomation(event: MouseEvent) {
    let rect = getGlobalPosition(event.target as HTMLElement);

    openOverlay({
      template: NewAutomationOverlay,
      data: {
        newEffect: {
          device: null,
          setTo: null,
          trigger: null,
        },
        devices: DevicesTab.data,
        sensors: SensorsTab.data,
      },
      actions: {
        setNewEffectDevice: this.setNewEffectDevice,
        setNewEffectSensor: this.setNewEffectSensor,
        saveNewEffect: this.saveNewEffect,
      },
      startRect: rect,
      padding: { x: 10, y: 140 },
    });
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  setNewEffectDevice(deviceId: string, newEffect: NewEffect) {
    const device: Device = DevicesTab.data.find((device: Device) => device.id === deviceId);
    newEffect.device = device; 
  }  

  setNewEffectSensor(sensorId: string, newEffect: NewEffect) {
    const sensor: Sensor = SensorsTab.data.find((sensor: Sensor) => sensor.id === sensorId);
    newEffect.sensor = sensor;
  }

  saveNewEffect(effect: NewEffect) {
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

  set: { id: string, value: any };
  when: { id: string | null, type: 'time' | 'sensor', is: any };

  constructor(newEffect: NewEffect) {
    this.set = {
      id: newEffect.device.id,
      value: newEffect.setTo,
    }

    let target = null;
    switch (newEffect.trigger) {
      case 'time':
        target = newEffect.time;
      case 'sensor':
        const type = newEffect.sensor?.type;
        target = type === 'value'  ? `${newEffect.comparassion}:${newEffect.sensorState}` : newEffect.sensorState
    }
    this.when = {
      id: newEffect.sensor?.id || null,
      type: newEffect.trigger,
      is: target,
    }
  }
}