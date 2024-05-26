import { Bind } from "bindrjs";
import { NavBarItems } from "../../../../../nav-bar/nav-bar.contants";
import template from './devices-tab.html?raw';
import { Tab } from "../../../../tabs/tabs.model";
import { getEndPointData } from "../../../../../utils/server-handler";
import { Device, DeviceWSEvents, DevicesTabState } from "./devices-tab.model";
import { DevicesService, DevicesServiceClass } from "./devices-tab.service";
import io from "socket.io-client/dist/socket.io.js";


class DevicesTabClass {
  bind!: DevicesTabState;
  data!: Device[];
  devicesService!: DevicesServiceClass;

  #definition: Tab = NavBarItems.find((menuItem) => menuItem.id === 'home')?.tabs?.find((tab) => tab.id === 'devices') as Tab;
  #WSHooks: DeviceWSEvents = {
    'device-declare': this.deviceWSDeclare.bind(this),
    'device-update': this.deviceWSUpdate.bind(this),
  }

  // constructor get called ONCE
  constructor(devicesService: DevicesServiceClass) {
    this.devicesService = devicesService;
    getEndPointData(this.#definition.endpoint || '').then((data: Device[]) => {
      this.data = data;
      if (this.bind) this.bind.devices = data;
    });
  }

  // initView gets called everytime the devices view is rendered
  initView() {
    const { bind } = new Bind<DevicesTabState>({
      id: 'devices',
      template,
      bind: {
        devices: this.data,
        deviceTouchStart: this.devicesService.deviceTouchStart.bind(this.devicesService),
        deviceTouchEnd: this.devicesService.deviceTouchEnd.bind(this.devicesService),
        deviceTouchMove: this.devicesService.deviceTouchMove.bind(this.devicesService),
      },
    });
    this.bind = bind;
  }  

  initializeWSHooks(socket: io.Socket<DeviceWSEvents>) {
    (Object.keys(this.#WSHooks) as (keyof DeviceWSEvents)[]).forEach((key ) => {
      socket.on(key, this.#WSHooks[key]);
    });
  }

  // New devices that the server just detected
  deviceWSDeclare(declaredDevice: Device) {
    if (!this.bind.devices) this.bind.devices = [];

    let device = this.bind.devices.find((device: any) => device.id === declaredDevice.id);

    if (!device) this.bind.devices.push(declaredDevice);
  }

  // Devices that are being updated in real time
  deviceWSUpdate(updatedDevice: Device) {
    let device = this.bind.devices.find((device: any) => device.id === updatedDevice.id);
    if (device) {
      // Update manually for now, to avoid possibly overrideg FE specific stuff
      device.value = updatedDevice.value;
      device.manual = updatedDevice.manual;
      device.name = updatedDevice.name;
      device.operationalRanges = device.operationalRanges;
    }
  }
}

export const DevicesTab = new DevicesTabClass(DevicesService);