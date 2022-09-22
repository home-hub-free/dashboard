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
        id: 'favorites',
        name: "Favorites",
        icon: "star-outline",
      },
      {
        id: 'recents',
        name: "Recents",
        icon: "clock"
      }
    ],
  },
  {
    id: "devices",
    icon: "xray-view",
    name: "Devices",
    expanded: true,
    activeTabIndex: -1,
    subitems: [],
  },
  {
    id: "rooms",
    icon: "bed",
    name: "Rooms",
    expanded: true,
    activeTabIndex: -1,
    subitems: [],
  },
  {
    id: "automations",
    icon: "alarm",
    name: "Automations",
    expanded: true,
    activeTabIndex: -1,
    subitems: []
  }
];
