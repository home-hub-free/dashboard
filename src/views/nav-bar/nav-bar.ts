import { Bind } from "bindrjs";
import template from "./nav-bar.html";

interface IItem {
  icon: string,
  name: string
}

const MenuItems: IItem[] = [
  {
    icon: "home-simple-door",
    name: "Home",
  },
  {
    icon: "xray-view",
    name: "Devices",
  },
];

export const NavBar = new Bind({
  id: "nav-bar",
  template,
  bind: {
    items: MenuItems,
    test: "hi",
  },
});
