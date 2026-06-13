import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import { NavBarItems, NavBarState } from "./nav-bar.constants";
import type { IMenuItem } from "./nav-bar.constants";
import template from "./nav-bar.html?raw";
import { storageGet, storageSet } from "../../utils/utils.service";
import { NavActions } from "../../store/actions";

class NavBarClass extends Component<NavBarState> {
  private activeMenuItemId: string = '';

  mount() {
    this.activeMenuItemId = storageGet('activeMenuItemId') || 'home';
    this.createBind({
      id: "nav-bar",
      template,
      bind: {
        activeMenuItemId: this.activeMenuItemId,
        items: NavBarItems,
        setActiveNavBarItem: (i) => this.setActiveNavBarItem(i),
      },
      ready: () => this.ready()
    });
  }

  ready() {
    const activeMenuItem: IMenuItem | null = NavBarItems.find((menuItem) => menuItem.id === this.activeMenuItemId) || null;
    if (activeMenuItem) {
      this.setActiveNavBarItem(activeMenuItem);
    } else {
      this.setActiveNavBarItem(NavBarItems[0]);
    }
  }

  private setActiveNavBarItem(menuItem: IMenuItem) {
    this.bind.activeMenuItemId = menuItem.id;
    storageSet('activeMenuItemId', menuItem.id);
    NavActions.setMenu(menuItem.id);
    this.emitMenuChange(menuItem);
  }

  private emitMenuChange(menuItem: IMenuItem) {
    bus.emit('menu:change', {
      menuId: menuItem.id,
      menuName: menuItem.name,
      tabs: menuItem.tabs || []
    });
  }

  getActiveMenuItem(): IMenuItem | null {
    return NavBarItems.find((item) => item.id === this.bind.activeMenuItemId) || null;
  }
}

export const NavBar = new NavBarClass();
