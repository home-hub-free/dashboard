import { Bind, DataChanges } from "bindrjs";
import template from "./tab-content.template.html?raw";
import HomeTemplate from "./home-menu/home-menu.template.html?raw";
import AutomationTemplate from './automations-menu/automations-menu.template.html?raw';
import { HomeService } from "./home-menu/home-menu";
import { getEndPointData } from "../../utils/server-handler";

const menus: any = {
  home: {
    actions: HomeService,
  },
  automations: {
    actions: {},
  }
};

const TabContent = new Bind({
  id: "tab-content",
  template,
  bind: {
    activeMenuItemId: "",
    activeTabId: "",
    templates: {
      home: HomeTemplate,
      automations: AutomationTemplate
    },
    actions: {},
    data: {
      home: {
        devices: null,
        sensors: null,
      },
      automations: {
        effects: null
      }
    },
  },
  onChange,
});
export const TabContentBind = TabContent.bind;

export function loadEndpointData(endpoint: string) {
  getEndPointData(endpoint).then((data) => {
    let menu = TabContentBind.activeMenuItemId as 'home' | 'automations';
    let tab = TabContentBind.activeTabId;
    switch (menu) {
      case 'home':
        TabContentBind.data.home[tab as 'devices' | 'sensors'] = data;
        break;
      case 'automations':
        TabContentBind.data.automations[tab as 'effects'] = data;
        break;
    }
  });
}

function onChange(changes: DataChanges) {
  switch (changes.property) {
    case "activeMenuItemId":
      onMenuChange(changes.newValue);
      break;
    case "activeTabId":
      // onTabChange(changes.newValue);
      break;
  }
}

function onMenuChange(value: string) {
  setTimeout(() => {
    let menu = menus[value];
    TabContentBind.actions = menu.actions;
  }, 100);
}
