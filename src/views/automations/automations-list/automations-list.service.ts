import { Device } from "../../home/devices/devices.model";
import { Sensor } from "../../home/sensors/sensors.model";
import { Arm, ArmCondition, Effect, SetAction, Trigger } from "../automations.model";

// Human labels for channel keys. Falls back to the raw key for anything unmapped.
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
const opWord = (op: string) => (op === "gt" ? "higher than" : op === "lt" ? "lower than" : "is");
const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export class AutomationsListTabServiceClass {
  constructor() {}

  /**
   * Render a dynamic rule (trigger + arms) to a human sentence. Single-arm rules whose only
   * guard restates the sensor trigger render in the classic "<device> turns on when <sensor>
   * is Active" form; multi-arm or conditioned rules render the general "When <trigger>:
   * <arm> — else <arm>" form so agent/Discovery-authored rules are legible.
   */
  parseEffectSentense(data: { devices: Device[]; sensors: Sensor[] }, effect: Effect) {
    const text =
      this.tryClassicSentence(data, effect) ?? this.generalSentence(data, effect);
    effect.sentence = text;
    return text;
  }

  /** The flat-equivalent case: one arm whose sole condition is the sensor trigger's value. */
  private tryClassicSentence(data: { devices: Device[]; sensors: Sensor[] }, effect: Effect): string | null {
    if (effect.arms.length !== 1) return null;
    const arm = effect.arms[0];
    const t = effect.trigger;
    if (t.source === "sensor" && arm.when.length === 1) {
      const c = arm.when[0];
      if (c.kind === "sensor" && c.nodeId === t.nodeId && c.channel === t.channel) {
        return `${this.setText(data.devices, arm.set)} when ${this.sensorCondText(data.sensors, c)}`;
      }
    }
    if (t.source === "sensor" && arm.when.length === 0) {
      return `${this.setText(data.devices, arm.set)} when ${this.triggerText(data.sensors, t)} changes`;
    }
    return null;
  }

  private generalSentence(data: { devices: Device[]; sensors: Sensor[] }, effect: Effect): string {
    const head = `When ${this.triggerText(data.sensors, effect.trigger)}`;
    const arms = effect.arms.map((arm) => this.armText(data, arm)).join(" — else ");
    return `${head}: ${arms}`;
  }

  private armText(data: { devices: Device[]; sensors: Sensor[] }, arm: Arm): string {
    const set = this.setText(data.devices, arm.set);
    if (!arm.when.length) return set;
    const conds = arm.when.map((c) => this.condText(data.sensors, c)).join(" and ");
    return `${set} if ${conds}`;
  }

  private triggerText(sensors: Sensor[], trigger: Trigger): string {
    if (trigger.source === "time") return `time is ${trigger.at}`;
    const name = sensors.find((s) => s.id === trigger.nodeId)?.name ?? "SENSOR N/A";
    return `sensor(${name})`;
  }

  private condText(sensors: Sensor[], c: ArmCondition): string {
    switch (c.kind) {
      case "time":
        return c.op === "between"
          ? `between ${c.from} and ${c.to ?? "?"}`
          : `${c.op} ${c.from}`;
      case "dow":
        return `on ${c.days.map((d) => dayName[d] ?? d).join(", ")}`;
      case "sensor":
        return this.sensorCondText(sensors, c);
      case "state":
        return `device(${c.nodeId}) ${label(c.channel)} ${opWord(c.op)} ${c.value}`;
    }
  }

  private sensorCondText(
    sensors: Sensor[],
    c: Extract<ArmCondition, { kind: "sensor" }>,
  ): string {
    const name = sensors.find((s) => s.id === c.nodeId)?.name ?? "SENSOR N/A";
    if (typeof c.value === "boolean") {
      return `sensor(${name}) is <strong>${c.value ? "Active" : "Inactive"}</strong>`;
    }
    return `sensor(${name}) <strong>${label(c.channel)}</strong> is <strong>${opWord(c.op)} ${c.value}</strong>`;
  }

  private setText(devices: Device[], set: SetAction): string {
    const name = devices.find((d) => d.id === set.nodeId)?.name ?? "DEVICE N/A";
    if (typeof set.value === "boolean") {
      const onOff = set.value ? "on" : "off";
      const what = set.channel === "power" ? "" : ` ${label(set.channel)}`;
      return `<strong>${name}</strong> turns${what} <strong>${onOff}</strong>`;
    }
    const what = label(set.channel);
    return `<strong>${name}</strong> sets${what ? ` (${what})` : ""} to <strong>${set.value}</strong>`;
  }
}

export const AutomationsListTabService = new AutomationsListTabServiceClass();
