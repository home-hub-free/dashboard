import { Bind } from "bindrjs";
import template from './home-menu.html?raw';
import { Tabs } from "../../tabs/tabs";
import { DevicesTab } from "./tabs/devices/devices-tab";
import { SensorsTab } from "./tabs/sensors/sensors-tab";
import { HomeMenuState } from "./home-menu.model";


class HomeContentClass {
  bind!: HomeMenuState;
  constructor() {}

  initView() {
    const { bind } = new Bind<HomeMenuState>({
      id: 'home',
      template,
      bind: {
        activeTabId: Tabs.bind.activeTabId,
      },
      ready: this.initTabView.bind(this)
    });
    this.bind = bind;
  }

  initTabView() {
    const id = this.bind.activeTabId;
    let view = null;
    switch (id) {
      case 'devices':
        view = DevicesTab;
        break;
      case 'sensors':
        view = SensorsTab;
    }
    if (view) view.initView();
  }
}
export const HomeContent = new HomeContentClass();
