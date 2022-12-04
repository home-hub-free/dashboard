import { closeOverlay, openOverlay } from "../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../popup-message/popup-message";
import { saveEffect } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import NewAutomationOverlay from "./overlay-views/new-automation-overlay.html?raw";

export const AutomationsService = {
  newAutomation,
  saveAutomation,
  parseEffectSentense
};

type AutoEffect = {
  set: {
    id: string;
    value: any;
  };
  when: {
    id: string;
    type: string;
    is: any;
  };
};

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
  } = data;
  let is = sensorState;
  if (effectSelected === 'time') {
    is = dateSelected;
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
  let text = device.name;

  switch (device.type) {
    case 'boolean':
      text += ' turns ' + (JSON.parse(effect.set.value) ? 'on ' : 'off ')
      break;
    case 'value':
      text += ' sets to: ' + effect.set.value;
      break;
  }
  
  text += 'when ';

  switch (effect.when.type) {
    case 'time':
      text += 'time is ' + effect.when.is;
    case 'sensor':
      let sensor = data.home.sensors.find((s: any) => s.id == effect.when.id);
      text += `sensor(${sensor.name}) is ${JSON.parse(effect.when.is) ? 'Active' : 'Inactive'}`
  }

  return text;

}
