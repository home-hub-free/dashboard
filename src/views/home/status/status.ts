import { Component } from "../../../core/component";
import { getWeather, Weather } from "../../../utils/server-handler";
import template from "./status.html?raw";
import { HomeStatusState } from "./status.model";

function timeOfDay(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/** Date only — no clock time (the OS already shows the time; it was redundant here). */
function dateLabel(d = new Date()): string {
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

/** Map a WMO weather-interpretation code to an iconoir glyph (the set we ship). Broad
 * buckets — clear / cloud / fog / rain / heavy-rain / snow / storm — are all the
 * glanceability target needs. Falls back to a neutral cloud for unmapped codes. */
function weatherIcon(code: number | null): string {
  if (code == null) return "iconoir-cloud";
  if (code <= 1) return "iconoir-sun-light"; // clear / mainly clear
  if (code === 2) return "iconoir-cloud-sunny"; // partly cloudy
  if (code === 3) return "iconoir-cloud"; // overcast
  if (code === 45 || code === 48) return "iconoir-fog";
  if (code === 65 || code === 67 || code === 82) return "iconoir-heavy-rain";
  if (code === 95 || code === 96 || code === 99) return "iconoir-thunderstorm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "iconoir-snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "iconoir-rain";
  return "iconoir-cloud";
}

/**
 * The compact home hero: a slim greeting + date on the left and a live weather chip
 * on the right. Deliberately lightweight — the old wide editorial band and its
 * lights-on/devices-active/warmest stat-cards were dropped (redundant against the
 * device wall itself), so this no longer subscribes to the device/sensor stores. It
 * only ticks the date/greeting and polls the hub forecast.
 */
class HomeStatusClass extends Component<HomeStatusState> {
  private dayTimer?: number;
  private weatherTimer?: number;

  mount() {
    this.createBind({
      id: "home-status",
      template,
      bind: this.baseState(),
    });

    // Date + greeting only change slowly; a 5-min tick is plenty to roll past midnight
    // and from afternoon into evening without a per-second clock.
    this.dayTimer = window.setInterval(() => {
      this.bind.date = dateLabel();
      this.bind.timeOfDay = timeOfDay();
    }, 5 * 60 * 1000);

    this.refreshWeather();
    // Open-Meteo updates hourly at best; 15 min keeps the chip fresh without churn.
    this.weatherTimer = window.setInterval(() => this.refreshWeather(), 15 * 60 * 1000);
  }

  unmount() {
    if (this.dayTimer) window.clearInterval(this.dayTimer);
    if (this.weatherTimer) window.clearInterval(this.weatherTimer);
  }

  private baseState(): HomeStatusState {
    return {
      date: dateLabel(),
      timeOfDay: timeOfDay(),
      hasWeather: false,
      weatherIcon: "iconoir-cloud",
      temp: "—",
      conditions: "",
      range: "",
    };
  }

  private async refreshWeather() {
    const w = await getWeather();
    if (!this.mounted || !w) return;
    this.applyWeather(w);
  }

  /** Push the forecast onto the bind (scalar reassignment — leaf interpolations +
   * the :if gate re-render on assignment). */
  private applyWeather(w: Weather) {
    this.bind.weatherIcon = weatherIcon(w.code);
    this.bind.temp = `${w.currentTemp}°`;
    this.bind.conditions = w.description;
    this.bind.range = `H${w.maxTemp}° L${w.minTemp}°`;
    this.bind.hasWeather = true;
  }
}

export const HomeStatus = new HomeStatusClass();
