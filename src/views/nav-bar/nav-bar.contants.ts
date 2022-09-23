export interface IMenuItem {
  id: string;
  icon: string;
  name: string;
  subitems?: ISubItem[];
  expanded: boolean;
  activeTabIndex: number,
}

export interface ISubItem {
  id: string,
  name: string;
  icon?: string;
  endpoint?: string
}

export const MenuItems: IMenuItem[] = [
  {
    id: "home",
    icon: "home-simple-door",
    name: "Home",
    expanded: true,
    activeTabIndex: -1,
    subitems: [
      {
        id: 'devices',
        name: "Devices",
        icon: "star-outline",
        endpoint: 'get-devices',
      },
      {
        id: 'sensors',
        name: "Sensors",
        icon: "clock",
        endpoint: 'get-sensors'
      }
    ],
  },
  // {
  //   id: "devices",
  //   icon: "xray-view",
  //   name: "Devices",
  //   expanded: true,
  //   activeTabIndex: -1,
  //   subitems: [],
  // },
  // {
  //   id: "rooms",
  //   icon: "bed",
  //   name: "Rooms",
  //   expanded: true,
  //   activeTabIndex: -1,
  //   subitems: [],
  // },
  // {
  //   id: "automations",
  //   icon: "alarm",
  //   name: "Automations",
  //   expanded: true,
  //   activeTabIndex: -1,
  //   subitems: []
  // }
];
