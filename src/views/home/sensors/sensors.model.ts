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
  /** Presence-only: light the sensor's onboard LED while it detects someone
   * (walk-test feedback). Hub-owned config — the device adopts it on its next
   * declare heartbeat (~10s). Absent/true = LED on (the default). */
  ledOnActive?: boolean;
  calibrating?: boolean;
  calPct?: number;
  operationalRanges: string[],
  /** Known kinds have a tuned chip; any other string is a custom-built sensor the
   * hub forwards as-is (rendered from `channels`/`unit`/the raw value). */
  sensorType: 'motion' | 'presence' | 'temp/humidity' | (string & {});
  unit?: string;
  /** Hub-forwarded self-declared channels (custom sensors). */
  channels?: { key: string; kind?: string; unit?: string; label?: string; role?: string }[];
  // Display-time decoration (devices.ts decorateSensor) — never persisted.
  icon?: string;
  /** "boolean" (lamp + Detected/Clear), "th" (temp + humidity metrics), "generic" (one reading). */
  chipKind?: 'boolean' | 'th' | 'generic';
  reading?: string;
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
  radarDebug?: boolean;           // live radar bins view open (see radar-debug.ts)
}