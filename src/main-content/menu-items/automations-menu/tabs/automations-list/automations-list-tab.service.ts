import { DevicesTab } from "../../../home-menu/tabs/devices/devices-tab";
import { Device } from "../../../home-menu/tabs/devices/devices-tab.model";
import { Sensor } from "../../../home-menu/tabs/sensors/sensors-tab.model";
import { AutoEffect } from "../../automations-menu.model";

const valueToDisplay: any = {
  'temp': 'temperature',
  'true': 'on',
  'false': 'off',
  'water': 'water pump'
}

export class AutomationsListTabServiceClass {

  constructor() {}

  parseEffectSentense(data: { devices: Device[], sensors: Sensor[]}, effect: AutoEffect) {
    let device = DevicesTab.devicesService.getDeviceById(effect.set.id);
    if (!device) device = { name: 'DEVICE N/A '} as Device;
  
    let text = '';
    let valueToSet = null;
    if (effect.set.valueToSet) {
      valueToSet = valueToDisplay[effect.set.valueToSet] ? valueToDisplay[effect.set.valueToSet] : effect.set.valueToSet;
    }

  
    switch (device.type) {
      case 'boolean':
        text += '<strong> turns ' + (JSON.parse(effect.set.value) ? 'on ' : 'off ') + '</strong>'
        break;
      case 'value':
        const value = valueToDisplay[effect.set.value] ? valueToDisplay[effect.set.value]  : effect.set.value;
        text += `sets${valueToSet ? `(${valueToSet})` : ''} to: <strong>  ${value} </strong>`;
        break;
    }
    
    text += 'when ';
  
    switch (effect.when.type) {
      case 'time':
        text += 'time is ' + effect.when.is;
      case 'sensor':
        let sensor = data.sensors.find((s: any) => s.id == effect.when.id) || { name: 'SENSOR N/A' } as Sensor;
        text += this.parseSensor(sensor, effect);
    }
  
    effect.sentence = text;
  
    return text;
  
  }

  parseSensor(sensor: Sensor, effect: AutoEffect) {
    switch (sensor.sensorType) {
      case 'motion':
        return `sensor(${sensor.name}) is <strong>${JSON.parse(effect.when.is) ? 'Active' : 'Inactive'}</strong>`;
      case 'temp/humidity':
      return this.parseTempHumiditySentense(sensor, effect);
    }
  }

  parseTempHumiditySentense(sensor: Sensor, effect: AutoEffect) {
    let sentense = `sensor(${sensor.name})`;
    const [valueToCheck, comparassion, targetValue] = effect.when.is.split(':');

    switch (valueToCheck) {
      case 'temp':
        sentense += '<strong> temperature </strong>';
        break;
      case 'humidity':
        sentense += '<strong> humidity </strong>';
        break;
      default:
        sentense += valueToCheck;
    }

    sentense += ' is';

    switch (comparassion) {
      case 'higher-than':
        sentense += ' <strong> higher than';
        break;
      case 'lower-than':
        sentense += '<strong> lower than';
        break;
    }

    return sentense += ' ' + targetValue + '</strong>';
  }
}

export const AutomationsListTabService = new AutomationsListTabServiceClass();