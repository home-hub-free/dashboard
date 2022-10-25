import { Bind } from "bindrjs";
import template from "./tab-content.template.html?raw";
import HomeTemplate from "./home-menu/home-menu.template.html?raw";
import AutomationTemplate from './automations-menu/automations-menu.template.html?raw';
import { HomeService } from "./home-menu/home-menu";
import { getEndPointData } from "../../utils/server-handler";
import { AutomationsActions } from "./automations-menu/automations-menu";
import { IMenuItem, NavBarItems } from "../../nav-bar/nav-bar.contants";

const TabContent = new Bind({
  id: "tab-content",
  template,
  bind: {
    activeMenuItemId: "",
    activeTabId: "",
    templates: {
      home: HomeTemplate,
      automations: AutomationTemplate
    },
    actions: {
      home: HomeService,
      automations: AutomationsActions
    },
    data: {
      home: {
        devices: null,
        sensors: null,
      },
      automations: {
        effects: null
      }
    },
  },
  ready,
});
export const TabContentBind = TabContent.bind;
const bind = TabContentBind;

function ready() {
  NavBarItems.forEach((item: IMenuItem) => {
    (item.tabs || []).forEach(async({ endpoint, id }) => {
      let bind: any = TabContentBind;
      bind.data[item.id][id] = await getEndPointData(endpoint || '');;
    });
  })
}

export function WebSocketDeviceDeclare(data: any) {
  if (!bind.data.home.devices) bind.data.home.devices = [];
  let device = bind.data.home.devices.find((device: any) => device.id === data.id);
  if (!device) bind.data.home.devices.push(data);
}

export function WebSocketDeviceUpdate(data: any) {
  let device = bind.data.home.devices.find((device: any) => device.id === data.id);
  if (device && device.value !== data.value) device.value = data.value;
  if (device && device.manual !== data.manual) device.manual = data.manual;
}

export function WebSocketSensorDeclare(data: any) {
  if (!bind.data.home.sensors) bind.data.home.sensors = [];
  let sensor = bind.data.home.sensors.find((sensor: any) => sensor.id === data.id);
  if (!sensor) bind.data.home.sensors.push(data);
}

export function WebSocketSensorUpdate(data: any) {
  let sensor = bind.data.home.sensors.find((sensor: any) => sensor.id === data.id);
  if (sensor) sensor.value = data.value;
}
