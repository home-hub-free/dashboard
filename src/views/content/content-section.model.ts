export interface IEditModeModal {
  left: string,
  top: string,
  height: string,
  width: string,
  expand: boolean,
  id: string,
  header: string
}

export interface IHomeHubDevice {
  id: string,
  name: string,
  value: any, // This should be a generic type in the future
  type: string,
  manual: boolean,
}

export interface IWSDeviceUpdate {
  id: string,
  value: any
}

export interface IHomeHubSensor {
  id: string,
  type: string,
  name: string,
  value: boolean
}

export interface IWSSensorUpdate {
  id: string,
  value: boolean
}


