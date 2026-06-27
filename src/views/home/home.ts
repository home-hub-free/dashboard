import { Component } from "../../core/component";
import template from './home.html?raw';
import { DevicesTab } from "./devices/devices";
import { SensorsTab } from "./sensors/sensors";
import { HomeStatus } from "./status/status";
import { HomeMenuState } from "./home.model";

/**
 * Home is the primary glanceable dashboard. Unlike the old design it does not
 * switch between a "Devices" and a "Sensors" tab — both are mounted at once so
 * the user sees everything and can act in a single tap.
 */
class HomeContentClass extends Component<HomeMenuState> {
  mount() {
    this.createBind({
      id: 'home',
      template,
      bind: {},
      ready: () => {
        HomeStatus.mount();
        SensorsTab.mount();
        DevicesTab.mount();
      }
    });
  }

  unmount() {
    HomeStatus.unmount();
    SensorsTab.unmount();
    DevicesTab.unmount();
  }
}
export const HomeContent = new HomeContentClass();
