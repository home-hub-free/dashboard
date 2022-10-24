import { Bind, DataChanges } from "bindrjs";
import template from "./popup-message.html?raw";

type ToasterOptions = {
  from: "top" | "bottom" | "left" | "right";
  message: string;
  timer: number;
}

export const PopupMessage = new Bind({
  id: "popup-message-container",
  template,
  bind: {
    toasterOptions: null,
    popToast: false,
    hidingToaster: false,
    hideToaster,
  },
  onChange
});
const bind = PopupMessage.bind;
let currentTimeout: any;

function onChange(changes: DataChanges) {
  if (changes.property === 'message') {
    bind.popToast = true;
    setTimeout(() => {
      bind.popToast = false;
    }, 180);
  }
}

export function showToaster(options: ToasterOptions) {
  bind.toasterOptions = options;
  bind.toasterOptions.message = options.message;
  if (options.timer >= 0) {
    if (currentTimeout) clearTimeout(currentTimeout);
    currentTimeout = setTimeout(() => {
      hideToaster();
    }, options.timer);
  }
}

function hideToaster() {
  bind.hidingToaster = true;
  setTimeout(() => {
    bind.toasterOptions = null;
    bind.hidingToaster = false;
  }, 180);
}
