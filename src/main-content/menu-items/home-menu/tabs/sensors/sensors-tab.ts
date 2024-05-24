import { Bind } from "bindrjs";
import { NavBarItems } from "../../../../../nav-bar/nav-bar.contants";
import template from './sensors-tab.html?raw';
import { Tab } from "../../../../tabs/tabs.model";
import { getEndPointData } from "../../../../../utils/server-handler";
import { Sensor, SensorUpdateEvent, SensorWSEvents, SensorsTabState } from "./sensors-tab.model";
import { getGlobalPosition } from "../../../../../utils/utils.service";
import { openOverlay } from "../../../../../overlay-modal/overlay-modal";
import SensorEditView from "../../overlay-views/sensors-edit.template.html?raw";
import { SensorsService, SensorsServiceClass } from "./sensors-tab.service";
import io from "socket.io-client/dist/socket.io.js";

class SensorsTabClass {
  bind!: SensorsTabState;
  data: any = null;
  sensorsService!: SensorsServiceClass;
  
  #definition: Tab = NavBarItems.find((menuItem) => menuItem.id === 'home')?.tabs?.find((tab) => tab.id === 'sensors') as Tab;
  #WSHooks: SensorWSEvents = {
    'sensor-declare': this.sensorWSDeclare.bind(this),
    'sensor-update': this.sensorWSUpdate.bind(this),
  }
  
  // constructor get called ONCE
  constructor(sensorsService: SensorsServiceClass) {
    this.sensorsService = sensorsService;
    getEndPointData(this.#definition.endpoint || '').then((data: Sensor[]) => {
      this.sensorsService.formatSensorsValues(data);
      this.data = data;
      if (this.bind) {
        this.bind.sensors = this.data;
      }
    });
  }

  // initView gets called everytime the devices view is rendered
  initView() {
    const { bind } = new Bind<SensorsTabState>({
      id: 'sensors',
      template,
      bind: {
        sensors: this.data,
        sensorTouchEnd: this.sensorTouchEnd.bind(this),
      },
    });
    this.bind = bind;
  }  

  sensorTouchEnd(event: any, sensor: Sensor) {
    let rect = getGlobalPosition(event.target);
    openOverlay({
      template: SensorEditView,
      data: {
        ...sensor,
      },
      actions: {
        saveProp: this.sensorsService.saveProp,
      },
      startRect: rect,
      padding: { x: 50, y: 200 }
    });
  }

  initializeWSHooks(socket: io.Socket<SensorWSEvents>) {
    (Object.keys(this.#WSHooks) as  (keyof SensorWSEvents)[]).forEach((key) => {
      socket.on(key, this.#WSHooks[key]);
    });
  }

  sensorWSDeclare(declaredSensor: Sensor) {
    if (!this.bind.sensors) this.bind.sensors = [];
    let sensor = this.bind.sensors.find((sensor: any) => sensor.id === declaredSensor.id);
    if (!sensor) this.bind.sensors.push(declaredSensor);
  }

  sensorWSUpdate(updatedSensor: SensorUpdateEvent) {
    let sensor = this.bind.sensors.find((sensor: any) => sensor.id === updatedSensor.id);
    // if (sensor) sensor.value = this.parseSensorValue(updatedSensor);
    if (sensor) {

      // Update manually for now, to avoid possibly overrideg FE specific stuff
      if (updatedSensor.value) {
        sensor.value = this.parseSensorValue(sensor, updatedSensor.value);
      }
      if (updatedSensor.name) {
        sensor.name = updatedSensor.name || sensor.name;
      }
    }
    this.sensorsService.formatSensorsValues([sensor as Sensor])
  }

  parseSensorValue(sensor: Sensor, value: any) {
    switch (sensor.sensorType) {
      case 'temp/humidity':
        let [temperature, humidity] = value.split(':');
        return { temperature, humidity };
      default: 
        return value
    }
  }
}

export const SensorsTab = new SensorsTabClass(SensorsService);