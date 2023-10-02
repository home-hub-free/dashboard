import { Bind } from "bindrjs";
import { NavBarItems, NavBarState } from "./nav-bar.contants";
import type { IMenuItem } from "./nav-bar.contants";
import template from "./nav-bar.html?raw";
import { MainContent } from "../main-content/main-content";
import { storageGet, storageSet } from "../utils/utils.service";
// import { Header } from "../main-content/header/header";
import { Tabs } from "../main-content/tabs/tabs";
import { Tab } from "../main-content/tabs/tabs.model";

/**
 * Nav Bar Handles navigation for bottom main menus
 */
class NavBarClass {

  bind!: NavBarState;
  private activeMenuItemId: string = storageGet('activeMenuItemId');

  constructor () {}

  initView() {
    const { bind } = new Bind<NavBarState>({
      id: "nav-bar",
      template,
      bind: {
        activeMenuItemId: this.activeMenuItemId || 'home',
        items: NavBarItems,
        setActiveNavBarItem: (i) => this.setActiveNavBarItem(i),
      },
      ready: () => this.ready()
    });

    this.bind = bind as NavBarState;
  }
  
  ready() {
    let activeMenuItem: IMenuItem | null = NavBarItems.find((menuItem) => menuItem.id === this.activeMenuItemId) || null;
    if (activeMenuItem) {
      this.setActiveNavBarItem(activeMenuItem);
    } else {
      // Initialize with first NavBar item (HOME)
      this.setActiveNavBarItem(NavBarItems[0]);
    }
  }
  
  private setActiveNavBarItem(menuItem: IMenuItem) {
    this.bind.activeMenuItemId = menuItem.id;
    MainContent.bind.header = menuItem.name;
    Tabs.tabs = menuItem.tabs as Tab[];
    if (Tabs.bind) {
      Tabs.bind.tabs = menuItem.tabs as Tab[];
    }
    
    storageSet('activeMenuItemId', menuItem.id);
  }
}

export const NavBar = new NavBarClass();
