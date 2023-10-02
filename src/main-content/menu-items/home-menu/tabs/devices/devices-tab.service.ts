import { openOverlay, OverlayModal } from "../../../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../../../popup-message/popup-message";
import { submitDataChange, toggleServerDevice } from "../../../../../utils/server-handler";
import { getGlobalPosition } from "../../../../../utils/utils.service";
import DeviceEditView from '../../overlay-views/devices-edit.template.html?raw';
import { Device } from "./devices-tab.model";

export class DevicesServiceClass {
  originalValue = 0;
  touchStartPosition = 0;
  currentTouchPosition = 0;
  recordSwipe = false;
  swipeOnAxis: 'clientX' | 'clientY' = 'clientX';
  currentTimeout: any;

  constructor () {}

  deviceTouchStart(event: any, device: Device) {
    this.recordSwipe = false;
    let rect = getGlobalPosition(event.target);
    this.touchStartPosition = event.touches[0][this.swipeOnAxis];
    let inputType: any = 'text';
    if (device.type === 'value') {
      inputType = 'range';
    }

    this.currentTimeout = setTimeout(() => {
      this.recordSwipe = true;
      if (!this.originalValue) this.originalValue = parseInt(device.value);

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
    const newTouchPosition: any = event.touches[0][this.swipeOnAxis];
    this.currentTouchPosition = newTouchPosition - this.touchStartPosition;

    const calculated = Math.round(this.originalValue + (this.currentTouchPosition / 2));  
    const newValue = calculated < 0 ? 0 : calculated > 100 ? 100 : calculated;

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
  
    switch (device.type) {
      case 'value':
        let rect = getGlobalPosition(event.target);
        openOverlay({
          template: DeviceEditView,
          data: {
            ...device,
            inputType: 'range',
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
        message: "Could'nt connect to device",
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



}
export const DevicesService = new DevicesServiceClass();