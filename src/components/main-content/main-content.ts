import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import template from "./main-content.html?raw";
import { MainContentState } from "./main-content.model";
import { Tabs } from "../tabs/tabs";

class MainContentClass extends Component<MainContentState> {
  private unsubscribeMenuChange?: () => void;

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
      },
      ready: () => {
        Tabs.mount();
      }
    });

    this.unsubscribeMenuChange = bus.on('menu:change', ({ menuName }) => {
      this.bind.header = menuName;
    });
  }

  unmount() {
    this.unsubscribeMenuChange?.();
  }
}

export const MainContent = new MainContentClass();
