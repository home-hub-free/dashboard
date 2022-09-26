import { Bind, DataChanges } from "bindrjs";
import { getEndPointData, toggleServerDevice } from "../../server-handler";
import { ISubItem } from "../nav-bar/nav-bar.contants";
import { showToaster } from "../popup-message/popup-message";
import template from "./content-section.html?raw";

// Imports Content templates as raw strings
import HomeTemplate from "./templates/home-content.template.html?raw";

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
    activeIndicatorPosition: activeTabIndicator,
    templates: {
      home: HomeTemplate,
    },
    editModeModal: null,

    selectTab,
    deviceTouchStart,
    deviceTouchEnd,
    closeEditMode,
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
  if (changes.property === 'activeTabId') {
    if (bind.editModeModal) closeEditMode();
    // bind.editModeModal = null;
  }
}

function selectTab(tab: ISubItem, event?: TouchEvent) {
  bind.activeTabId = tab.id;
  if (tab.endpoint && !bind[tab.id]) {
    bind[tab.id] = [
      {
        name: 'light',
        id: '32902'
      }
    ]
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

let currentTimeout: NodeJS.Timeout;
function deviceTouchStart(event: any, data: any) {
  if (bind.editModeModal) return;
  let rect = event.target.getBoundingClientRect();

  currentTimeout = setTimeout(() => {
    // Starting point
    bind.editModeModal = {
      top: rect.top - 135 + 'px',
      left: rect.left - 8 + 'px',
      height: rect.height + 'px',
      width: rect.width + 'px',
      expand: false,
      id: data.id,
      header: data.name
    };
    // Wait for the edit-mode container to get those styles applied before expanding
    setTimeout(() => bind.editModeModal.expand = true, 50)
  }, 500);
}
function deviceTouchEnd(device: any) {
  if (currentTimeout) clearTimeout(currentTimeout);
  if (bind.editModeModal || bind.activeTabId === 'sensors') return;

  toggleServerDevice(device)
    .then((result) => {
      console.log(result);
    })
    .catch(() => {
    showToaster({
      message: 'Could\'nt connect to device',
      from: 'bottom',
      timer: 2000
    })
  })
}

function closeEditMode(event?: any) {
  // Goes back to origin position
  bind.editModeModal.expand = false;
  // Removes the edit-mode container entirely after animation is complete
  setTimeout(() => bind.editModeModal = null, 300);
  event?.preventDefault();
  event?.stopPropagation();
  event?.stopImmediatePropagation();
}

export function updateSensor(data: any) {
  let sensor = bind.sensors.find((sensor: any) => sensor.id === data.id);
  if (sensor) sensor.value = data.value;
}
