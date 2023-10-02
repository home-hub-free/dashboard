export type Device = {
  id: string
  deviceCategory: string
  manual: boolean
  name: string
  value: any
  type: 'boolean' | 'value'
  ip?: string
  operationalRanges: string[]
}

export type DeviceWSEvents = {
  'device-declare': (device: Device) => void
  'device-update': (device: Device) => void
}

export type DevicesTabState = {
  devices: Device[]
  deviceTouchStart: (event: any, device: Device) => void
  deviceTouchMove: (event: any, device: Device) => void
  deviceTouchEnd: (event: any, device: Device) => void
}