import { Device } from "../../home/devices/devices.model";
import { Sensor } from "../../home/sensors/sensors.model";
import { Condition, NormalizedEffect } from "../automations.model";

// Human labels for channel keys (Stage-2 normalized contract). Falls back to the
// raw key for anything unmapped.
const channelLabel: Record<string, string> = {
  power: "",
  brightness: "brightness",
  position: "position",
  fan: "fan",
  water: "water pump",
  target: "target temperature",
  temperature: "temperature",
  humidity: "humidity",
  presence: "presence",
};

const label = (channel: string) => channelLabel[channel] ?? channel;

export class AutomationsListTabServiceClass {

  constructor() {}

  /**
   * Render a rule to a human sentence directly from the typed normalized shape —
   * no colon-string parsing, no JSON.parse. The legacy stringly-typed renderer
   * this replaces lived against `when.is = "temp:higher-than:28"` blobs.
   */
  parseEffectSentense(data: { devices: Device[], sensors: Sensor[] }, effect: NormalizedEffect) {
    const text = `${this.parseSet(data.devices, effect)} when ${this.parseWhen(data.sensors, effect.when)}`;
    effect.sentence = text;
    return text;
  }

  private parseSet(devices: Device[], effect: NormalizedEffect) {
    const device = devices.find((d) => d.id === effect.set.nodeId);
    const name = device?.name ?? "DEVICE N/A";
    const { channel, value } = effect.set;

    if (typeof value === "boolean") {
      const onOff = value ? "on" : "off";
      // `power` is the implicit channel — "turns on" reads better than "turns power on".
      const what = channel === "power" ? "" : ` ${label(channel)}`;
      return `<strong>${name}</strong> turns${what} <strong>${onOff}</strong>`;
    }

    const what = label(channel);
    return `<strong>${name}</strong> sets${what ? ` (${what})` : ""} to <strong>${value}</strong>`;
  }

  private parseWhen(sensors: Sensor[], when: Condition) {
    if (when.source === "time") {
      return `time is ${when.at}`;
    }

    const sensor = sensors.find((s) => s.id === when.nodeId);
    const name = sensor?.name ?? "SENSOR N/A";

    if (typeof when.value === "boolean") {
      return `sensor(${name}) is <strong>${when.value ? "Active" : "Inactive"}</strong>`;
    }

    const comparison = when.op === "gt" ? "higher than" : when.op === "lt" ? "lower than" : "is";
    return `sensor(${name}) <strong>${label(when.channel)}</strong> is <strong>${comparison} ${when.value}</strong>`;
  }
}

export const AutomationsListTabService = new AutomationsListTabServiceClass();
