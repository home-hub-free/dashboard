import { Bind, DataChanges } from "bindrjs";
import {
  // getDeviceProgrammableActions,
  getEndPointData,
  submitDataChange,
  toggleServerDevice,
} from "../../utils/server-handler";
import { ISubItem } from "../nav-bar/nav-bar.contants";
import { showToaster } from "../popup-message/popup-message";
import { IEditModeModal, IHomeHubDevice } from "./content-section.model";
import template from "./content-section.template.html?raw";
import { EditModeModal } from "./edit-mode-modal/edit-mode-modal";
import HomeTemplate from "./templates/home-content.template.html?raw";

const activeTabIndicator = {
  left: "0px",
  width: "0px",
  height: "",
};
// const editModeModal: IEditModeModal | null = null;

const deviceActions: any = {
  boolean: [
    {
      description: "Turn on",
      value: "true",
    },
    {
      description: "Turn off",
      value: "false",
    },
  ],
  value: [
    {
      description: "Set value to",
      value: 0,
    },
  ],
};



const effects = {
  sensor: {
    motion: [
      {
        description: "Detects motion",
        value: true,
      },
      {
        description: "Stops detecting motion",
        value: false,
      },
    ],
    temperature: [
      {
        description: 'Higher than',
        value: 0
      },
      {
        description: 'Lower than',
        value: 0,
      }
    ]
  },
  daily: {},
};

// export const ContentSection = new Bind<any>({
//   id: "content",
//   // template,
//   bind: {
//     activeTabId: "sensors",
//     activeMenuItemId: "",
//     header: "",
//     tabs: [],
//     activeIndicatorPosition: activeTabIndicator,
//     templates: {
//       home: HomeTemplate,
//     },

//     loading: false,

//     devices: null,
//     sensors: null,

//     selectTab,
//     deviceTouchStart,
//     deviceTouchEnd,
//     headerNameKeyPress,
//     headerNameOnBlur,
//     addNewDeviceProgrammableAction,
//     buildAction,
//     submitAction,
//   },
//   onChange,
// });
// const bind = ContentSection.bind;
// EditModeModal(bind);

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

function selectTab(tab: ISubItem, event?: TouchEvent) {
  bind.activeTabId = tab.id;
  if (tab.id === 'sensors' || tab.id === 'devices' && tab.endpoint && !bind[tab.id]) {
    bind.loading = true;
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
  bind.activeTabId = '';
  // bind.activeTab = "";
}

let currentTimeout: NodeJS.Timeout;
function deviceTouchStart(event: any, data: any) {
  let rect = event.target.getBoundingClientRect();
  currentTimeout = setTimeout(() => {
    let startPosition = {
      top: rect.top - 135 + "px",
      left: rect.left - 8 + "px",
      height: rect.height + "px",
      width: rect.width + "px",
    };
    bind.modal.open(startPosition, data);
  }, 500);
}

function deviceTouchEnd(device: any) {
  if (currentTimeout) clearTimeout(currentTimeout);
  toggleServerDevice(device).catch(() => {
    showToaster({
      message: "Could'nt connect to device",
      from: "bottom",
      timer: 2000,
    });
  });
}

function headerNameKeyPress(event: KeyboardEvent) {
  let target = event.target as HTMLElement;
  if (event.code === "Enter") {
    headerNameOnBlur(event);
    target.blur();
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function headerNameOnBlur(event: any) {
  let target = event.target as HTMLElement;
  let id = bind.modal.id;
  let type: "device" | "sensor" =
    bind.activeTabId === "devices" ? "device" : "sensor";
  let value = target.innerText.trim();
  submitDataChange(id, type, "name", value).then(() => {
    let editing = bind[bind.activeTabId].find((item: any) => item.id === id);
    editing.name = value;
  });
}

function addNewDeviceProgrammableAction() {
  let device: IHomeHubDevice = bind.devices.find(
    (device: any) => bind.modal.id === device.id
  );

  if (!bind.sensors) {
    getEndPointData("get-sensors")
      .then((data) => {
        bind.sensors = data;
      })
      .catch(() => {
        showToaster({
          message: "Oops. Server seems offline",
          from: "top",
          timer: 2000,
        });
      });
  }

  bind.modal.actionOptions = deviceActions[device.type];
  bind.modal.currentAction = {
    set: {
      id: bind.modal.id,
    },
    when: {
      id: null,
      type: null,
      is: null,
    },
  };
  bind.modal.view = "new-action";
}

function buildAction(prop: string, event: any) {
  switch (prop) {
    case "value":
      bind.modal.currentAction.set.value = String(event.target.value);
      break;
    case "type":
      bind.modal.currentAction.when.type = event.target.value;
  }

  // Specific to sensor programmable actions
  if (bind.modal.currentAction.when.type === "sensor") {
    if (prop === "id") {
      bind.modal.currentAction.when.id = event.target.value;
    }
    if (prop === "sensor-value") {
      bind.modal.currentAction.when.is = event.target.value;
    }
  }
}

function submitAction() {
  let currentAction = bind.modal.currentAction;
  bind.modal.actions.push(currentAction);
  submitDataChange(
    currentAction.set.id,
    "sensor",
    "effects",
    bind.modal.actions
  );
}
