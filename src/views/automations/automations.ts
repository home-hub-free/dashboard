import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import { store } from "../../store/store";
import template from './automations.html?raw';
import { AutomationsList } from "./automations-list/automations-list";
import { DiscoveryReview } from "./discovery-review/discovery-review";

type AutomationsMenuState = {
  activeTabId: string;
  newAutomation: (event: MouseEvent) => void;
  newMultiArmAutomation: (event: MouseEvent) => void;
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
        // The "New …" CTAs live in the page header (above the suggestions + rule list) so they're
        // never buried; they delegate to the list view that owns the authoring overlays.
        newAutomation: (event: MouseEvent) => { if (AutomationsList.mounted) AutomationsList.newAutomation(event); },
        newMultiArmAutomation: (event: MouseEvent) => { if (AutomationsList.mounted) AutomationsList.newMultiArmAutomation(event); },
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
    if (DiscoveryReview.mounted) DiscoveryReview.unmount();
  }

  private initTabView(tabId: string) {
    this.activeView?.unmount();
    if (DiscoveryReview.mounted) DiscoveryReview.unmount();
    switch (tabId) {
      case 'automations-list':
        // The discovered-patterns review panel sits above the rule list (same tab).
        DiscoveryReview.mount();
        this.activeView = AutomationsList;
        AutomationsList.mount();
        break;
    }
  }
}

export const AutomationsContent = new AutomationsContentClass();