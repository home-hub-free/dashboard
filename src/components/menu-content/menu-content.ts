import { Bind, DataChanges } from "bindrjs";
import template from "./menu-content.html?raw";
import { VAssistantContent } from "../../views/assistant/assistant";
import { NavBar } from "../nav-bar/nav-bar";
import { AutomationsContent } from "../../views/automations/automations";
import { HomeContent } from "../../views/home/home";
import { SettingsContent } from "../../views/settings/settings";
import { MenuContentState } from "./menu-content.model";


class TabContentClass {

  bind!: MenuContentState;
  private activeView?: typeof HomeContent | typeof AutomationsContent | typeof VAssistantContent | typeof SettingsContent;

  constructor() {}

  initView() {
    const { bind } = new Bind<MenuContentState>({
      id: "tab-content",
      template,
      bind: {
        activeMenuItemId: NavBar.bind.activeMenuItemId,
      },
      ready: () => {
        this.switchMenuView();
      },
      onChange: (changes: DataChanges) => {
        switch (<keyof MenuContentState>changes.property) {
          case 'activeMenuItemId':
            this.switchMenuView();
        }
      }
    });

    this.bind = bind as any;
  }

  private switchMenuView() {
    this.activeView?.unmount();
    const view = this.getTabContentView();
    if (view) {
      this.activeView = view;
      view.mount();
    }
  }

  getTabContentView() {
    switch (this.bind.activeMenuItemId) {
      case 'home':
        return HomeContent;
      case 'automations':
        return AutomationsContent;
      case 'assistant':
        return VAssistantContent;
      case 'settings':
        return SettingsContent;
    }

    return null;
  }
}

export const TabContent = new TabContentClass();
