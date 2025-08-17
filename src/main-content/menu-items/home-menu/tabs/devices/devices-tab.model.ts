export type Device = {
  id: string;
  deviceCategory:
    | "light"
    | "evap-cooler"
    | "dimmable-light"
    | "blinds"
    | "camera";
  manual: boolean;
  name: string;
  value: any;
  type: "boolean" | "value";
  ip?: string;
  operationalRanges: string[];
};

export type DeviceWSEvents = {
  "device-declare": (device: Device) => void;
  "device-update": (device: Device) => void;
};

export type DevicesTabState = {
  devices: Device[];
  onDeviceSliderChange: (event: Event, device: Device) => void;
  onDeviceToggleChange: (event: any, device: Device) => void;
  onEvapCoolerToggleClick: (prop: "fan" | "water", device: Device) => void;
  onManualToggleClick: (event: any, device: Device) => void;
  onEditClick: (event: any, device: Device) => void;
  triggerDeviceUpdate: (event: any, device: Device) => void;
};
