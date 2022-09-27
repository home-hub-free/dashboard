import { ContentSection } from "./content-section";
import {
  IHomeHubDevice,
  IWSDeviceUpdate,
  IHomeHubSensor,
  IWSSensorUpdate,
} from "./content-section.model";
const bind = ContentSection.bind;

export function WebSocketDeviceDeclare(data: IHomeHubDevice) {
  if (!bind.devices) bind.devices = [];
  let device = bind.devices.find((device: IHomeHubDevice) => device.id === data.id);
  if (!device) bind.devices.push(data);
}

export function WebSocketDeviceUpdate(data: IWSDeviceUpdate) {
  let device = bind.devices.find((device: IHomeHubDevice) => device.id === data.id);
  if (device && device.value !== data.value) device.value = data.value;
}

export function WebSocketSensorDeclare(data: IHomeHubSensor) {
  if (!bind.sensors) bind.sensors = [];
  let sensor = bind.sensors.find((sensor: any) => sensor.id === data.id);
  if (!sensor) bind.sensors.push(data);
}

export function WebSocketSensorUpdate(data: IWSSensorUpdate) {
  let sensor = bind.sensors.find((sensor: any) => sensor.id === data.id);
  if (sensor) sensor.value = data.value;
}
