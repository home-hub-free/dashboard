import { Bind } from "bindrjs";
import { NavBarItems } from "../../../../../nav-bar/nav-bar.contants";
import template from './sensors-tab.html?raw';
import { Tab } from "../../../../tabs/tabs.model";
import { getEndPointData } from "../../../../../utils/server-handler";
import { Sensor } from "./sensors-tab.model";
import { getGlobalPosition } from "../../../../../utils/utils.service";
import { openOverlay } from "../../../../../overlay-modal/overlay-modal";
import SensorEditView from "../../overlay-views/sensors-edit.template.html?raw";
import { SensorsService, SensorsServiceClass } from "./sensors-tab.service";

class SensorsTabClass {
  bind!: any;
  sensorsService!: SensorsServiceClass;

  #definition: Tab = NavBarItems.find((menuItem) => menuItem.id === 'home')?.tabs?.find((tab) => tab.id === 'sensors') as Tab;
  data: any = null;
  devicesService: any;

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
    const { bind } = new Bind({
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
}

export const SensorsTab = new SensorsTabClass(SensorsService);