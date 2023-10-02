export type Sensor = {
  id: string;
  deviceCategory: string;
  manual: boolean;
  name: string;
  value: any;
  type: 'boolean' | 'value'
  ip?: string;
  operationalRanges: string[],
  sensorType: string;
}

export type SensorWSEvents = {
  'sensor-declare': (sensor: Sensor) => void;
  'sensor-update': (sensor: Sensor) => void;
}

export type SensorsTabState = {
  sensors: Sensor[],
  sensorTouchEnd: (event: any, sensor: Sensor) => void
}