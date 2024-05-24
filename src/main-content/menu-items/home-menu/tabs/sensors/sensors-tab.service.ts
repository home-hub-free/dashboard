import { showToaster } from "../../../../../popup-message/popup-message";
import { submitDataChange } from "../../../../../utils/server-handler";
import { Sensor } from "./sensors-tab.model";

export class SensorsServiceClass {
  constructor () {}

  saveProp(data: any, prop: string) {
    let element: HTMLInputElement | null = document.getElementById(data.id + `_${prop}`) as HTMLInputElement;
    let value: any = element?.value;
    if (prop === 'manual') {
      value = !element.checked;
    }
    if (element && value !== undefined) {
      submitDataChange(data.id, 'sensors', prop, value).then(() => {
        showToaster({
          from: 'bottom',
          message: `Saved sensor ${prop}`,
          timer: 2000
        });
      });
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
    const values = sensor.value.split(':');
    sensor.value = {
      temperature: parseFloat(values[0]) + '°C',
      humidity: parseFloat(values[1]) + '%',
    };
  }
}

export const SensorsService = new SensorsServiceClass();