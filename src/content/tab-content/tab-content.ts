import { Bind } from "bindrjs";
import template from "./tab-content.template.html?raw";
import HomeTemplate from "./home-menu/home-menu.template.html?raw";
import AutomationTemplate from './automations-menu/automations-menu.template.html?raw';
import { HomeService } from "./home-menu/home-menu";
import { getEndPointData } from "../../utils/server-handler";
import { AutomationsActions } from "./automations-menu/automations-menu";
import { IMenuItem, NavBarItems } from "../../nav-bar/nav-bar.contants";

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
    actions: {
      home: HomeService,
      automations: AutomationsActions
    },
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
  ready,
});
export const TabContentBind = TabContent.bind;

function ready() {
  NavBarItems.forEach((item: IMenuItem) => {
    (item.tabs || []).forEach(async({ endpoint, id }) => {
      let bind: any = TabContentBind;
      bind.data[item.id][id] = await getEndPointData(endpoint || '');;
    });
  })
}
