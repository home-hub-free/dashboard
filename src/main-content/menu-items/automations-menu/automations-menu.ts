import { Bind } from "bindrjs";
import { closeOverlay, openOverlay } from "../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../popup-message/popup-message";
import { saveEffect } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { AutoEffect } from "./automations-menu.model";
// import { TabContentBind } from "../tab-content";
import NewAutomationOverlay from "./overlay-views/new-automation-overlay.html?raw";
import template from './automations-menu.html?raw';

export const AutomationsService = {
  newAutomation,
  saveAutomation,
  parseEffectSentense,
  // removeAutomation,
};

class AutomationsContentClass {
  bind!: any;
  constructor() {}

  initView() {
    const { bind } = new Bind({
      id: 'automations',
      template,
      bind: {
        // test: ''
      }
    });

    this.bind = bind;
  }
}

export const AutomationsContent = new AutomationsContentClass();

function newAutomation(event: MouseEvent, data: any) {
  let rect = getGlobalPosition(event.target as HTMLElement);
  openOverlay({
    template: NewAutomationOverlay,
    data,
    actions: AutomationsService,
    startRect: rect,
    padding: { x: 0, y: 140 },
  });
  event.stopImmediatePropagation();
  event.preventDefault();
}

function saveAutomation(data: any) {
  let {
    deviceSelected,
    setTo,
    effectSelected,
    dateSelected,
    sensorSelected,
    sensorState,
    comparassion,
  } = data;
  let is = sensorState;
  if (effectSelected === 'time') {
    is = dateSelected;
  }
  if (sensorSelected.sensorType === 'temp/humidity') {
    is = `${comparassion ? comparassion : 'higher-than'}:${sensorState}`
  }
  let effect: AutoEffect = {
    set: {
      id: deviceSelected.id,
      value: setTo,
    },
    when: {
      id: sensorSelected.id,
      type: effectSelected,
      is,
    },
  };
  saveEffect(effect).then(() => {
    closeOverlay();
    showToaster({
      from: 'bottom',
      message: 'Saved automation',
      timer: 2000
    });
  });
}

function parseEffectSentense(data: any, effect: any) {
  let device = data.home.devices.find((d: any) => d.id == effect.set.id);
  if (!device) device = { name: 'DEVICE N/A ' };

  let text = device.name;

  switch (device.type) {
    case 'boolean':
      text += ' turns ' + (JSON.parse(effect.set.value) ? 'on ' : 'off ')
      break;
    case 'value':
      text += ' sets to: ' + effect.set.value + ' ';
      break;
  }
  
  text += 'when ';

  switch (effect.when.type) {
    case 'time':
      text += 'time is ' + effect.when.is;
    case 'sensor':
      let sensor = data.home.sensors.find((s: any) => s.id == effect.when.id) || { name: 'SENSOR N/A' };
      text += `sensor(${sensor.name})`
      let is = ' is ';
      if (sensor.sensorType === 'motion') {
        is += `${JSON.parse(effect.when.is) ? 'Active' : 'Inactive'}`
      }
      if (sensor.sensorType === 'temp/humidity') {
        is += 'higher than ' + effect.when.is; 
      }
      text += is;
  }

  effect.sentence = text;

  return text;

}

// function removeAutomation(index: number) {
//   if (TabContentBind.data.automations.auto.length === 1) {
//     TabContentBind.data.automations.auto = [];
//   } else {
//     TabContentBind.data.automations.auto.splice(index, 1);
//   }
//   saveEffects(TabContentBind.data.automations.auto);
// }
