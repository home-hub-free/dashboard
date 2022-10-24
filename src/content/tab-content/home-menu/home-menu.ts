import { toggleServerDevice } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { openOverlay } from "../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../popup-message/popup-message";

import DeviceEditView from './overlay-views/devices-edit.template.html?raw';

export const HomeService = {
  deviceTouchStart,
  deviceTouchEnd
};

let currentTimeout: NodeJS.Timeout;
export function deviceTouchStart(event: any) {
  let rect = getGlobalPosition(event.target);
  currentTimeout = setTimeout(() => {
    openOverlay({
      template: DeviceEditView,
      data: {},
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
