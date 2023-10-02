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
  setTo: any;
  trigger: 'time' | 'sensor';
  sensor?: Sensor;
  sensorState?: boolean | string;
  // For value based sensors we have this comparassion prop
  comparassion?: 'higher-than' | 'lower-than'
  time?: Date
}