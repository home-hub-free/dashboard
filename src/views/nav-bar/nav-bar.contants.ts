export interface IMenuItem {
  id: string;
  icon: string;
  name: string;
  subitems?: ISubItem[];
  expanded: boolean;
}

export interface ISubItem {
  name: string;
  icon?: string;
}

export const MenuItems: IMenuItem[] = [
  {
    id: "home",
    icon: "home-simple-door",
    name: "Home",
    expanded: true,
    subitems: [
      {
        name: "Favorites",
        icon: "star-outline",
      },
      {
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
    subitems: [],
  },
  {
    id: "rooms",
    icon: "bed",
    name: "Rooms",
    expanded: true,
    subitems: [],
  },
  {
    id: "automations",
    icon: "alarm",
    name: "Automations",
    expanded: true,
    subitems: []
  }
];
