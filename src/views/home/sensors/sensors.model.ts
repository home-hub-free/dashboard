export type Sensor = {
  id: string;
  deviceCategory: string;
  manual: boolean;
  name: string;
  value: any;
  type: 'boolean' | 'value'
  ip?: string;
  /** Physical room/area the sensor lives in — install-time topology, user-set in
   * the edit overlay. Drives per-zone routing on the memory/LLM side (the sensor's
   * ingestion topic is homehub/<zone>/<id>/<channel>). */
  zone?: string;
  calibrating?: boolean;
  calPct?: number;
  operationalRanges: string[],
  sensorType: 'motion' | 'presence' | 'temp/humidity' ;
}

export type SensorUpdateEvent = {
  id: string,
  value?: any;
  name?: string;
  calibrating?: boolean;
  calPct?: number;
}

export type SensorWSEvents = {
  'sensor-declare': (sensor: Sensor) => void;
  'sensor-update': (sensor: SensorUpdateEvent) => void;
}

export type SensorsTabState = {
  sensors: Sensor[],
  sensorTouchEnd: (event: any, sensor: Sensor) => void,
}

// Transient calibration flags carried on the detail-overlay's data copy. They
// are not part of the persisted sensor — only the open overlay reads them.
export type SensorCalibrationState = {
  calibrateArmed?: boolean;       // step 1 pressed → showing the confirm/disclaimer
  calibrationStarting?: boolean;  // confirmed → counting down before the server call
  calibrationCountdown?: number;  // seconds left in that pre-start delay
  calibrating?: boolean;          // server reports a pass is running
  calPct?: number;                // live progress 0–100
}