import { DataChanges } from "bindrjs";
import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import { store } from "../../store/store";
import { NavActions } from "../../store/actions";
import { storageGet, storageSet } from "../../utils/utils.service";
import template from './tabs.template.html?raw';
import { Tab, TabsState } from "./tabs.model";
import { TabContent } from "../menu-content/menu-content";
import { NavBar } from "../nav-bar/nav-bar";

class TabsClass extends Component<TabsState> {
  private tabs: Tab[] = [];
  private unsubscribeMenuChange?: () => void;

  mount() {
    this.createBind({
      id: 'tabs',
      template,
      bind: {
        activeTabId: '',
        activeIndicatorPosition: {
          left: "0px",
          width: "0px",
          height: "",
        },
        tabs: this.tabs,
        selectTab: this.selectTab.bind(this)
      },
      onChange: (changes) => this.onChange(changes),
      ready: () => this.ready(),
    });

    this.unsubscribeMenuChange = bus.on('menu:change', ({ tabs, menuId }) => {
      this.tabs = tabs;
      this.bind.tabs = tabs;
      this.setActiveTabForActiveMenu(menuId);
    });

    // Emit initial menu:change if NavBar is already mounted
    const activeMenuItem = NavBar.getActiveMenuItem();
    if (activeMenuItem) {
      bus.emit('menu:change', {
        menuId: activeMenuItem.id,
        menuName: activeMenuItem.name,
        tabs: activeMenuItem.tabs || []
      });
    }
  }

  unmount() {
    this.unsubscribeMenuChange?.();
  }

  ready() {
    const activeMenuId = store.get('activeMenuId');
    this.setActiveTabForActiveMenu(activeMenuId);
    TabContent.initView();
  }

  onChange(changes: DataChanges) {
    switch (<keyof TabsState>(changes.property)) {
      case 'tabs':
        const activeMenuId = store.get('activeMenuId');
        this.setActiveTabForActiveMenu(activeMenuId);
        TabContent.initView();
        break;
      case 'activeTabId':
        TabContent.initView();
    }
  }

  private setActiveTabForActiveMenu(activeMenuId: string) {
    const activeMenuTabs = storageGet('activeMenuTabs') || {};
    const tabId = activeMenuTabs[activeMenuId];
    if (tabId) {
      this.bind.activeTabId = tabId;
      bus.emit('tab:change', { tabId });
    }
    setTimeout(() => {
      const result = document.querySelector(".tab.active") as HTMLElement;
      if (result) this.moveActiveIndicatorToElement(result);
    }, 50);
  }

  selectTab(tab: Tab, event?: Event) {
    this.bind.activeTabId = tab.id;
    const activeMenuId = store.get('activeMenuId');
    const activeMenuTabs: any = storageGet('activeMenuTabs') || {};
    activeMenuTabs[activeMenuId] = tab.id;
    storageSet('activeMenuTabs', activeMenuTabs);
    NavActions.setTab(tab.id);
    bus.emit('tab:change', { tabId: tab.id });
    if (event) {
      const target = event.target as HTMLElement;
      this.moveActiveIndicatorToElement(target);
    }
  }

  resetActiveTab() {
    this.bind.activeIndicatorPosition = {
      left: "0px",
      width: "0px",
      height: "0px",
    };
    this.bind.activeTabId = '';
  }

  private moveActiveIndicatorToElement(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const parentScroll = element.parentElement?.scrollLeft || 0;
    this.bind.activeIndicatorPosition.left = rect.x + parentScroll + "px";
    this.bind.activeIndicatorPosition.width = rect.width + "px";
  }
}

export const Tabs = new TabsClass();
