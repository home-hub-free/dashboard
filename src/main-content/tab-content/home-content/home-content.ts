import { BlindsConfigureActions, configureBlinds, submitDataChange, toggleServerDevice } from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import { openOverlay, OverlayModal } from "../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../popup-message/popup-message";

import DeviceEditView from './overlay-views/devices-edit.template.html?raw';
import { Bind } from "bindrjs";
import template from './home-content.html?raw';
import { Tabs } from "../../tabs/tabs";
// import { TabContentBind } from "../tab-content";

// export type BlindsConfigureActions = 'spin' | 'switch-direction' | 'home-position' | 'set-limit'

export const HomeService = {
  deviceTouchStart,
  deviceTouchMove,
  deviceTouchEnd,
  sensorTouchEnd,
  saveProp,
  updateDevice,
  saveOperationalRanges,
  removeOperationalRange,
  updateCameraSetting,
  configureBlinds: (device: any, action: BlindsConfigureActions) => {
    configureBlinds(device, action);
  }
};

class HomeContentClass {
  bind!: any;
  constructor() {}

  initView() {
    const { bind } = new Bind({
      id: 'home',
      template,
      bind: {
        activeTabId: Tabs.bind.activeTabId,
      },
      // onChange: (changes) => {
      //   console.log(changes)
      // }
    });

    this.bind = bind;
  }
}

export const HomeContent = new HomeContentClass();

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
    if (!originalValue) originalValue = parseInt(data.value);

    openOverlay({
      template: DeviceEditView,
      data: {
        ...data,
        type,
        inputType,
      },
      actions: HomeService,
      startRect: rect,
      padding: { x: 50, y: 80 }
    });
  }, 600);
}

export function deviceTouchMove(event: TouchEvent, device: any, type: string) {
  const newTouchPosition = event.touches[0][swipeOnAxis];
  currentTouchPosition = newTouchPosition - touchStartPosition;

  const calculated = Math.round(originalValue + (currentTouchPosition / 2));  
  const newValue = calculated < 0 ? 0 : calculated > 100 ? 100 : calculated;

  if (recordSwipe && device.type === 'value' && type === 'devices' && newValue >= 0 && newValue <= 100) {
    device.value = newValue;
    ((OverlayModal.bind.data as any).value) = newValue;
    if (newValue % 10 === 0) {
      updateDevice(device);
    }
  }
}

export function deviceTouchEnd(event: any, device: any) {
  if (recordSwipe && device.type === 'value') {
    event.preventDefault();
    event.stopImmediatePropagation();
    recordSwipe = false;
    originalValue = 0;
    setTimeout(() => {
      updateDevice(device);
    }, 50);
    return;
  }

  if (currentTimeout) clearTimeout(currentTimeout);

  if (recordSwipe && device.type === 'boolean') return;

  switch (device.type) {
    case 'value':
      let rect = getGlobalPosition(event.target);
      openOverlay({
        template: DeviceEditView,
        data: {
          ...device,
          type: 'devices',
          inputType: 'range',
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
    // TabContentBind.data.home.devices.forEach((device: any) => {
    //   /**
    //    * Find and update element props directly becasue BindrJS
    //    * still doesn't know how to override entire array elements
    //    */
    //   if (device.id === data.id) {
    //     device.manual = data.manual;
    //   }
    // });
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

export function updateCameraSetting(property: string, ip: string, value: string) {
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
      // let list = TabContentBind.data.home[data.type as 'devices' | 'sensors'];
      // let original = list.find((item: any) => item.id === data.id);
      // original[prop] = value;

      showToaster({
        from: 'bottom',
        message: `Saved ${data.type.substring(0, data.type.length - 1)} ${prop}`,
        timer: 2000
      });
    });
  }
}

function saveOperationalRanges(data: any) {
  let elements: HTMLInputElement[] = [
    document.getElementById(data.id + '_operationalRangesFrom') as HTMLInputElement,
    document.getElementById(data.id + '_operationalRangesTo') as HTMLInputElement,
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
    data.operationalRanges.push(range);
    submitDataChange(data.id, data.type, 'operationalRanges', data.operationalRanges);
  }
}

function removeOperationalRange(device: any, index: any) {
  if (device.operationalRanges.length === 1) {
    device.operationalRanges = [];
  } else {
    device.operationalRanges.splice(index, 1);
  }
  submitDataChange(device.id, 'devices', 'operationalRanges', device.operationalRanges);
}