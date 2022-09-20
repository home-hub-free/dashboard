import { Bind } from "bindrjs";
import { MenuItems } from "./nav-bar.contants";
import type { IMenuItem } from "./nav-bar.contants";
import template from "./nav-bar.html";

export const NavBar = new Bind({
  id: "nav-bar",
  template,
  bind: {
    // Properties
    items: MenuItems,

    // Functions
    setActiveMenuItem
  },
});

function setActiveMenuItem(menuItem: IMenuItem) {
  // Toggles menu in desktop mode
  menuItem.expanded = !menuItem.expanded;
}
