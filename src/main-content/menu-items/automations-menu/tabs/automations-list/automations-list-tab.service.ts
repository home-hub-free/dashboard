import { DevicesTab } from "../../../home-menu/tabs/devices/devices-tab";
import { Device } from "../../../home-menu/tabs/devices/devices-tab.model";
import { Sensor } from "../../../home-menu/tabs/sensors/sensors-tab.model";
import { AutoEffect } from "../../automations-menu.model";

export class AutomationsListTabServiceClass {

  constructor() {}

  parseEffectSentense(data: { devices: Device[], sensors: Sensor[]}, effect: AutoEffect) {
    let device = DevicesTab.devicesService.getDeviceById(effect.set.id);
    if (!device) device = { name: 'DEVICE N/A '} as Device;
  
    let text = '';
  
    switch (device.type) {
      case 'boolean':
        text += '<strong> turns ' + (JSON.parse(effect.set.value) ? 'on ' : 'off ') + '</strong>'
        break;
      case 'value':
        text += '<strong> sets to: ' + effect.set.value + ' </strong>';
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
        sentense += 'temperature';
        break;
      case 'humidity':
        sentense += 'humidity';
        break;
      default:
        sentense += valueToCheck;
    }

    sentense += ' is';

    switch (comparassion) {
      case 'higher-than':
        sentense += ' higher than';
        break;
      case 'lower-than':
        sentense += ' lower than';
        break;
    }

    return sentense += ' ' + targetValue;
  }
}

export const AutomationsListTabService = new AutomationsListTabServiceClass();