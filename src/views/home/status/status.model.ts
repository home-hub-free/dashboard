// State for the compact home hero. A slim greeting line (no large editorial band,
// no glanceable stat-cards — see status.ts) plus a live weather chip. Date only, no
// clock time — the time was redundant against the OS clock; weather is the useful add.
export type HomeStatusState = {
  /** "Saturday 28 June" — date only (no time), refreshed past midnight. */
  date: string;
  /** Time-of-day word used in the greeting ("morning"/"afternoon"/"evening"/"night"). */
  timeOfDay: string;

  /** Whether a forecast has loaded (gates the whole weather chip). */
  hasWeather: boolean;
  /** Iconoir class for the current conditions, e.g. "iconoir-sun-light". */
  weatherIcon: string;
  /** Current temperature, formatted "24°" (or "—" before first load). */
  temp: string;
  /** One-word/short conditions label, e.g. "Mainly clear". */
  conditions: string;
  /** High/low summary, e.g. "H30° L14°". */
  range: string;
};
