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