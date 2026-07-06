import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import template from "./main-content.html?raw";
import { MainContentState } from "./main-content.model";
import { Tabs } from "../tabs/tabs";

class MainContentClass extends Component<MainContentState> {
  private unsubscribeMenuChange?: () => void;
  private unsubscribeWs?: () => void;

  mount() {
    this.createBind({
      id: 'main-content',
      template,
      bind: {
        header: 'Home',
        // The Home glance line ("N lights on · 25.7° indoors") was removed: it
        // duplicated state the device wall shows directly, and on mobile it stacked
        // right above the weather hero. Kept on the model as an empty string so the
        // :if-gated subtitle span simply never renders.
        subtitle: '',
        // Slim top banner while the hub socket is down — the app keeps rendering
        // last-known state, but the resident should know it may be stale.
        offline: false,
      },
      ready: () => {
        Tabs.mount();
      }
    });

    this.unsubscribeMenuChange = bus.on('menu:change', ({ menuName }) => {
      this.bind.header = menuName;
    });

    this.unsubscribeWs = bus.on('ws:status', ({ state }) => {
      this.bind.offline = state === 'disconnected';
    });
  }

  unmount() {
    this.unsubscribeMenuChange?.();
    this.unsubscribeWs?.();
  }
}

export const MainContent = new MainContentClass();
