import { Bind, DataChanges } from "bindrjs";
import { server } from "../../contants";
import { ISubItem } from "../nav-bar/nav-bar.contants";
import { ContentIdEndpoint } from "./content-section.constants";
import template from "./content-section.html";

import DevicesTemplate from "./templates/devices-content.template.html?raw";
import HomeTemplate from './templates/home-content.template.html?raw';
import RoomsTemplate from './templates/rooms-content.template.html?raw';
import AutomationTemplate from './templates/automations-content.template.html?raw';

const activeTabIndicator = {
  top: "48px",
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
    activeIndicatorPosition: activeTabIndicator,

    templates: {
      devices: DevicesTemplate,
      home: HomeTemplate,
      rooms: RoomsTemplate,
      automations: AutomationTemplate
    },

    selectTab,
  },
  onChange,
});

function onChange(changes: DataChanges) {
  if (changes.property === "tabs") {
    // Select first available tab if there's any
    if (ContentSection.bind.tabs.length) {
      selectTab(ContentSection.bind.tabs[0]);
      setFirstTabAsActive();
    } else {
      resetActiveTab();
    }
  }

  if (
    changes.property === "activeMenuItemId" &&
    !ContentSection.bind.tabs.length
  ) {
    getServerData(ContentSection.bind.activeMenuItemId);
  }
}

function selectTab(tab: ISubItem, event?: TouchEvent) {
  ContentSection.bind.activeTab = tab.name;
  // getServerData(tab.id);

  if (event) {
    let target = event.target as HTMLElement;
    let rect = target.getBoundingClientRect();
    ContentSection.bind.activeIndicatorPosition.left = rect.x - 8 + "px";
    ContentSection.bind.activeIndicatorPosition.width = rect.width + "px";
  }
}

function resetActiveTab() {
  ContentSection.bind.activeIndicatorPosition = {
    top: "48px",
    left: "0px",
    width: "0px",
    height: "",
  };
  ContentSection.bind.activeTab = "";
}

function setFirstTabAsActive() {
  setTimeout(() => {
    let result = document.querySelector(".tab");
    if (result) {
      let rect = result.getBoundingClientRect();
      ContentSection.bind.activeIndicatorPosition.left = rect.x - 8 + "px";
      ContentSection.bind.activeIndicatorPosition.width = rect.width + "px";
    }
  }, 50);
}

function getServerData(id: string) {
  return new Promise((resolve, reject) => {
    if (!ContentIdEndpoint[id]) {
      reject("No endpoint implemented for id: " + id);
    } else {
      return fetch(server + ContentIdEndpoint[id], {
        method: "GET",
      })
        .then((res) => res.json())
        .then((data) => {
          console.log('Data for: ', id);
          console.log(data);
          if (id === 'rooms' && data && data.length) {
            ContentSection.bind.tabs = data.map((room: any) => {
              return {
                id: room.room,
                name: room.room
              }
            });
          }
          if (id === 'automations' && data && data.length) {
            ContentSection.bind.automations = data;
          }
          if (id === 'devices' && data && data.length) {
            ContentSection.bind.devices = data;
          }
        });
    }
  });
}