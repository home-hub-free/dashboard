import { Bind } from "bindrjs";
import template from './automations-menu.html?raw';
import { Tabs } from "../../tabs/tabs";
import { AutomationsList } from "./tabs/automations-list/automations-list-tab";

class AutomationsContentClass {
  bind!: any;
  constructor() {}

  initView() {
    const { bind } = new Bind({
      id: 'automations',
      template,
      bind: {
        activeTabId: Tabs.bind.activeTabId,
      },
      ready: this.initTabView.bind(this),
    });

    this.bind = bind;
  }

  initTabView() {
    const id = this.bind.activeTabId;
    let view = null;
    switch (id) {
      case 'automations-list':
        view = AutomationsList;
        break;
    }
    if (view) view.initView();
  }
}

export const AutomationsContent = new AutomationsContentClass();