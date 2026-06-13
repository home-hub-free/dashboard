import { Component } from "../../../core/component";
import { bus } from "../../../core/bus";
import { store } from "../../../store/store";
import template from "./devices.html?raw";
import { Device, DevicesTabState } from "./devices.model";
import { DevicesService, DevicesServiceClass } from "./devices.service";
import { subscribeCameraFeed } from "../../../utils/ws-camera-handler";

class DevicesTabClass extends Component<DevicesTabState> {
  devicesService: DevicesServiceClass;
  private unsubscribeDeclare?: () => void;
  private unsubscribeUpdate?: () => void;
  private unsubscribeCameraFrame?: () => void;
  private unsubscribeDevices?: () => void;

  constructor(devicesService: DevicesServiceClass) {
    super();
    this.devicesService = devicesService;
    const devices = store.get('devices');
    devices.forEach((device) => {
      if (device.deviceCategory === "camera") {
        subscribeCameraFeed(device.id);
      }
    });
  }

  mount() {
    this.createBind({
      id: "devices",
      template,
      bind: {
        devices: store.get('devices'),
        // The whole tile is the switch: one tap toggles the most common action.
        onTileClick: (device: Device) => {
          switch (device.deviceCategory) {
            case 'light':
              device.value = !device.value;
              this.devicesService.updateDevice(device);
              break;
            case 'dimmable-light':
              if (device.value > 0) {
                (device as any)._lastBrightness = device.value;
                device.value = 0;
              } else {
                device.value = (device as any)._lastBrightness || 100;
              }
              this.devicesService.updateDevice(device);
              break;
            case 'blinds':
            case 'camera':
              // Position/preview control lives in the detail overlay.
              this.devicesService.editClick({ target: this.tileEl(device.id) }, device);
              break;
          }
        },
        onEvapToggle: (event: Event, prop: "fan" | "water", device: Device) => {
          event.stopPropagation();
          device.value[prop] = !device.value[prop];
          this.devicesService.updateDevice(device);
        },
        onSliderInput: (event: Event, device: Device) => {
          device.value = parseInt((event.target as HTMLInputElement).value);
        },
        onSliderCommit: (event: Event, device: Device) => {
          event.stopPropagation();
          device.value = parseInt((event.target as HTMLInputElement).value);
          this.devicesService.updateDevice(device);
        },
        stop: (event: Event) => event.stopPropagation(),
        onEditClick: (event: any, device: Device) => {
          event.stopPropagation();
          this.devicesService.editClick(event, device);
        },
      },
    });

    this.unsubscribeDevices = store.subscribe('devices', (devices) => {
      this.bind.devices = devices;
    });

    this.unsubscribeDeclare = bus.on('device:declare', (declaredDevice) => {
      this.onDeviceDeclare(declaredDevice);
    });

    this.unsubscribeUpdate = bus.on('device:update', (updatedDevice) => {
      this.onDeviceUpdate(updatedDevice);
    });

    this.unsubscribeCameraFrame = bus.on('camera:frame', ({ deviceId, blobUrl }) => {
      this.onCameraFrame(deviceId, blobUrl);
    });
  }

  unmount() {
    this.unsubscribeDevices?.();
    this.unsubscribeDeclare?.();
    this.unsubscribeUpdate?.();
    this.unsubscribeCameraFrame?.();
  }

  // Anchor element used to position the detail overlay for tiles without a
  // dedicated edit affordance (blinds / camera open it on tap).
  private tileEl(deviceId: string): HTMLElement {
    const index = this.bind.devices.findIndex((d) => d.id === deviceId);
    return (document.querySelectorAll('#devices .device-tile')[index] as HTMLElement)
      || document.getElementById('devices') as HTMLElement;
  }

  private onDeviceDeclare(declaredDevice: Device) {
    if (!this.bind.devices) this.bind.devices = [];
    const device = this.bind.devices.find((d) => d.id === declaredDevice.id);
    if (!device) {
      this.bind.devices.push(declaredDevice);
    }
    if (declaredDevice.deviceCategory === "camera") {
      subscribeCameraFeed(declaredDevice.id);
    }
  }

  private onDeviceUpdate(updatedDevice: Device) {
    const device = this.bind.devices.find((d) => d.id === updatedDevice.id);
    if (device) {
      device.value = updatedDevice.value;
      device.manual = updatedDevice.manual;
      device.name = updatedDevice.name;
      device.operationalRanges = updatedDevice.operationalRanges;
    }
  }

  private onCameraFrame(deviceId: string, blobUrl: string) {
    const device = this.bind.devices.find((d) => d.id === deviceId);
    if (device) {
      device.value = blobUrl;
    }
  }
}

export const DevicesTab = new DevicesTabClass(DevicesService);
