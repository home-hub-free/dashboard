import { Bind, DataChanges } from "bindrjs";
import { storageGet, storageSet } from "../../utils/utils.service";
import { TabContentBind } from "../tab-content/tab-content";
import template from './tabs.template.html?raw';

// type TabTypes = 'sensors' | 'devices' | 'auto' | 'assistant'

export interface Tab {
  id: string,
  name: string;
  icon?: string;
  endpoint?: string,
}

interface TabsModel {
  activeMenuItemId: string,
  activeTabId: string,
  activeIndicatorPosition: {
    left: string,
    width: string,
    height: string,
  },
  tabs: Tab[] | null,
  actions: any,
}

const Tabs = new Bind<TabsModel>({
  id: 'tabs',
  template,
  bind: {
    activeMenuItemId: '',
    activeTabId: '',
    activeIndicatorPosition: {
      left: "0px",
      width: "0px",
      height: "",
    },
    tabs: null,
    actions: {
      selectTab,
    }
  },
  onChange
});
export const TabsBind = Tabs.bind;

function onChange(changes: DataChanges) {
  if (changes.property === "tabs" && changes.newValue) {
    if (TabsBind.tabs.length) {
      const activeMenuTabs = storageGet('activeMenuTabs');
      if (activeMenuTabs[TabContentBind.activeMenuItemId]) {
        let tab = TabsBind.tabs.find((tab: any) => tab.id === activeMenuTabs[TabContentBind.activeMenuItemId])
        selectTab(tab);
      } else {
        selectTab(TabsBind.tabs[0]);
      }

      setTimeout(() => {
        let result = document.querySelector(".tab.active") as HTMLElement;
        if (result) moveActiveIndicatorToElement(result);
      }, 50);
    } else {
      resetActiveTab();
    }
  }
  if (changes.property === 'activeMenuItemId') {
    TabContentBind.activeMenuItemId = changes.newValue;
    localStorage.setItem('activeMenuItemId', changes.newValue);

  }
}

function selectTab(tab: Tab, event?: TouchEvent) {
  TabContentBind.activeTabId = tab.id;
  TabsBind.activeTabId = tab.id;
  let activeMenuTabs: any = storageGet('activeMenuTabs') || {};
  activeMenuTabs[TabsBind.activeMenuItemId] = tab.id;
  storageSet('activeMenuTabs', activeMenuTabs);
  if (event) {
    let target = event.target as HTMLElement;
    moveActiveIndicatorToElement(target);
  }
}

function resetActiveTab() {
  TabsBind.activeIndicatorPosition = {
    left: "0px",
    width: "0px",
    height: "",
  };
  TabContentBind.activeTabId = '';
}

function moveActiveIndicatorToElement(element: HTMLElement) {
  let rect = element.getBoundingClientRect();
  let parentScroll = element.parentElement?.scrollLeft || 0;
  TabsBind.activeIndicatorPosition.left = rect.x - 8 + parentScroll + "px";
  TabsBind.activeIndicatorPosition.width = rect.width + "px";
}