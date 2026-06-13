import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import { store } from "../../store/store";
import template from './automations.html?raw';
import { AutomationsList } from "./automations-list/automations-list";

type AutomationsMenuState = {
  activeTabId: string;
};

class AutomationsContentClass extends Component<AutomationsMenuState> {
  private unsubscribeTabChange?: () => void;
  private activeView?: typeof AutomationsList;

  mount() {
    const activeTabId = store.get('activeTabId') || 'automations-list';
    this.createBind({
      id: 'automations',
      template,
      bind: {
        activeTabId: activeTabId,
      },
      ready: () => this.initTabView(activeTabId),
    });

    this.unsubscribeTabChange = bus.on('tab:change', ({ tabId }) => {
      this.bind.activeTabId = tabId;
      this.initTabView(tabId);
    });
  }

  unmount() {
    this.unsubscribeTabChange?.();
    this.activeView?.unmount();
  }

  private initTabView(tabId: string) {
    this.activeView?.unmount();
    switch (tabId) {
      case 'automations-list':
        this.activeView = AutomationsList;
        AutomationsList.mount();
        break;
    }
  }
}

export const AutomationsContent = new AutomationsContentClass();