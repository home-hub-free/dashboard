import { Bind, DataChanges } from "bindrjs";
import { server } from "../../contants";
import { ISubItem } from "../nav-bar/nav-bar.contants";
import {
  ContentIdEndpoint,
  ContentSettings,
} from "./content-section.constants";
import template from "./content-section.html?raw";

// Imports Content templates as raw strings
import HomeTemplate from "./templates/home-content.template.html?raw";
import DevicesTemplate from "./templates/devices-content.template.html?raw";
import RoomsTemplate from "./templates/rooms-content.template.html?raw";
import AutomationTemplate from "./templates/automations-content.template.html?raw";

const activeTabIndicator = {
  left: "0px",
  width: "0px",
  height: "",
};

export const ContentSection = new Bind({
  id: "content",
  template,
  bind: {
    activeTab: "",
    activeMenuItemId: "",
    header: "",
    tabs: [],
    settings: [],
    settingsExpanded: false,
    activeIndicatorPosition: activeTabIndicator,

    templates: {
      home: HomeTemplate,
      devices: DevicesTemplate,
      rooms: RoomsTemplate,
      automations: AutomationTemplate,
    },

    selectTab,
    expandSettings,
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

  if (changes.property === "activeMenuItemId") {
    if (!bind.tabs.length) {
      getServerData(bind.activeMenuItemId);
    }
    if (ContentSettings[bind.activeMenuItemId]) {
      bind.settings = ContentSettings[bind.activeMenuItemId];
    } else {
      bind.settingsExpanded = false;
      setTimeout(() => {
        bind.settings = [];
      }, 200);
    }
  }
}

function selectTab(tab: ISubItem, event?: TouchEvent) {
  bind.activeTab = tab.name;
  // getServerData(tab.id);
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
  });
}

function getServerData(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ContentIdEndpoint[id]) {
      return reject("No endpoint implemented for id: " + id);
    } else {
      return fetch(server + ContentIdEndpoint[id], {
        method: "GET",
      })
        .then((res) => res.json())
        .then((data) => {
          console.log('Data for: ', id);
          console.log(data);
          if (id === 'rooms' && data && data.length) {
            bind.tabs = data.map((room: any) => {
              return {
                id: room.room,
                name: room.room
              }
            });
          }
          if (id === 'automations' && data && data.length) {
            bind.automations = data;
          }
          if (id === 'devices' && data && data.length) {
            bind.devices = data;
          }
        });
    }
  });
}





function expandSettings() {
  if (canToggleSettings()) {
    bind.settingsExpanded = !bind.settingsExpanded;
  }
}

function canToggleSettings(): boolean {
  return (
    bind.settingsExpanded || (!bind.settingsExpanded && bind.settings.length)
  );
}
