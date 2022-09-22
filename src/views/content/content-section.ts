import { Bind, DataChanges } from "bindrjs";
import { server } from "../../contants";
import { ISubItem } from "../nav-bar/nav-bar.contants";
import { ContentIdEndpoint } from "./content-section.constants";
import template from "./content-section.html";

import DevicesTemplate from "./templates/devices-content.html?raw";

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
      devices: DevicesTemplate
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
    loadContent(ContentSection.bind.activeMenuItemId);
  }
}

function selectTab(tab: ISubItem, event?: TouchEvent) {
  ContentSection.bind.activeTab = tab.name;
  loadContent(tab.id);

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

function loadContent(id: string) {
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
          ContentSection.bind.devices = data;
          // console.log(data);
        });
    }
  });
}

// function toggleDevice(device: any) {
//   device.value = !device.value;
//   return new Promise((resolve, reject) => {
//     return fetch(server + "manual-control", {
//       method: "POST",
//       headers: {
//         'Accept': 'application/json',
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify({
//         device: device.id,
//         value: device.value,
//       }),
//     })
//       .then((res) => res.json())
//       .then((result) => {
//         console.log(result);
//       })
//       .catch(err => {
//         console.log(err);
//       }) ;
//   });
// }
