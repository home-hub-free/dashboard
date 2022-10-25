import { submitDataChange, toggleServerDevice } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { closeOverlay, openOverlay } from "../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../popup-message/popup-message";

import DeviceEditView from './overlay-views/devices-edit.template.html?raw';
import { TabContentBind } from "../tab-content";

export const HomeService = {
  deviceTouchStart,
  deviceTouchEnd,
  saveProp,
};

let currentTimeout: any;
export function deviceTouchStart(event: any, data: any, type: string) {
  let rect = getGlobalPosition(event.target);
  currentTimeout = setTimeout(() => {
    openOverlay({
      template: DeviceEditView,
      data: {
        ...data,
        type
      },
      actions: HomeService,
      startRect: rect,
      padding: { x: 50, y: 200 }
    });
  }, 800);
}

export function deviceTouchEnd(device: any) {
  if (currentTimeout) clearTimeout(currentTimeout);
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
      if (device.id === data.id) {
        /**
         * Find and update element props directly becasue BindrJS
         * still doesn't know how to override entire array elements
         */
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
    device.value = false;
  });
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