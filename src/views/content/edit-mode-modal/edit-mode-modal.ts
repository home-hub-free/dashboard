// import { getDeviceProgrammableActions } from '../../../server-handler';
import {
  getDeviceProgrammableActions,
  getEndPointData,
} from "../../../utils/server-handler";
import template from "./edit-mode-modal.template.html?raw";

const effectss = [
  {
    name: "Sensor",
    id: "sensor",
    options: [
      {
        name: "Motion detected",
        id: "motion-started",
        value: "true",
      },
      {
        name: "Stops detecting motion",
        id: "motion-stoped",
        value: "false",
      },
    ],
  },
  {
    name: "Time of day",
    id: "time-of-day",
    options: [
      {
        name: "Time",
        id: "time",
        value: 0,
      },
    ],
  },
];

export function EditModeModal(bind: any) {
  bind.modal = {
    template,
    open,
    close,
  };
  const modal = bind.modal;

  function open(startPosition: any, data: any) {
    modal.visible = true;
    modal.expand = false;
    modal.position = startPosition;
    modal.id = data.id;
    modal.type = bind.activeTabId;
    modal.header = data.name;
    modal.effects = [];
    modal.view = null;
    modal.effects = effectss;
    if (bind.activeTabId === "devices" && !bind.sensors) {
      getDeviceProgrammableActions(data.id).then((actions) => {
        loadNecessaryActionsData(actions);
        if (actions.length) {
          modal.actions = actions;
        } else {
          modal.actions = [];
        }
      });
    }
    // Wait for the edit-mode container to get those styles applied before expanding
    setTimeout(() => (modal.expand = true), 1);
  }

  function close() {
    modal.expand = false;
    modal.id = null;
    setTimeout(() => {
      modal.visible = false;
    }, 300);
  }

  function loadNecessaryActionsData(actions: any[]) {
    let hasSensorActions = actions.find(
      (action: any) => action.when.type === "sensor"
    );
    let hasDailyActions = actions.find(
      (actions: any) => actions.when.type === "time-of-day"
    );
    if (hasSensorActions) {
      getEndPointData("get-sensors").then((data) => {
        if (data) bind.sensors = data;
      });
    }
    if (hasDailyActions) {
      getEndPointData("get-daily-events").then((data) => (data ? bind.daily = data : null));
    }
  }
}
