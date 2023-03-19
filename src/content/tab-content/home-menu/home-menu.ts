import { submitDataChange, toggleServerDevice } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { openOverlay, OverlayModal } from "../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../popup-message/popup-message";

import DeviceEditView from './overlay-views/devices-edit.template.html?raw';
import { TabContentBind } from "../tab-content";

export const HomeService = {
  deviceTouchStart,
  deviceTouchMove,
  deviceTouchEnd,
  sensorTouchEnd,
  saveProp,
  updateDevice,
};

let originalValue = 0;
let touchStartPosition = 0;
let currentTouchPosition = 0;
let recordSwipe = false;
const swipeOnAxis = 'clientX';

let currentTimeout: any;
export function deviceTouchStart(event: any, data: any, type: string) {
  let rect = getGlobalPosition(event.target);
  touchStartPosition = event.touches[0][swipeOnAxis];
  let inputType: any = null;
  if (type === 'devices') {
    inputType = 'text';
    if (data.type === 'value') {
      inputType = 'range';
    }
  }
  currentTimeout = setTimeout(() => {
    recordSwipe = true;
    openOverlay({
      template: DeviceEditView,
      data: {
        ...data,
        type,
        inputType,
      },
      actions: HomeService,
      startRect: rect,
      padding: { x: 40, y: 80 }
    });
  }, 800);
}

export function deviceTouchMove(event: TouchEvent, device: any, type: string) {
  const newTouchPosition = event.touches[0][swipeOnAxis];
  currentTouchPosition = newTouchPosition - touchStartPosition;

  if (!originalValue) originalValue = parseInt(device.value);
  const calculated = Math.round(originalValue + (currentTouchPosition / 1.5));
  
  const newValue = calculated < 0 ? 0 : calculated > 100 ? 100 : calculated;

  if (recordSwipe && device.type === 'value' && type === 'devices' && newValue >= 0 && newValue <= 100) {
    device.value = newValue;
    ((OverlayModal.bind.data as any).value) = newValue.toString();
    // Avoid endpoint calls every change
    if (newValue % 10 === 0 || newValue === 0) {
      updateDevice(device);
    }
  }
}

export function deviceTouchEnd(event: any, device: any) {
  if (recordSwipe) {
    recordSwipe = false;
    originalValue = 0;
    updateDevice(device);
  }

  if (currentTimeout) clearTimeout(currentTimeout);

  switch (device.type) {
    case 'value':
      let rect = getGlobalPosition(event.target);
      openOverlay({
        template: DeviceEditView,
        data: {
          ...device,
          type: 'devices',
          inputType: 'rage',
        },
        actions: HomeService,
        startRect: rect,
        padding: { x: 40, y: 80 }
      });
      break;
    case 'boolean':
      // For immidiate feedback, update the value before the server call
      device.value = !device.value;
      updateDevice(device);
      break;

  }
}

export function updateDevice(device: any) {
  toggleServerDevice(device)
  .then(({data, success}) => {
    if (!success) {
      return showToaster({
        message: 'Something went wrong',
        from: 'bottom',
        timer: 2000,
      })
    }
    TabContentBind.data.home.devices.forEach((device: any) => {
      /**
       * Find and update element props directly becasue BindrJS
       * still doesn't know how to override entire array elements
       */
      if (device.id === data.id) {
        device.manual = data.manual;
      }
    });
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

export function sensorTouchEnd() {
  if (currentTimeout) clearTimeout(currentTimeout);
}

function saveProp(data: any, prop: string) {
  let element: HTMLInputElement | null = document.getElementById(data.id + `_${prop}`) as HTMLInputElement;
  let value: any = element?.value;
  if (prop === 'manual') {
    value = !element.checked;
  }
  if (element && value !== undefined) {
    submitDataChange(data.id, data.type, prop, value).then(() => {
      let list = TabContentBind.data.home[data.type as 'devices' | 'sensors'];
      let original = list.find((item: any) => item.id === data.id);
      original[prop] = value;

      showToaster({
        from: 'bottom',
        message: `Saved ${data.type.substring(0, data.type.length - 1)} ${prop}`,
        timer: 2000
      });
    });
  }
}