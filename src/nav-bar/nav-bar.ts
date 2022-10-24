import { Bind } from "bindrjs";
import { NavBarItems, NavBarState } from "./nav-bar.contants";
import type { IMenuItem } from "./nav-bar.contants";
import template from "./nav-bar.html?raw";
import { Header } from "../content/header/header";
import { TabsBind } from "../content/tabs/tabs";

export const NavBar = new Bind<NavBarState>({
  id: "nav-bar",
  template,
  bind: {
    activeMenuItemId: 'home',
    items: NavBarItems,
    actions: {
      setActiveMenuItem: setActiveNavBarItem
    }
  },
  ready
});
const bind = NavBar.bind;

// Bind ready
function ready() {
  // Initialize with first NavBar item (HOME)
  setActiveNavBarItem(NavBarItems[0]);
}

function setActiveNavBarItem(menuItem: IMenuItem) {
  bind.activeMenuItemId = menuItem.id;
  Header.bind.name = menuItem.name;
  TabsBind.activeMenuItemId = menuItem.id;
  TabsBind.tabs = menuItem.tabs;
}
