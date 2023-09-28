type Sensor = {
  id: string,
  type: 'boolean' | 'value'
  name: string,
  value: any,
  sensorType: 'motion' | 'temp/humidity',
}