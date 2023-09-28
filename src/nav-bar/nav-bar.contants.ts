import { Tab } from "../main-content/tabs/tabs.model";

export interface NavBarState {
  activeMenuItemId: string,
  items: IMenuItem[],
  setActiveNavBarItem: (menuItem: IMenuItem) => void
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

  {
    id: 'automations',
    icon: 'hourglass',
    name: 'Your Automations',
    expanded: false,
    activeTabIndex: -1,
    tabs: [
      {
        id: 'auto',
        name: '',
        icon: '',
        endpoint: 'get-effects'
      }
    ]
  },
  {
    id: 'assistant',
    icon: 'hexagon',
    name: 'VAssistant',
    expanded: false,
    activeTabIndex: -1,
    tabs: [
      {
        id: 'info',
        name: 'Info',
        icon: '',
        endpoint: 'emma'
      }
    ]
  }
];
