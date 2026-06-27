// Representative control-plane data for the visual harness — exercises every
// device category (light, dimmable, blinds, evap-cooler, camera, door) and every
// sensor type (motion, presence, temp/humidity), plus a few automation rules so
// the Automations screen has real content to render. Shapes mirror the server's
// GET responses the dashboard consumes on boot (see src/utils/sync.ts).

export const user = {
  id: "u1",
  username: "david",
  displayName: "David",
  prefs: { tone: "casual" },
};

export const devices = [
  { id: "dev-ceiling", deviceCategory: "light", name: "Ceiling", zone: "Living Room", value: true, type: "boolean", manual: false, operationalRanges: [] },
  { id: "dev-lamp", deviceCategory: "dimmable-light", name: "Reading Lamp", zone: "Living Room", value: 60, type: "value", manual: false, operationalRanges: [] },
  { id: "dev-blinds", deviceCategory: "blinds", name: "Blinds", zone: "Living Room", value: 80, type: "value", manual: false, operationalRanges: [] },
  { id: "dev-cooler", deviceCategory: "evap-cooler", name: "Evap Cooler", zone: "Living Room", value: { fan: true, water: true, target: 24, "room-temp": 26, "unit-temp": 19 }, type: "value", manual: false, operationalRanges: [] },
  { id: "dev-kitchen", deviceCategory: "light", name: "Kitchen", zone: "Kitchen", value: false, type: "boolean", manual: true, operationalRanges: [] },
  { id: "dev-door", deviceCategory: "door", name: "Back Door", zone: "Kitchen", value: false, type: "boolean", manual: false, operationalRanges: [] },
  { id: "dev-bedroom", deviceCategory: "dimmable-light", name: "Bedroom", zone: "Bedroom", value: 0, type: "value", manual: false, operationalRanges: [] },
  { id: "dev-cam", deviceCategory: "camera", name: "Garage Cam", zone: "Garage", value: null, type: "value", manual: true, operationalRanges: [] },
];

export const sensors = [
  { id: "sen-motion", deviceCategory: "sensor", name: "Living Room", zone: "Living Room", value: true, type: "boolean", sensorType: "motion", manual: false, operationalRanges: [] },
  { id: "sen-presence", deviceCategory: "sensor", name: "Hallway", zone: "Hallway", value: false, type: "boolean", sensorType: "presence", manual: false, operationalRanges: [] },
  { id: "sen-th1", deviceCategory: "sensor", name: "Bedroom", zone: "Bedroom", value: "23:45", type: "value", sensorType: "temp/humidity", manual: false, operationalRanges: [] },
  { id: "sen-th2", deviceCategory: "sensor", name: "Living Room", zone: "Living Room", value: "26:40", type: "value", sensorType: "temp/humidity", manual: false, operationalRanges: [] },
  { id: "sen-th3", deviceCategory: "sensor", name: "Outdoor", zone: "Outdoor", value: "28:30", type: "value", sensorType: "temp/humidity", manual: false, operationalRanges: [] },
];

export const effects = [
  { id: 1, trigger: { source: "sensor", nodeId: "sen-motion", channel: "presence" }, arms: [{ when: [{ kind: "sensor", nodeId: "sen-motion", channel: "presence", op: "eq", value: true }], set: { nodeId: "dev-ceiling", channel: "power", value: true } }], enabled: true },
  { id: 2, trigger: { source: "sensor", nodeId: "sen-th2", channel: "temperature" }, arms: [{ when: [{ kind: "sensor", nodeId: "sen-th2", channel: "temperature", op: "gt", value: 25 }], set: { nodeId: "dev-cooler", channel: "fan", value: true } }], enabled: true },
  { id: 3, trigger: { source: "time", at: "23:00" }, arms: [{ when: [], set: { nodeId: "dev-bedroom", channel: "brightness", value: 20 } }], enabled: false },
  { id: 4, trigger: { source: "time", at: "sunset" }, arms: [{ when: [], set: { nodeId: "dev-blinds", channel: "position", value: 0 } }], enabled: true },
];

export const zones = ["Living Room", "Kitchen", "Bedroom", "Hallway", "Garage", "Outdoor"];

export const profiles = { profiles: [{ user_id: "u1", samples: 3 }] };

// Pattern-discovery candidates (memory-service) — the "Suggested for you" cards.
export const candidates = {
  ok: true,
  candidates: [
    {
      id: 1, fingerprint: "fp1", status: "pending",
      trigger: { source: "sensor", nodeId: "sen-motion", channel: "presence", value: true },
      arms: [{ when: [], set: { nodeId: "dev-ceiling", channel: "power", value: true } }],
      evidence: { support: 14, confidence: 0.86, distinctDays: 9, recencyScore: 0.92, firstSeen: "", lastSeen: "" },
      zone: "Living Room", timeBand: "evening",
      line: "Turn on the Ceiling light when motion is detected in the Living Room", matured: true,
    },
    {
      id: 2, fingerprint: "fp2", status: "pending",
      trigger: { source: "sensor", nodeId: "sen-th2", channel: "temperature", value: 25 },
      arms: [{ when: [], set: { nodeId: "dev-cooler", channel: "fan", value: true } }],
      evidence: { support: 6, confidence: 0.61, distinctDays: 4, recencyScore: 0.7, firstSeen: "", lastSeen: "" },
      zone: "Living Room", timeBand: "afternoon",
      line: "Start the cooler fan when the Living Room climbs above 25°", matured: false,
    },
  ],
};
