import { Bind, DataChanges } from "bindrjs";
import { getEndPointData } from "../../../utils/server-handler";
import { showToaster } from "../../popup-message/popup-message";
import template from './tabs.template.html?raw';
// import { getEndpointData }

enum TabTypes {
  SENSORS = 'sensors',
  DEVICES = 'devices'
}

export interface Tab {
  id: TabTypes,
  name: string;
  icon?: string;
  endpoint?: string,
}

interface TabsModel {
  activeTabId: string
  activeIndicatorPosition: {
    left: string,
    width: string,
    height: string,
  },
  tabs: Tab[] | null,
  loading: boolean,
  sensors: [],
  devices: [],

  actions: any,

}

export const Tabs = new Bind<TabsModel>({
  id: 'tabs',
  template,
  bind: {
    activeTabId: '',
    activeIndicatorPosition: {
      left: "0px",
      width: "0px",
      height: "",
    },
    tabs: null,
    loading: false,

    sensors: [],
    devices: [],

    actions: {
      selectTab,
    }
  },
  onChange
});
const bind = Tabs.bind;

function onChange(changes: DataChanges) {
  if (changes.property === "tabs") {
    // Select first available tab if there's any
    if (bind.tabs.length) {
      selectTab(bind.tabs[0]);
      setTimeout(() => {
        let result = document.querySelector(".tab") as HTMLElement;
        if (result) moveActiveIndicatorToElement(result);
      }, 50);
    } else {
      resetActiveTab();
    }
  }
}

function selectTab(tab: Tab, event?: TouchEvent) {
  bind.activeTabId = tab.id;
  if (tab.endpoint && !bind[tab.id]) {
    // bind.loading = true;
    getEndPointData(tab.endpoint || '')
      .then((data) => {
        bind[tab.id] = data;
      })
      .catch(() => {
        showToaster({
          message: "Oops. Server seems offline",
          from: "top",
          timer: 2000,
        });
      })
      .finally(() => (bind.loading = false));
  }
  if (event) {
    let target = event.target as HTMLElement;
    moveActiveIndicatorToElement(target);
  }
}

function resetActiveTab() {
  bind.activeIndicatorPosition = {
    left: "0px",
    width: "0px",
    height: "",
  };
  bind.activeTabId = '';
}

function moveActiveIndicatorToElement(element: HTMLElement) {
  let rect = element.getBoundingClientRect();
  let parentScroll = element.parentElement?.scrollLeft || 0;
  bind.activeIndicatorPosition.left = rect.x - 8 + parentScroll + "px";
  bind.activeIndicatorPosition.width = rect.width + "px";
}