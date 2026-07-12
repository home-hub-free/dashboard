// ============================================================================
// LIVE-INSTRUMENT MOTION
// The board acknowledging state it did NOT originate — the one motion the
// "instrument, not appliance app" principle (DESIGN.md §1) actively wants.
//
// Three moments, all fired imperatively off the WS seam (ws-handler.ts) on a
// GENUINE delta, never from the template:
//   · a light/actuator flips on or off without you  → the lamp flares/dims once
//   · a live reading ticks (cooler room-temp, a sensor chip) → the digits reseat
//   · a device/sensor joins the network             → its tile/chip rises in
//
// Why imperative, not CSS: bindrjs re-renders every tile on every WS tick
// (DESIGN.md §7). A keyframe baked into the template would REPLAY on every
// unrelated tick. Detecting the delta in JS and playing a one-shot WAAPI
// animation on the settled DOM node is the only way to animate "this value
// actually changed" without the reflex firing constantly.
//
// House rules honored here so callers don't repeat them:
//   · prefers-reduced-motion → every play is a no-op (the data still updates
//     instantly — that IS the reduced-motion alternative).
//   · fill defaults to "none" → nothing is retained after the run, so a settled
//     identity transform can never create a containing block that re-bases the
//     fixed-position overlay/lightbox (the rd-rise/.animated gotcha, DESIGN §layout).
//   · transform / opacity / filter(brightness) only → compositor-cheap, bounded
//     to one small tile or chip, safe on the wall panel's modest GPU.
// ============================================================================

// Matches --ease-out in _tokens.scss (WAAPI can't read a CSS custom property).
const EASE_OUT = "cubic-bezier(0.16, 0.84, 0.44, 1)";

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Play a one-shot keyframe on the first element matching `selector`, AFTER the
 * bindrjs render triggered by the current WS event has painted (rAF). No-op
 * under reduced motion, or when the element isn't in the DOM (a tile in a
 * collapsed room, a chip that hasn't rendered) — a missing target is a
 * non-event, never an error.
 */
function play(selector: string, keyframes: Keyframe[], duration: number): void {
  if (reducedMotion()) return;
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector);
    // fill "none" (the default): the element reverts to its resting CSS on
    // finish — the final keyframe already matches rest, so there's no snap and
    // nothing lingers to form a containing block.
    el?.animate(keyframes, { duration, easing: EASE_OUT });
  });
}

// Ids can carry characters that are invalid in a raw CSS selector (a MAC/UUID
// with ":" etc.) — escape before splicing into `#…`.
function id(prefix: string, raw: string): string {
  return `#${prefix}-${CSS.escape(raw)}`;
}

// ---- Entrances (a device/sensor joined the network) ------------------------------------
// One quick mechanical rise — the same shape as the rd-rise view entrance
// (base.scss), so a new plate arrives in the board's own voice.
const RISE: Keyframe[] = [
  { opacity: 0, transform: "translateY(12px)" },
  { opacity: 1, transform: "translateY(0)" },
];

export function entranceTile(deviceId: string): void {
  play(`${id("tile", deviceId)}`, RISE, 260);
}

export function entranceChip(sensorId: string): void {
  play(`${id("chip", sensorId)}`, RISE, 260);
}

// ---- Lamp flare (a light/actuator changed state without you) ---------------------------
// The fill already transitions (tiles.scss); this one-shot brightness pulse
// makes a change YOU didn't cause catch a glance from across the room — a bulb
// energizing (on) or powering down (off), not a UI bounce.
export function flareTile(deviceId: string, turnedOn: boolean): void {
  const frames: Keyframe[] = turnedOn
    ? [{ filter: "brightness(1.28)" }, { filter: "brightness(1)" }]
    : [{ filter: "brightness(0.82)" }, { filter: "brightness(1)" }];
  play(`${id("tile", deviceId)}`, frames, turnedOn ? 320 : 260);
}

// ---- Reseat (a live reading ticked) ----------------------------------------------------
// The instrument re-seating to a fresh value: a 2px rise + brightness lift that
// settles. Reads clearly as "this number just updated" without decorating the rest.
const RESEAT: Keyframe[] = [
  { transform: "translateY(-2px)", filter: "brightness(1.4)" },
  { transform: "translateY(0)", filter: "brightness(1)" },
];

/** The cooler tile's hero room-temp readout (the one live number on the plate). */
export function reseatReadout(deviceId: string): void {
  play(`${id("tile", deviceId)} .readout-val`, RESEAT, 220);
}

/** A room-card sensor chip's reading (temp/humidity metrics, or the boolean row). */
export function reseatChip(sensorId: string): void {
  play(`${id("chip", sensorId)} .chip-reading`, RESEAT, 220);
}

// ---- Self-write suppression ------------------------------------------------------------
// The hub echoes every dashboard write back over WS, so THIS client sees its
// own taps as "device-update". Those must stay silent — you don't announce a
// change to the person who just made it. The optimistic write path stamps the
// device id here; the WS handler checks it before flaring.
const selfWrites = new Map<string, number>();
const SELF_ECHO_MS = 2500; // generous: covers a slow round-trip to the device

export function markSelfWrite(deviceId: string): void {
  selfWrites.set(deviceId, performance.now());
}

export function wasSelfWrite(deviceId: string): boolean {
  const at = selfWrites.get(deviceId);
  return at !== undefined && performance.now() - at < SELF_ECHO_MS;
}
