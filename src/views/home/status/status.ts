import { Component } from "../../../core/component";
import { store } from "../../../store/store";
import template from "./status.html?raw";
import { HomeStatusState } from "./status.model";
import { Device } from "../devices/devices.model";
import { Sensor } from "../sensors/sensors.model";
import { deviceChannels } from "../devices/channels";

// Categories that count as "lights" in the lights-on tally.
const LIGHT_CATS = ["light", "dimmable-light"];

/** A device is "on" when any of its actuator channels is on (boolean true, or a
 * number > 0). Reuses the same channel projection the tiles render from, so this
 * stays in lockstep with decorateDevice's isOn. */
function isOn(device: Device): boolean {
  return deviceChannels(device)
    .filter((c) => c.role === "actuator")
    .some((c) => (c.kind === "boolean" ? c.value === true : (c.value as number) > 0));
}

/** Pull a temperature number out of a temp/humidity sensor, tolerating both the
 * raw "temp:humidity" string and the post-format `{ temperature: "23 °C" }` shape
 * (SensorsService.formatTempHumiditySensor mutates value in place). */
function tempOf(sensor: Sensor): number | null {
  const v: any = sensor.value;
  if (v == null) return null;
  if (typeof v === "string") {
    const t = parseFloat(v.split(":")[0]);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "object" && v.temperature != null) {
    const t = parseFloat(String(v.temperature));
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function timeOfDay(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function clockLabel(d = new Date()): string {
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  return `${time} · ${date}`;
}

/**
 * The editorial "now" column: states the house in one line and surfaces a few
 * glanceable counts (lights on, devices active, warmest room), all derived from
 * the live device + sensor stores and kept fresh via store subscriptions + a
 * one-minute clock tick.
 */
class HomeStatusClass extends Component<HomeStatusState> {
  private unsubDevices?: () => void;
  private unsubSensors?: () => void;
  private clockTimer?: number;

  mount() {
    this.createBind({
      id: "home-status",
      template,
      bind: this.snapshot(),
    });

    this.unsubDevices = store.subscribe("devices", () => this.refresh());
    this.unsubSensors = store.subscribe("sensors", () => this.refresh());
    this.clockTimer = window.setInterval(() => {
      this.bind.clock = clockLabel();
      this.bind.timeOfDay = timeOfDay();
    }, 30000);
  }

  unmount() {
    this.unsubDevices?.();
    this.unsubSensors?.();
    if (this.clockTimer) window.clearInterval(this.clockTimer);
  }

  /** Recompute and push each derived field onto the bind (scalar reassignment —
   * leaf interpolations + :if gates re-render on assignment). */
  private refresh() {
    if (!this.mounted) return;
    const s = this.snapshot();
    this.bind.clock = s.clock;
    this.bind.timeOfDay = s.timeOfDay;
    this.bind.lightsOn = s.lightsOn;
    this.bind.activeCount = s.activeCount;
    this.bind.warmestTemp = s.warmestTemp;
    this.bind.warmestWhere = s.warmestWhere;
    this.bind.hasWarmest = s.hasWarmest;
  }

  private snapshot(): HomeStatusState {
    const devices = store.get("devices") || [];
    const sensors = store.get("sensors") || [];

    const lightsOn = devices.filter(
      (d) => LIGHT_CATS.includes(d.deviceCategory) && isOn(d),
    ).length;
    const activeCount = devices.filter((d) => isOn(d)).length;

    let warmestTemp = -Infinity;
    let warmestWhere = "";
    sensors
      .filter((s) => s.sensorType === "temp/humidity")
      .forEach((s) => {
        const t = tempOf(s);
        if (t != null && t > warmestTemp) {
          warmestTemp = t;
          warmestWhere = s.zone || s.name;
        }
      });
    const hasWarmest = warmestTemp !== -Infinity;

    return {
      clock: clockLabel(),
      timeOfDay: timeOfDay(),
      lightsOn,
      activeCount,
      warmestTemp: hasWarmest ? `${Math.round(warmestTemp)}°` : "—",
      warmestWhere,
      hasWarmest,
    };
  }
}

export const HomeStatus = new HomeStatusClass();
