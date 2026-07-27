import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import { store } from "../../store/store";
import template from './automations.html?raw';
import { AutomationsList } from "./automations-list/automations-list";
import { DiscoveryReview } from "./discovery-review/discovery-review";

type AutomationsMenuState = {
  activeTabId: string;
  newAutomation: (event: MouseEvent) => void;
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
        // The "Add automation" CTA lives in the page header (above the suggestions + rule
        // list) so it's never buried; it delegates to the list view that owns the unified
        // creation overlay (EFFECT_CREATION_REPAIR D1 — one entry point, not two forks).
        newAutomation: (event: MouseEvent) => { if (AutomationsList.mounted) AutomationsList.openCreateAutomation(event); },
      },
      ready: () => this.initTabView(activeTabId),
    });

    this.unsubscribeTabChange = bus.on('tab:change', ({ tabId }) => {
      // Skip the redundant remount when the tab didn't actually change (the nav
      // burst re-announces the current tab — audit D12 amplifier).
      if (this.bind.activeTabId === tabId && this.activeView?.mounted) return;
      this.bind.activeTabId = tabId;
      this.initTabView(tabId);
    });
  }

  unmount() {
    this.unsubscribeTabChange?.();
    this.activeView?.unmount();
    if (DiscoveryReview.mounted) DiscoveryReview.unmount();
    super.unmount();
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