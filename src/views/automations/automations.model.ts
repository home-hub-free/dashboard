import { Device } from "../home/devices/devices.model";
import { Sensor } from "../home/sensors/sensors.model";

export type AutoEffect = {
  set: {
    id: string;
    // For multi value devices
    valueToSet?: string;
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