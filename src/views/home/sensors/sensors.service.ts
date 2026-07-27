import { showToaster } from "../../../components/popup-message/popup-message";
import { submitDataChange } from "../../../utils/server-handler";
import { Sensor } from "./sensors.model";

export class SensorsServiceClass {
  constructor () {}

  /** Debounced like the device twin — the rename field fires per keystroke. */
  private savePropTimers = new Map<string, ReturnType<typeof setTimeout>>();

  saveProp(data: any, prop: string) {
    let element: HTMLInputElement | null = document.getElementById(data.id + `_${prop}`) as HTMLInputElement;
    let value: any = element?.value;
    if (prop === 'manual') {
      value = !element.checked;
    }
    if (element && value !== undefined) {
      const key = `${data.id}:${prop}`;
      const pending = this.savePropTimers.get(key);
      if (pending) clearTimeout(pending);
      this.savePropTimers.set(key, setTimeout(() => {
        this.savePropTimers.delete(key);
        submitDataChange(data.id, 'sensors', prop, value).then(() => {
          showToaster({
            from: 'bottom',
            message: `Saved sensor ${prop}`,
            timer: 2000
          });
        });
      }, 450));
    }
  }

  formatSensorsValues(sensors: Sensor[]) {
    sensors.forEach((sensor) => {
      switch (sensor.sensorType) {
        case 'temp/humidity':
          this.formatTempHumiditySensor(sensor);
      }
    })
  } 

  private formatTempHumiditySensor(sensor: Sensor) {
    // Only the raw "t:h" wire format needs formatting — an already-formatted
    // value (object) must pass through untouched, not crash on .split.
    if (typeof sensor.value !== 'string') return;
    const [temperature, humidity] = sensor.value.split(':');
    sensor.value = {
      temperature: parseFloat(temperature) + ' °C',
      humidity: parseFloat(humidity) + ' %',
    };
  }
}

export const SensorsService = new SensorsServiceClass();