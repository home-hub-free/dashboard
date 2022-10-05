import { Tab } from "../content/tabs/tabs";

export interface NavBarState {
  activeMenuItemId: string,
  items: IMenuItem[],
  actions: { [key: string]: any }
}
export interface IMenuItem {
  id: string;
  icon: string;
  name: string;
  tabs?: Tab[];
  expanded: boolean;
  activeTabIndex: number,
}

export const NavBarItems: IMenuItem[] = [
  {
    id: "home",
    icon: "home-simple-door",
    name: "Home",
    expanded: true,
    activeTabIndex: -1,
    tabs: [
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
];
