import { Bind, DataChanges } from "bindrjs";
import template from "./menu-content.html?raw";
import { VAssistantContent } from "./assistant-menu/assistant-menu";
import { NavBar } from "../../nav-bar/nav-bar";
import { AutomationsContent } from "./automations-menu/automations-menu";
import { HomeContent } from "./home-menu/home-menu";
import { MenuContentState } from "./menu-content.model";


class TabContentClass {

  bind!: MenuContentState;

  constructor() {}

  initView() {
    const { bind } = new Bind<MenuContentState>({
      id: "tab-content",
      template,
      bind: {
        activeMenuItemId: NavBar.bind.activeMenuItemId,
      },
      ready: () => {
        this.getTabContentView()?.initView();
      },
      onChange: (changes: DataChanges) => {
        switch (<keyof MenuContentState>changes.property) {
          case 'activeMenuItemId':
            this.getTabContentView()?.initView();
        }
      }
    });

    this.bind = bind as any;
  }

  getTabContentView() {
    switch (this.bind.activeMenuItemId) {
      case 'home':
        return HomeContent;
      case 'automations':
        return AutomationsContent;
      case 'assistant':
        return VAssistantContent;
    }

    return null;
  }
}

export const TabContent = new TabContentClass();
