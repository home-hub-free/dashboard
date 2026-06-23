import { Tab } from "../tabs/tabs.model";

export interface NavBarState {
  activeMenuItemId: string;
  items: IMenuItem[];
  setActiveNavBarItem: (menuItem: IMenuItem) => void;
  wsState: 'connected' | 'disconnected' | 'syncing';
  refresh: () => void;
}

export interface IMenuItem {
  id: string;
  icon: string;
  name: string;
  tabs?: Tab[];
  expanded: boolean;
  activeTabIndex: number;
}

export const NavBarItems: IMenuItem[] = [
  {
    // Home is a single glanceable dashboard — devices and sensors live together,
    // no sub-tabs, so the most common action (a light toggle) is one tap away.
    id: "home",
    icon: "home-simple-door",
    name: "Home",
    expanded: true,
    activeTabIndex: -1,
    tabs: [],
  },

  {
    id: "automations",
    icon: "timer",
    name: "Automations",
    expanded: false,
    activeTabIndex: -1,
    tabs: [
      {
        id: "automations-list",
        name: "All",
        icon: "",
        endpoint: "get-effects",
      },
    ],
  },
  {
    id: "assistant",
    icon: "sound-high",
    name: "Assistant",
    expanded: false,
    activeTabIndex: -1,
    tabs: [
      {
        id: "info",
        name: "Info",
        icon: "",
        endpoint: "emma",
      },
    ],
  },
];
