import { Device } from "../home-menu/tabs/devices/devices-tab.model";
import { Sensor } from "../home-menu/tabs/sensors/sensors-tab.model";

export type AutoEffect = {
  set: {
    id: string;
    value: any;
  };
  when: {
    id: string;
    type: string;
    is: any;
  };
  sentence?: string
};

export type NewEffect = {
  device: Device;
  // For multi value devices
  valueToSet?: any;
  setTo: any;
  trigger: 'time' | 'sensor';
  sensor?: Sensor;
  sensorState?: boolean | string;
  valueToCheck?: string; // For multi value type sensors
  comparassion?: 'higher-than' | 'lower-than' // For value based sensors we have this comparassion prop
  time?: Date
}