import { Bind } from "bindrjs";
import { MenuItems } from "./nav-bar.contants";
import type { IMenuItem } from "./nav-bar.contants";
import { ContentSection } from "../content/content-section";
import template from "./nav-bar.html";

export const NavBar = new Bind({
  id: "nav-bar",
  template,
  bind: {
    activeMenuItemId: 'home',
    items: MenuItems,

    setActiveMenuItem
  },
  ready
});
const bind = NavBar.bind;

// Bind ready
function ready() {
  // Initialize with first Menu item (HOME)
  setActiveMenuItem(MenuItems[0]);
}

function setActiveMenuItem(menuItem: IMenuItem) {
  // Toggles menu in desktop mode
  menuItem.expanded = !menuItem.expanded;
  bind.activeMenuItemId = menuItem.id;
  updateContentSection(menuItem);
}

function updateContentSection(menuItem: IMenuItem) {
  ContentSection.bind.header = menuItem.name;
  ContentSection.bind.tabs = JSON.parse(JSON.stringify(menuItem.subitems));
  ContentSection.bind.activeMenuItemId = menuItem.id;
}
