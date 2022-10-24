import { submitDataChange, toggleServerDevice } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { closeOverlay, openOverlay } from "../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../popup-message/popup-message";

import DeviceEditView from './overlay-views/devices-edit.template.html?raw';
import { TabContentBind } from "../tab-content";

export const HomeService = {
  deviceTouchStart,
  deviceTouchEnd,
  saveNameById
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
  toggleServerDevice(device).catch(() => {
    showToaster({
      message: "Could'nt connect to device",
      from: "bottom",
      timer: 2000,
    });
    device.value = false;
  });
}

function saveNameById(data: any) {
  let element: HTMLInputElement | null = document.getElementById(data.id) as HTMLInputElement;
  let name = element?.value;
  if (element && name) {
    submitDataChange(data.id, data.type, 'name', name).then(() => {
      let list = TabContentBind.data.home[data.type as 'devices' | 'sensors'];
      let original = list.find((item: any) => item.id === data.id);
      original.name = name;
      closeOverlay();
      showToaster({
        from: 'bottom',
        message: `Saved ${data.type.substring(0, data.type.length - 1)} name`,
        timer: 2000
      });
    });
  }
}