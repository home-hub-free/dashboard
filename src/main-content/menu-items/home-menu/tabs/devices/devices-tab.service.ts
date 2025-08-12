import {
  openOverlay,
  OverlayModal,
} from "../../../../../overlay-modal/overlay-modal";
import { showToaster } from "../../../../../popup-message/popup-message";
import {
  BlindsConfigureActions,
  headers,
  server,
  submitDataChange,
  toggleServerDevice,
} from "../../../../../utils/server-handler";
import { getGlobalPosition } from "../../../../../utils/utils.service";
import DeviceEditView from "../../overlay-views/devices-edit.template.html?raw";
import { DevicesTab } from "./devices-tab";
import { Device } from "./devices-tab.model";

const DeviceInputType: { [key in Device["deviceCategory"]]?: string } = {
  "evap-cooler": "button",
  "dimmable-light": "range",
  blinds: "range",
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
  swipeOnAxis: "clientX" | "clientY" = "clientX";
  currentTimeout: any;

  constructor() {}

  deviceTouchStart(event: any, device: Device) {
    const listElement = window.document.getElementById("tab-content");
    this.initialScroll = listElement?.scrollTop || 0;
    this.recordSwipe = false;

    let rect = getGlobalPosition(event.target);
    this.touchStartPosition = event.touches[0][this.swipeOnAxis];
    this.initialY = event.touches[0]["clientY"];

    let inputType: any = "text";
    if (device.type === "value") {
      inputType = DeviceInputType[device.deviceCategory];
    }

    const parsedRanges = this.parseOperationalRanges(device.operationalRanges);

    this.currentTimeout = setTimeout(() => {
      this.recordSwipe = true;
      if (!this.originalValue && device.deviceCategory === "evap-cooler") {
        this.originalValue = device.value;
      }

      if (!this.originalValue && device.deviceCategory !== "evap-cooler") {
        this.originalValue = parseInt(device.value);
      }

      openOverlay({
        template: DeviceEditView,
        data: {
          ...device,
          inputType,
          parsedRanges,
        },
        actions: this,
        startRect: rect,
        padding: { x: 6, y: 50 },
      });
    }, 600);
  }

  deviceTouchMove(event: TouchEvent, device: Device) {
    const newTouchPositionX: any = event.touches[0][this.swipeOnAxis];
    const newY = event.touches[0]["clientY"];

    this.currentTouchPosition = newTouchPositionX - this.touchStartPosition;
    this.currentY = Math.abs(newY - this.initialY);

    const listElement = window.document.getElementById("tab-content");
    this.scrollChange = Math.abs(
      listElement?.scrollTop || 0 - this.initialScroll,
    );

    const calculated = Math.round(
      this.originalValue + this.currentTouchPosition / 2,
    );
    const newValue = calculated < 0 ? 0 : calculated > 100 ? 100 : calculated;

    // Scroll threshold to avoid activating elements while scrolling
    if (this.scrollChange >= SCROLL_THRESHOLD) {
      clearTimeout(this.currentTimeout);
    }

    if (
      this.recordSwipe &&
      device.type === "value" &&
      newValue >= 0 &&
      newValue <= 100
    ) {
      device.value = newValue;
      (OverlayModal.bind.data as any).value = newValue;
      if (newValue % 10 === 0) {
        this.updateDevice(device);
      }
    }
  }

  deviceTouchEnd(event: any, device: Device) {
    if (this.recordSwipe && device.type === "value") {
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

    if (this.recordSwipe && device.type === "boolean") return;

    if (
      this.scrollChange >= SCROLL_THRESHOLD ||
      this.currentY >= SCROLL_THRESHOLD
    ) {
      this.scrollChange = 0;
      this.initialY = 0;
      this.currentY = 0;
      return;
    }

    const parsedRanges = this.parseOperationalRanges(device.operationalRanges);

    switch (device.type) {
      case "value":
        let rect = getGlobalPosition(event.target);
        let inputType = DeviceInputType[device.deviceCategory];

        openOverlay({
          template: DeviceEditView,
          data: {
            ...device,
            inputType,
            parsedRanges,
          },
          actions: this,
          startRect: rect,
          padding: { x: 6, y: 50 },
        });
        break;
      case "boolean":
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
            message: "Something went wrong",
            from: "bottom",
            timer: 2000,
          });
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

  updateEvapCoolerTarget(device: Device, operator: -1 | 1) {
    const current = device.value.target ?? 25;
    const target = current + 1 * operator;
    device.value.target = target;
    return fetch(server + "device-value-set", {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: device.id,
        value: device.value,
      }),
    }).then((res) => res.json());
  }

  saveProp(data: any, prop: string, value?: any) {
    if (value == null) {
      let element: HTMLInputElement | null = document.getElementById(
        data.id + `_${prop}`,
      ) as HTMLInputElement;
      value = element?.value;
      if (prop === "manual") {
        value = !element.checked;
      }
    }
    if (value !== undefined) {
      submitDataChange(data.id, "devices", prop, value).then(() => {
        showToaster({
          from: "bottom",
          message: `Saved device ${prop}`,
          timer: 2000,
        });
      });
    }
  }

  saveOperationalRanges(device: Device) {
    let elements: HTMLInputElement[] = [
      document.getElementById(
        device.id + "_operationalRangesFrom",
      ) as HTMLInputElement,
      document.getElementById(
        device.id + "_operationalRangesTo",
      ) as HTMLInputElement,
    ];

    const start = elements[0].value;
    const end = elements[1].value;
    const range = [start, end].join("-");

    if (!start || !end) {
      showToaster({
        from: "bottom",
        message: "Missing value in operational range time",
        timer: 3000,
      });
      return;
    }
    const startValue = parseInt(start.split(":").join(""));
    const endValue = parseInt(end.split(":").join(""));
    if (startValue > endValue) {
      showToaster({
        from: "bottom",
        message: "Invalid range",
        timer: 3000,
      });
      return;
    }

    device.operationalRanges.push(range);
    const parsedRanges = this.parseOperationalRanges(device.operationalRanges);
    OverlayModal.bind.data.parsedRanges = parsedRanges;

    submitDataChange(
      device.id,
      "devices",
      "operationalRanges",
      device.operationalRanges,
    );
  }

  removeOperationalRange(device: Device, index: any) {
    if (device.operationalRanges.length === 1) {
      device.operationalRanges = [];
    } else {
      device.operationalRanges.splice(index, 1);
    }

    const parsedRanges = this.parseOperationalRanges(device.operationalRanges);
    OverlayModal.bind.data.parsedRanges = parsedRanges;
    submitDataChange(
      device.id,
      "devices",
      "operationalRanges",
      device.operationalRanges,
    );
  }

  updateCameraSetting(property: string, ip: string, value: string) {
    return fetch("http://" + ip + ":81/settings", {
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

  parseOperationalRanges(operationalRanges: string[]) {
    const rangesForGraph: any = { am: [], pm: [] };

    function to12hLabelAndDecimal(hour24: number) {
      // Extract hour and minutes as integers
      const hourInt = Math.floor(hour24) % 24; // 0-23
      const minuteDecimal = hour24 - Math.floor(hour24);
      const minutes = Math.round(minuteDecimal * 60);

      // Convert to 12h hour for label
      let hour12 = hourInt % 12;
      if (hour12 === 0) hour12 = 12;

      // Format label with zero-padded HH:MM
      const labelHour = hour12.toString().padStart(2, "0");
      const labelMinutes = minutes.toString().padStart(2, "0");
      const label = `${labelHour}:${labelMinutes}`;

      // Decimal hour for graph (0 to 12 scale)
      const decimal = ((hourInt % 12) + minutes / 60).toFixed(2);

      return { label, decimal };
    }

    operationalRanges.forEach((rangeStr) => {
      const [startStr, endStr] = rangeStr.split("-");
      const [startH, startM] = startStr.split(":").map(Number);
      const [endH, endM] = endStr.split(":").map(Number);

      const start24 = startH + startM / 60;
      const end24 = endH + endM / 60;

      if (end24 <= 12) {
        // Fully AM
        rangesForGraph.am.push({
          start: to12hLabelAndDecimal(start24),
          end: to12hLabelAndDecimal(end24),
        });
      } else if (start24 >= 12) {
        // Fully PM
        rangesForGraph.pm.push({
          start: to12hLabelAndDecimal(start24),
          end: to12hLabelAndDecimal(end24),
        });
      } else {
        // Crosses noon - split into AM and PM parts
        rangesForGraph.am.push({
          start: to12hLabelAndDecimal(start24),
          end: { label: "12:00", decimal: 12 },
        });
        rangesForGraph.pm.push({
          start: { label: "12:00", decimal: 0 },
          end: to12hLabelAndDecimal(end24),
        });
      }
    });

    return rangesForGraph;
  }
}
export const DevicesService = new DevicesServiceClass();
