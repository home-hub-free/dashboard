import { Bind, DataChanges } from "bindrjs";
import { TabContentBind } from "../tab-content/tab-content";
import template from './tabs.template.html?raw';

type TabTypes = 'sensors' | 'devices' | 'auto'

export interface Tab {
  id: TabTypes,
  name: string;
  icon?: string;
  endpoint?: string,
}

interface TabsModel {
  activeMenuItemId: string,
  activeIndicatorPosition: {
    left: string,
    width: string,
    height: string,
  },
  tabs: Tab[] | null,
  loading: boolean,
  actions: any,
}

const Tabs = new Bind<TabsModel>({
  id: 'tabs',
  template,
  bind: {
    activeMenuItemId: '',
    activeIndicatorPosition: {
      left: "0px",
      width: "0px",
      height: "",
    },
    tabs: null,
    loading: false,
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
      selectTab(TabsBind.tabs[0]);
      setTimeout(() => {
        let result = document.querySelector(".tab") as HTMLElement;
        if (result) moveActiveIndicatorToElement(result);
      }, 50);
    } else {
      resetActiveTab();
    }
  }
  if (changes.property === 'activeMenuItemId') {
    TabContentBind.activeMenuItemId = changes.newValue;
  }
}

function selectTab(tab: Tab, event?: TouchEvent) {
  TabContentBind.activeTabId = tab.id;
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