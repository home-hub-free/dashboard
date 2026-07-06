import { Component } from "../../../core/component";
import { store } from "../../../store/store";
import { showToaster } from "../../../components/popup-message/popup-message";
import { getWeather, setServerChannel, Weather } from "../../../utils/server-handler";
import { Device } from "../devices/devices.model";
import { deviceChannels } from "../devices/channels";
import template from "./status.html?raw";
import { HomeStatusState } from "./status.model";

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

/** Every light/dimmable that is currently on, with its primary actuator key —
 * the write set for "All off". */
function litLights(devices: Device[]): { device: Device; key: string; off: boolean | number }[] {
  const out: { device: Device; key: string; off: boolean | number }[] = [];
  for (const d of devices) {
    if (d.deviceCategory !== "light" && d.deviceCategory !== "dimmable-light") continue;
    const primary = deviceChannels(d).find((c) => c.role === "actuator");
    if (!primary) continue;
    const on = primary.kind === "boolean" ? primary.value === true : (primary.value as number) > 0;
    if (on) out.push({ device: d, key: primary.key, off: primary.kind === "boolean" ? false : 0 });
  }
  return out;
}

/**
 * The house bar: date, whole-house lights answer (+ "All off"), live weather.
 * The greeting hero is gone — a control board doesn't say good afternoon, it
 * tells you whether the house is settled.
 */
class HomeStatusClass extends Component<HomeStatusState> {
  private dayTimer?: number;
  private weatherTimer?: number;
  private unsubscribeDevices?: () => void;

  mount() {
    this.createBind({
      id: "home-status",
      template,
      bind: {
        ...this.baseState(),
        onAllLightsOff: () => this.allLightsOff(),
      },
    });

    // Date changes slowly; a 5-min tick is plenty to roll past midnight.
    this.dayTimer = window.setInterval(() => {
      this.bind.date = dateLabel();
    }, 5 * 60 * 1000);

    this.applyLights(store.get("devices") || []);
    this.unsubscribeDevices = store.subscribe("devices", (devices) => this.applyLights(devices));

    this.refreshWeather();
    // Open-Meteo updates hourly at best; 15 min keeps the readout fresh without churn.
    this.weatherTimer = window.setInterval(() => this.refreshWeather(), 15 * 60 * 1000);
  }

  unmount() {
    if (this.dayTimer) window.clearInterval(this.dayTimer);
    if (this.weatherTimer) window.clearInterval(this.weatherTimer);
    this.unsubscribeDevices?.();
  }

  private baseState(): Omit<HomeStatusState, "onAllLightsOff"> {
    return {
      date: dateLabel(),
      hasWeather: false,
      weatherIcon: "iconoir-cloud",
      temp: "—",
      conditions: "",
      range: "",
      lightsOn: 0,
      lightsLabel: "All lights off",
    };
  }

  private applyLights(devices: Device[]) {
    const n = litLights(devices).length;
    this.bind.lightsOn = n;
    this.bind.lightsLabel = n === 0 ? "All lights off" : n === 1 ? "1 light on" : `${n} lights on`;
  }

  /** One tap on the way out. Fires the same channel-addressed writes the tiles
   * use; the WS `device-update` broadcasts refresh every tile + this count. */
  private async allLightsOff() {
    const targets = litLights(store.get("devices") || []);
    if (!targets.length) return;
    const results = await Promise.allSettled(
      targets.map(({ device, key, off }) => setServerChannel(device.id, key, off)),
    );
    const failed = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !(r.value as any)?.success),
    ).length;
    if (failed) {
      showToaster({
        message: `${failed} light${failed === 1 ? " didn't" : "s didn't"} respond — still on`,
        from: "bottom",
        timer: 3000,
      });
    }
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
