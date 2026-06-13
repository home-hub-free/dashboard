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
  onTileClick: (device: Device) => void;
  onEvapToggle: (event: Event, prop: "fan" | "water", device: Device) => void;
  onSliderInput: (event: Event, device: Device) => void;
  onSliderCommit: (event: Event, device: Device) => void;
  stop: (event: Event) => void;
  onEditClick: (event: any, device: Device) => void;
};
