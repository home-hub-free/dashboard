import { Bind, DataChanges } from "bindrjs";
import { getEndPointData, toggleServerDevice } from "../../server-handler";
// import { server } from "../../contants";
import { ISubItem } from "../nav-bar/nav-bar.contants";
import { showToaster } from "../popup-message/popup-message";
// import {
//   ContentIdEndpoint,
//   ContentSettings,
// } from "./content-section.constants";
import template from "./content-section.html?raw";

// Imports Content templates as raw strings
import HomeTemplate from "./templates/home-content.template.html?raw";
// import DevicesTemplate from "./templates/devices-content.template.html?raw";
// import RoomsTemplate from "./templates/rooms-content.template.html?raw";
// import AutomationTemplate from "./templates/automations-content.template.html?raw";

const activeTabIndicator = {
  left: "0px",
  width: "0px",
  height: "",
};

export const ContentSection = new Bind({
  id: "content",
  template,
  bind: {
    activeTabId: "",
    activeMenuItemId: "",
    header: "",
    tabs: [],
    // settings: [],
    // settingsExpanded: false,
    activeIndicatorPosition: activeTabIndicator,

    templates: {
      home: HomeTemplate,
      // devices: DevicesTemplate,
      // rooms: RoomsTemplate,
      // automations: AutomationTemplate,
    },

    selectTab,
    toggleDevice,
    // expandSettings,
  },
  onChange,
});
const bind = ContentSection.bind;

function onChange(changes: DataChanges) {
  if (changes.property === "tabs") {
    // Select first available tab if there's any
    if (bind.tabs.length) {
      selectTab(bind.tabs[0]);
      setFirstTabAsActive();
    } else {
      resetActiveTab();
    }
  }
}

function selectTab(tab: ISubItem, event?: TouchEvent) {
  bind.activeTabId = tab.id;
  if (tab.endpoint && !bind[tab.id]) {
    loadTabServerData(tab.endpoint).then((data) => {
      bind[tab.id] = data;
    }).catch((err) => {
      showToaster({
        message: "Oops. Server seems offline",
        from: 'top',
        timer: 2000
      });
    });
  }
  if (event) {
    let target = event.target as HTMLElement;
    moveActiveIndicatorToElement(target);
  }
}

function moveActiveIndicatorToElement(element: HTMLElement) {
  let rect = element.getBoundingClientRect();
  let parentScroll = element.parentElement?.scrollLeft || 0;
  bind.activeIndicatorPosition.left = rect.x - 8 + parentScroll + "px";
  bind.activeIndicatorPosition.width = rect.width + "px";
}

function resetActiveTab() {
  bind.activeIndicatorPosition = {
    left: "0px",
    width: "0px",
    height: "",
  };
  bind.activeTab = "";
}

function setFirstTabAsActive() {
  setTimeout(() => {
    let result = document.querySelector(".tab") as HTMLElement;
    if (result) moveActiveIndicatorToElement(result);
  }, 50);
}

function loadTabServerData(endpoint: string) {
  bind.loading = true;
  return getEndPointData(endpoint).finally(() => (bind.loading = false));
}

function toggleDevice(device: any) {
  toggleServerDevice(device).catch(() => {
    showToaster({
      message: 'Could\'nt connect to device',
      from: 'bottom',
      timer: 1000
    })
  })
}

export function updateSensor(data: any) {
  let sensor = bind.sensors.find((sensor: any) => sensor.id === data.id);
  if (sensor) sensor.value = data.value;
}
