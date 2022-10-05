import { Bind } from "bindrjs";
import { NavBarItems, NavBarState } from "./nav-bar.contants";
import type { IMenuItem } from "./nav-bar.contants";
// import { ContentSection } from "../content/content-section";
import template from "./nav-bar.html";
import { Header } from "../content/header/header";
import { Tabs } from "../content/tabs/tabs";

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
  // Toggles menu in desktop mode
  // menuItem.expanded = !menuItem.expanded;
  bind.activeMenuItemId = menuItem.id;
  Header.bind.name = menuItem.name;

  Tabs.bind.tabs = menuItem.tabs;

}

// function updateContentSection(menuItem: IMenuItem) {
//   // ContentSection.bind.header = menuItem.name;
//   // ContentSection.bind.tabs = JSON.parse(JSON.stringify(menuItem.subitems));
//   // ContentSection.bind.activeMenuItemId = menuItem.id;
// }
