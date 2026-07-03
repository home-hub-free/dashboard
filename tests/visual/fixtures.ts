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

export const households = [
  { id: "u1", username: "david", displayName: "David", prefs: { tone: "casual" } },
  { id: "u2", username: "sam", displayName: "Sam", prefs: { tone: "formal" } },
];

export const devices = [
  { id: "dev-ceiling", deviceCategory: "light", name: "Ceiling", zone: "Living Room", value: true, type: "boolean", manual: false, operationalRanges: [] },
  { id: "dev-lamp", deviceCategory: "dimmable-light", name: "Reading Lamp", zone: "Living Room", value: 60, type: "value", manual: false, operationalRanges: [] },
  { id: "dev-blinds", deviceCategory: "blinds", name: "Blinds", zone: "Living Room", value: 80, type: "value", manual: false, operationalRanges: [] },
  { id: "dev-cooler", deviceCategory: "evap-cooler", name: "Evap Cooler", zone: "Living Room", value: { fan: true, water: true, target: 24, "room-temp": 26, "unit-temp": 19 }, type: "value", manual: false, operationalRanges: [] },
  { id: "dev-kitchen", deviceCategory: "light", name: "Kitchen", zone: "Kitchen", value: false, type: "boolean", manual: true, operationalRanges: [] },
  { id: "dev-door", deviceCategory: "door", name: "Back Door", zone: "Kitchen", value: false, type: "boolean", manual: false, operationalRanges: [] },
  { id: "dev-bedroom", deviceCategory: "dimmable-light", name: "Bedroom", zone: "Bedroom", value: 0, type: "value", manual: false, operationalRanges: [] },
  { id: "dev-cam", deviceCategory: "camera", name: "Garage Cam", zone: "Garage", value: null, type: "value", manual: true, operationalRanges: [] },
  // Two satellites: one on battery (readout shows), one without a cell (-1 → hidden).
  { id: "dev-sat", deviceCategory: "voice-satellite", name: "Oficina", zone: "Bedroom", value: { volume: 40, mic: true, battery: 72 }, type: "value", manual: false, operationalRanges: [] },
  { id: "dev-sat2", deviceCategory: "voice-satellite", name: "Sala Sat", zone: "Kitchen", value: { volume: 55, mic: false, battery: -1 }, type: "value", manual: false, operationalRanges: [] },
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

// ── Assistant chat history (hub /assistant/chats → gateway chat store) ────────
// A live dashboard thread, an older closed one, and a satellite (voice) thread
// with its room — so the panel renders every row/badge/bubble variant.
export const chatMetas = [
  { id: "c-live", surface: "dashboard", title: "apaga la luz de la sala", startedAt: "2026-07-02T09:00:00Z", updatedAt: "2026-07-02T09:04:00Z", turnCount: 4 },
  { id: "c-voice", surface: "voice", zone: "cocina", title: "pon música para cocinar", startedAt: "2026-07-01T19:20:00Z", updatedAt: "2026-07-01T19:26:00Z", closedAt: "2026-07-01T19:40:00Z", turnCount: 2 },
  { id: "c-old", surface: "dashboard", title: "¿qué tengo mañana en la agenda?", startedAt: "2026-06-30T08:00:00Z", updatedAt: "2026-06-30T08:03:00Z", closedAt: "2026-06-30T08:20:00Z", turnCount: 2 },
];

export const chatFull: Record<string, any> = {
  "c-live": {
    id: "c-live", surface: "dashboard", title: "apaga la luz de la sala",
    startedAt: "2026-07-02T09:00:00Z", updatedAt: "2026-07-02T09:04:00Z",
    turns: [
      { role: "user", content: "apaga la luz de la sala", ts: "2026-07-02T09:00:10Z", speakerName: "David" },
      { role: "assistant", content: "Ya quedó apagada la luz de la sala.", ts: "2026-07-02T09:00:14Z" },
      { role: "user", content: "¿y cómo está la temperatura en la recámara?", ts: "2026-07-02T09:03:40Z", speakerName: "David" },
      { role: "assistant", content: "La recámara está a veinticuatro grados, bastante agradable.", ts: "2026-07-02T09:03:46Z" },
    ],
  },
  "c-voice": {
    id: "c-voice", surface: "voice", zone: "cocina", title: "pon música para cocinar",
    startedAt: "2026-07-01T19:20:00Z", updatedAt: "2026-07-01T19:26:00Z", closedAt: "2026-07-01T19:40:00Z",
    turns: [
      { role: "user", content: "pon música para cocinar", ts: "2026-07-01T19:20:05Z", speakerName: "David" },
      { role: "assistant", content: "Va sonando tu playlist de cocina.", ts: "2026-07-01T19:20:09Z" },
    ],
  },
  "c-old": {
    id: "c-old", surface: "dashboard", title: "¿qué tengo mañana en la agenda?",
    startedAt: "2026-06-30T08:00:00Z", updatedAt: "2026-06-30T08:03:00Z", closedAt: "2026-06-30T08:20:00Z",
    turns: [
      { role: "user", content: "¿qué tengo mañana en la agenda?", ts: "2026-06-30T08:00:10Z", speakerName: "David" },
      { role: "assistant", content: "Mañana tienes la cita del dentista a las nueve.", ts: "2026-06-30T08:00:15Z" },
    ],
  },
};

// vision-service /occupancy — includes a vision-roster-only ONVIF PTZ camera (the
// MC200 pattern: never declares to the hub, tile is synthesized from this poll)
// alongside the hub-declared ESP32 cam above (dev-cam → no ONVIF, no controls).
export const visionOccupancy = {
  zones: { entrance: [{ track: "t1", id: "u1", name: "David", class: "household", confidence: 0.9, since: 0 }] },
  cameras: [
    { id: "dev-cam", zone: "Garage", ip: "10.0.0.9", connected: true, frames_seen: 100, last_frame_age_s: 0.2, detector: "ultralytics", face: "null", rec_mode: "hybrid", onvif: null, events_attached: false, motion_active: null },
    { id: "mc200-entrance", zone: "entrance", ip: "10.0.0.8", connected: true, frames_seen: 4200, last_frame_age_s: 0.1, detector: "ultralytics", face: "insightface", rec_mode: "continuous", onvif: { ptz: true, imaging: true, events: true }, events_attached: true, motion_active: false },
  ],
};

// hub /camera/:id/controls — the one-shot control summary the tile fetches.
export const cameraControls: Record<string, any> = {
  "mc200-entrance": {
    cam_id: "mc200-entrance", zone: "entrance",
    onvif: { ptz: true, imaging: true, events: true }, reachable: true,
    status: { x: 0.05, y: -0.57, move_status: "IDLE" },
    presets: [{ token: "1", name: "hub-home", x: 0.05, y: -0.57 }, { token: "2", name: "Door", x: 0.4, y: -0.3 }],
    imaging: { brightness: 50, saturation: 50, contrast: 50, sharpness: 50 },
  },
};
