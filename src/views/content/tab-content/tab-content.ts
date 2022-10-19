import { Bind, DataChanges } from "bindrjs";
import template from "./tab-content.template.html?raw";
import HomeTemplate from "./home-menu/home-menu.template.html?raw";
import { HomeService } from "./home-menu/home-menu";

const menus: any = {
  home: {
    actions: HomeService,
    template: HomeTemplate,
  }
}

const TabContent = new Bind({
  id: "tab-content",
  template,
  bind: {
    activeMenuItemId: "",
    activeTabId: "",
    devices: null,
    sensors: null,

    templates: {
      home: HomeTemplate
    },
    actions: {},
  },
  onChange,
});
export const TabContentBind = TabContent.bind;

function onChange(changes: DataChanges) {
  if (changes.property === 'activeMenuItemId') {
    setTimeout(() => {
      let menu = menus[changes.newValue];
      TabContentBind.template = menu.template;
      TabContentBind.actions = menu.actions;
    }, 100);
  }
}