import { Bind, DataChanges } from "bindrjs";
import { getEndPointData, toggleServerDevice } from "../../server-handler";
import { ISubItem } from "../nav-bar/nav-bar.contants";
import { showToaster } from "../popup-message/popup-message";
import { IEditModeModal } from "./content-section.model";
import template from "./content-section.template.html?raw";
import HomeTemplate from "./templates/home-content.template.html?raw";

const activeTabIndicator = {
  left: "0px",
  width: "0px",
  height: "",
};
const editModeModal: IEditModeModal | null = null

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
    editModeModal: editModeModal,
    devices: null,
    sensors: null,

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
      setTimeout(() => {
        let result = document.querySelector(".tab") as HTMLElement;
        if (result) moveActiveIndicatorToElement(result);
      }, 50);
    } else {
      resetActiveTab();
    }
  }
  if (changes.property === "activeTabId") {
    if (bind.editModeModal) closeEditMode(null, 10);
  }
}

function selectTab(tab: ISubItem, event?: TouchEvent) {
  bind.activeTabId = tab.id;
  if (tab.endpoint && !bind[tab.id]) {
    bind.loading = true;
    getEndPointData(tab.endpoint)
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

let currentTimeout: NodeJS.Timeout;
function deviceTouchStart(event: any, data: any) {
  if (bind.editModeModal) return;
  let rect = event.target.getBoundingClientRect();

  currentTimeout = setTimeout(() => {
    // Starting point
    bind.editModeModal = {
      top: rect.top - 135 + "px",
      left: rect.left - 8 + "px",
      height: rect.height + "px",
      width: rect.width + "px",
      expand: false,
      id: data.id,
      header: data.name,
    };
    // Wait for the edit-mode container to get those styles applied before expanding
    setTimeout(() => (bind.editModeModal.expand = true), 50);
  }, 500);
}
function deviceTouchEnd(device: any) {
  if (currentTimeout) clearTimeout(currentTimeout);
  if (bind.editModeModal || bind.activeTabId === "sensors") return;

  toggleServerDevice(device)
    .catch(() => {
      showToaster({
        message: "Could'nt connect to device",
        from: "bottom",
        timer: 2000,
      });
    });
}

function closeEditMode(event?: any, timer?: number) {
  // Goes back to origin position
  bind.editModeModal.expand = false;
  // Removes the edit-mode container entirely after animation is complete
  setTimeout(() => (bind.editModeModal = null), timer ? timer : 300);
  event?.preventDefault();
  event?.stopPropagation();
  event?.stopImmediatePropagation();
}