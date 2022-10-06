import { Bind } from "bindrjs";
import { toggleServerDevice } from "../../../utils/server-handler";
import { showToaster } from "../../popup-message/popup-message";
// import { bind } from "../header/header";
import template from './tab-content.template.html?raw';
// import EditModeModal from "../edit-mode-modal/edit-mode-modal.template.html?raw";

export const TabContent = new Bind({
  id: 'tab-content',
  template,
  bind: {
    activeMenuItemId: '',
    activeTabId: '',
    devices: null,
    sensors: null,

    actions: {
      deviceTouchStart,
      deviceTouchEnd
    }
  }
});

let currentTimeout: NodeJS.Timeout;
function deviceTouchStart(event: any, data: any) {
  let rect = event.target.getBoundingClientRect();
  currentTimeout = setTimeout(() => {
    let startPosition = {
      top: rect.top - 135 + "px",
      left: rect.left - 8 + "px",
      height: rect.height + "px",
      width: rect.width + "px",
    };
  }, 500);
}

function deviceTouchEnd(device: any) {
  if (currentTimeout) clearTimeout(currentTimeout);
  toggleServerDevice(device).catch(() => {
    showToaster({
      message: "Could'nt connect to device",
      from: "bottom",
      timer: 2000,
    });
  });
}

export const TabContentBind = TabContent.bind;