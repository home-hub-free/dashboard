// State for the house bar: date + weather readout + the one whole-house answer a
// resident actually wants on the way out — "is anything still on?" — with the
// matching one-tap action. No greeting, no clock (the OS shows the time).
export type HomeStatusState = {
  /** "Saturday 28 June" — date only (no time), refreshed past midnight. */
  date: string;

  /** Whether a forecast has loaded (gates the whole weather readout). */
  hasWeather: boolean;
  /** Iconoir class for the current conditions, e.g. "iconoir-sun-light". */
  weatherIcon: string;
  /** Current temperature, formatted "24°" (or "—" before first load). */
  temp: string;
  /** One-word/short conditions label, e.g. "Mainly clear". */
  conditions: string;
  /** High/low summary, e.g. "H30° L14°". */
  range: string;

  /** Lights currently on across the whole house (lamp + count readout). */
  lightsOn: number;
  /** Text beside the lamp: "3 lights on" / "All lights off". */
  lightsLabel: string;
  /** One tap on the way out: turn every light in the house off. */
  onAllLightsOff: () => void;
};
