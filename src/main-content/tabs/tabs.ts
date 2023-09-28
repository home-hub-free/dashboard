import { Bind, DataChanges } from "bindrjs";
import { storageGet, storageSet } from "../../utils/utils.service";
// import { TabContentBind } from "../tab-content/tab-content";
import template from './tabs.template.html?raw';
import { Tab, TabsModel } from "./tabs.model";
import { NavBar } from "../../nav-bar/nav-bar";
import { TabContent } from "../tab-content/tab-content";

class TabsClass {
  
  bind!: TabsModel;
  tabs: Tab[] = [];

  constructor() {}

  initView() {
    const { bind } = new Bind<TabsModel>({
      id: 'tabs',
      template,
      bind: {
        // activeMenuItemId: '',
        activeTabId: '',
        activeIndicatorPosition: {
          left: "0px",
          width: "0px",
          height: "",
        },
        tabs: this.tabs,
        actions: {
          selectTab: this.selectTab,
        }
      },
      onChange: (changes) => this.onChange(changes),
      ready: () => this.ready(),
    });
    this.bind = bind;
  }

  ready() {
    this.setActiveTabForActiveMenu();
    TabContent.initView();

    // const activeMenuTabs = storageGet('activeMenuTabs');
    // const activeMenu = NavBar.bind.activeMenuItemId;
    // this.bind.activeTabId = activeMenuTabs[activeMenu];
    // this.bind.tabs = tabs;
  }

  onChange(changes: DataChanges) {
    switch (<keyof TabsModel>(changes.property)) {
      case 'tabs':
        this.setActiveTabForActiveMenu();
        TabContent.initView();

        // const tabs = 
    }
    // if (changes.property === )
    // if (changes.property === "tabs" && changes.newValue) {
    //   if (this.bind.tabs && this.bind.tabs.length) {
    //     // const activeMenuTabs = storageGet('activeMenuTabs');
    //     // if (activeMenuTabs[TabContentBind.activeMenuItemId]) {
          // let tab = this.bind.tabs.find((tab: any) => tab.id === activeMenuTabs[TabContentBind.activeMenuItemId]) as Tab;
    //     //   this.selectTab(tab);
    //     // } else {
    //     //   this.selectTab(this.bind.tabs[0]);
    //     // }
  

    //   } else {
    //     this.resetActiveTab();
    //   }
    // }
    // if (changes.property === 'activeMenuItemId') {
    //   // TabContentBind.activeMenuItemId = changes.newValue;
    //   // localStorage.setItem('activeMenuItemId', changes.newValue);
  
    // }
  }

  setActiveTabForActiveMenu() {
    const activeMenuTabs = storageGet('activeMenuTabs');
    const activeMenuId = NavBar.bind.activeMenuItemId;
    this.bind.activeTabId = activeMenuTabs[activeMenuId];
    // let tab = this.bind.tabs.find((tab: any) => tab.id === activeMenuTabs[activeMenuId]) as Tab;
    setTimeout(() => {
      let result = document.querySelector(".tab.active") as HTMLElement;
      if (result) this.moveActiveIndicatorToElement(result);
    }, 50);
  }

  // loadMenuTabs() {}
  
  selectTab(tab: Tab, event?: TouchEvent) {
    // TabContentBind.activeTabId = tab.id;
    // this.bind.activeTabId = tab.id;
    // let activeMenuTabs: any = storageGet('activeMenuTabs') || {};
    // activeMenuTabs[this.bind.activeMenuItemId] = tab.id;
    // storageSet('activeMenuTabs', activeMenuTabs);
    // if (event) {
      // let target = event.target as HTMLElement;
      // this.moveActiveIndicatorToElement(target);
    // }
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
