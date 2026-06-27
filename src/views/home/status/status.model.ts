// State for the editorial "now" status column (Home redesign — Command edition).
// All fields are derived live from the device + sensor stores; see status.ts.
export type HomeStatusState = {
  /** "19:42 · Saturday 27 June" — refreshed on a timer + on store changes. */
  clock: string;
  /** Time-of-day word used in the thesis ("morning"/"afternoon"/"evening"/"night"). */
  timeOfDay: string;
  /** Count of light / dimmable-light devices currently on. */
  lightsOn: number;
  /** Count of all devices with any actuator on. */
  activeCount: number;
  /** Warmest room reading, e.g. "26°" (or "—" when no climate sensors). */
  warmestTemp: string;
  /** Where the warmest reading is (zone or sensor name). */
  warmestWhere: string;
  /** Whether a climate (temp/humidity) sensor exists to read. */
  hasWarmest: boolean;
};
