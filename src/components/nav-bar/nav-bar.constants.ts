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

// Top-level destinations. Each is a single glanceable view — no sub-tabs (the
// old per-item `tabs`/`endpoint` config was vestigial and is dropped). Order is
// the daily-use priority: control → automate → converse → administer.
export const NavBarItems: IMenuItem[] = [
  {
    // Home is a single glanceable dashboard — devices and sensors live together,
    // so the most common action (a light toggle) is one tap away.
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
    tabs: [],
  },
  {
    id: "assistant",
    icon: "sound-high",
    name: "Assistant",
    expanded: false,
    activeTabIndex: -1,
    tabs: [],
  },
  {
    // Account + household administration (relocated out of Assistant).
    id: "settings",
    icon: "settings",
    name: "Settings",
    expanded: false,
    activeTabIndex: -1,
    tabs: [],
  },
];
