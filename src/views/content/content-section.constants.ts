export const ContentIdEndpoint: { [key: string]: string} = {
  devices: 'get-devices',
  rooms: 'get-room-states',
  automations: 'get-daily-events'
}

interface Setting {
  id: string,
  display: string,
  icon: string,
  action?: () => void
}

export const ContentSettings: { [key: string]: Setting[] } = {
  rooms: [
    {
      id: 'new-room',
      display: 'Add New Room',
      icon: 'plus',
      action: () => {
        console.log('Hello from new room')
      }
    },
    {
      id: 'edit-room',
      display: 'Edit Room',
      icon: 'edit',
      action: () => {}
    }
  ]
}