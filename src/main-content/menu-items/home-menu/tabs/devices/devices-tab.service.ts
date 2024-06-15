import { openOverlay, OverlayModal } from "../../../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../../../popup-message/popup-message";
import { BlindsConfigureActions, headers, server, submitDataChange, toggleServerDevice } from "../../../../../utils/server-handler";
import { getGlobalPosition } from "../../../../../utils/utils.service";
import DeviceEditView from '../../overlay-views/devices-edit.template.html?raw';
import { DevicesTab } from "./devices-tab";
import { Device } from "./devices-tab.model";

const DeviceInputType: {[key in Device['deviceCategory']]?: string} = {
  'evap-cooler': 'button',
  'dimmable-light': 'range',
  'blinds': 'range',
};

const SCROLL_THRESHOLD = 5;

export class DevicesServiceClass {
  originalValue = 0;
  touchStartPosition = 0;
  currentTouchPosition = 0;
  initialY = 0;
  currentY = 0;
  initialScroll = 0;
  scrollChange = 0;
  recordSwipe = false;
  swipeOnAxis: 'clientX' | 'clientY' = 'clientX';
  currentTimeout: any;

  constructor () {}

  deviceTouchStart(event: any, device: Device) {
    const listElement = window.document.getElementById('tab-content');
    this.initialScroll = listElement?.scrollTop || 0;
    this.recordSwipe = false;

    let rect = getGlobalPosition(event.target);
    this.touchStartPosition = event.touches[0][this.swipeOnAxis];
    this.initialY = event.touches[0]['clientY'];

    let inputType: any = 'text';
    if (device.type === 'value') {
      inputType = DeviceInputType[device.deviceCategory];
    }

    this.currentTimeout = setTimeout(() => {
      this.recordSwipe = true;
      if (!this.originalValue && device.deviceCategory === 'evap-cooler') {
        this.originalValue = device.value;
      }

      if (!this.originalValue && device.deviceCategory !== 'evap-cooler') {
        this.originalValue = parseInt(device.value);
      }

      openOverlay({
        template: DeviceEditView,
        data: {
          ...device,
          inputType,
        },
        actions: this,
        startRect: rect,
        padding: { x: 50, y: 80 }
      });
    }, 600);
  }

  deviceTouchMove(event: TouchEvent, device: Device) {
    const newTouchPositionX: any = event.touches[0][this.swipeOnAxis];
    const newY = event.touches[0]['clientY'];

    this.currentTouchPosition = newTouchPositionX - this.touchStartPosition;
    this.currentY = Math.abs(newY - this.initialY);

    const listElement = window.document.getElementById('tab-content');
    this.scrollChange = Math.abs(listElement?.scrollTop || 0 - this.initialScroll);

    const calculated = Math.round(this.originalValue + (this.currentTouchPosition / 2));  
    const newValue = calculated < 0 ? 0 : calculated > 100 ? 100 : calculated;

    // Scroll threshold to avoid activating elements while scrolling
    if (this.scrollChange >= SCROLL_THRESHOLD) {
      clearTimeout(this.currentTimeout);
    }

    if (this.recordSwipe && device.type === 'value' && newValue >= 0 && newValue <= 100) {
      device.value = newValue;
      ((OverlayModal.bind.data as any).value) = newValue;
      if (newValue % 10 === 0) {
        this.updateDevice(device);
      }
    }
  }

  deviceTouchEnd(event: any, device: Device) {
    if (this.recordSwipe && device.type === 'value') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.recordSwipe = false;
      this.originalValue = 0;
      setTimeout(() => {
        this.updateDevice(device);
      }, 50);
      return;
    }
  
    if (this.currentTimeout) clearTimeout(this.currentTimeout);
  
    if (this.recordSwipe && device.type === 'boolean') return;

    if (this.scrollChange >= SCROLL_THRESHOLD || this.currentY >= SCROLL_THRESHOLD) {
      this.scrollChange = 0;
      this.initialY = 0;
      this.currentY = 0;
      return;
    };
  
    switch (device.type) {
      case 'value':
        let rect = getGlobalPosition(event.target);
        let inputType = DeviceInputType[device.deviceCategory];

        openOverlay({
          template: DeviceEditView,
          data: {
            ...device,
            inputType,
          },
          actions: this,
          startRect: rect,
          padding: { x: 40, y: 80 }
        });
        break;
      case 'boolean':
        // For immidiate feedback, update the value before the server call
        device.value = !device.value;
        this.updateDevice(device);
        break;
  
    }
  }

  updateDevice(device: Device) {
    toggleServerDevice(device)
    .then(({ success }) => {
      if (!success) {
        return showToaster({
          message: 'Something went wrong',
          from: 'bottom',
          timer: 2000,
        })
      }
    })
    .catch(() => {
      showToaster({
        message: "Couldn't connect to device",
        from: "bottom",
        timer: 2000,
      });
      // Revert value if failed
      device.value = !device.value;
    });
  }
  
  saveProp(data: any, prop: string) {
    let element: HTMLInputElement | null = document.getElementById(data.id + `_${prop}`) as HTMLInputElement;
    let value: any = element?.value;
    if (prop === 'manual') {
      value = !element.checked;
    }
    if (element && value !== undefined) {
      submitDataChange(data.id, 'devices', prop, value).then(() => {
        showToaster({
          from: 'bottom',
          message: `Saved device ${prop}`,
          timer: 2000
        });
      });
    }
  }
  
  saveOperationalRanges(device: Device) {
    let elements: HTMLInputElement[] = [
      document.getElementById(device.id + '_operationalRangesFrom') as HTMLInputElement,
      document.getElementById(device.id + '_operationalRangesTo') as HTMLInputElement,
    ];
  
    let missingValues = 0;
    let range = elements
      .map((element) => {
        if (!element.value) missingValues++;
        return element.value;
      })
      .join('-');
  
    if (missingValues) {
      showToaster({
        from: 'bottom',
        message: 'Missing value in operational range time',
        timer: 3000,
      });
    } else {
      device.operationalRanges.push(range);
      submitDataChange(device.id, 'devices', 'operationalRanges', device.operationalRanges);
    }
  }
  
  removeOperationalRange(device: Device, index: any) {
    if (device.operationalRanges.length === 1) {
      device.operationalRanges = [];
    } else {
      device.operationalRanges.splice(index, 1);
    }
    submitDataChange(device.id, 'devices', 'operationalRanges', device.operationalRanges);
  }

  updateCameraSetting(property: string, ip: string, value: string) {
    return fetch('http://' + ip + ':81/settings', {
      method: "POST",
      body: JSON.stringify({
        var: property,
        val: value,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        console.log(result);
      });
  }

  getDeviceById(id: string): Device | null {
    return DevicesTab.data.find((device) => device.id === id) || null;
  }

  configureBlinds(device: any, action: BlindsConfigureActions) {
    return new Promise((resolve, reject) => {
      return fetch(server + "device-blinds-configure", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: device.id,
          action,
        }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result) {
            resolve({
              data: result,
              success: true,
            });
          } else {
            reject();
          }
        });
    });
  }

}
export const DevicesService = new DevicesServiceClass();