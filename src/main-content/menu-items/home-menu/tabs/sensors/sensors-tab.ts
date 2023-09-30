import { Bind } from "bindrjs";
import { NavBarItems } from "../../../../../nav-bar/nav-bar.contants";
import template from './sensors-tab.html?raw';
import { Tab } from "../../../../tabs/tabs.model";
import { getEndPointData } from "../../../../../utils/server-handler";
import { Sensor } from "./sensors-tab.model";

class SensorsTabClass {
  bind!: any;

  #definition: Tab = NavBarItems.find((menuItem) => menuItem.id === 'home')?.tabs?.find((tab) => tab.id === 'sensors') as Tab;
  #data: any = null;

  // constructor get called ONCE
  constructor() {
    getEndPointData(this.#definition.endpoint || '').then((data: Sensor[]) => {
      this.formatSensorsValues(data);
      this.#data = data;
      if (this.bind) {
        this.bind.data = this.#data;
      }
    });
  }

  // initView gets called everytime the devices view is rendered
  initView() {
    const { bind } = new Bind({
      id: 'sensors',
      template,
      bind: {
        data: this.#data
      }
    });
    this.bind = bind;
  }  

  private formatSensorsValues(sensors: Sensor[]) {
    sensors.forEach((sensor) => {
      switch (sensor.sensorType) {
        case 'temp/humidity':
          this.formatTempHumiditySensor(sensor);
      }
    })
  } 

  private formatTempHumiditySensor(sensor: Sensor) {
    const values = sensor.value.split(':');
    sensor.value = {};
    sensor.value.temperature = values[0] + '°C';
    sensor.value.humidity = values[1] + '%'
  }
}

export const SensorsTab = new SensorsTabClass();