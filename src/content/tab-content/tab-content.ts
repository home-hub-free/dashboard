import { Bind, DataChanges } from "bindrjs";
import template from "./tab-content.template.html?raw";
import HomeTemplate from "./home-menu/home-menu.template.html?raw";
import { HomeService } from "./home-menu/home-menu";

const menus: any = {
  home: {
    actions: HomeService,
    template: HomeTemplate,
  },
};

const TabContent = new Bind({
  id: "tab-content",
  template,
  bind: {
    activeMenuItemId: "",
    activeTabId: "",
    templates: {
      home: HomeTemplate,
    },
    actions: {},
    data: {},
  },
  onChange,
});
export const TabContentBind = TabContent.bind;

function onChange(changes: DataChanges) {
  switch (changes.property) {
    case "activeMenuItemId":
      onMenuChange(changes.newValue);
      break;
    case "activeTabId":
      onTabChange(changes.newValue);
      break;
  }
}

function onMenuChange(value: string) {
  setTimeout(() => {
    let menu = menus[value];
    TabContentBind.actions = menu.actions;
  }, 100);
}

function onTabChange(value: string) {
  // Overrida data here for the menu - tab combination
}
