import { Bind } from "bindrjs";
import { MenuItems } from "./nav-bar.contants";
import template from "./nav-bar.html";

export const NavBar = new Bind({
  id: "nav-bar",
  template,
  bind: {
    items: MenuItems,
    test: "hi",
  },
});
