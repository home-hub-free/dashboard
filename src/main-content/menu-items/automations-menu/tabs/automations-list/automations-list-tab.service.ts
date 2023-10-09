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
        text += `sensor(${sensor.name})`
        let is = ' is ';
        if (sensor.sensorType === 'motion') {
          is += `<strong>${JSON.parse(effect.when.is) ? 'Active' : 'Inactive'}</strong>`
        }
        if (sensor.sensorType === 'temp/humidity') {
          is += 'higher than ' + effect.when.is; 
        }
        text += is;
    }
  
    effect.sentence = text;
  
    return text;
  
  }
}

export const AutomationsListTabService = new AutomationsListTabServiceClass();