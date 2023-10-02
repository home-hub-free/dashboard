import { Bind, DataChanges } from "bindrjs";
import { storageGet, storageSet } from "../../utils/utils.service";
// import { TabContentBind } from "../tab-content/tab-content";
import template from './tabs.template.html?raw';
import { Tab, TabsState } from "./tabs.model";
import { NavBar } from "../../nav-bar/nav-bar";
import { TabContent } from "../menu-items/menu-content";

/**
 * This view's only job is to display the tabs for the active manu
 */

class TabsClass {
  
  bind!: TabsState;
  tabs: Tab[] = [];

  constructor() {}

  initView() {
    const { bind } = new Bind<TabsState>({
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
    this.bind = bind as TabsState;
  }

  ready() {
    this.setActiveTabForActiveMenu();
    TabContent.initView();
  }

  onChange(changes: DataChanges) {
    switch (<keyof TabsState>(changes.property)) {
      case 'tabs':
        this.setActiveTabForActiveMenu();
        TabContent.initView();
      case 'activeTabId':
        TabContent.initView();
    }
  }

  setActiveTabForActiveMenu() {
    const activeMenuTabs = storageGet('activeMenuTabs');
    const activeMenuId = NavBar.bind.activeMenuItemId;
    this.bind.activeTabId = activeMenuTabs[activeMenuId];
    setTimeout(() => {
      let result = document.querySelector(".tab.active") as HTMLElement;
      if (result) this.moveActiveIndicatorToElement(result);
    }, 50);
  }

  selectTab(tab: Tab, event?: Event) {
    this.bind.activeTabId = tab.id;
    let activeMenuTabs: any = storageGet('activeMenuTabs') || {};
    const activeMenuId = NavBar.bind.activeMenuItemId;
    activeMenuTabs[activeMenuId] = tab.id;
    storageSet('activeMenuTabs', activeMenuTabs);
    if (event) {
      let target = event.target as HTMLElement;
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
  
  moveActiveIndicatorToElement(element: HTMLElement) {
    let rect = element.getBoundingClientRect();
    let parentScroll = element.parentElement?.scrollLeft || 0;
    this.bind.activeIndicatorPosition.left = rect.x + parentScroll + "px";
    this.bind.activeIndicatorPosition.width = rect.width + "px";
  }
}

export const Tabs = new TabsClass();
