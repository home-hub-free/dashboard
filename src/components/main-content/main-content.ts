import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import { store } from "../../store/store";
import template from "./main-content.html?raw";
import { MainContentState } from "./main-content.model";
import { Tabs } from "../tabs/tabs";
import { Device } from "../../views/home/devices/devices.model";
import { Sensor } from "../../views/home/sensors/sensors.model";

class MainContentClass extends Component<MainContentState> {
  private unsubscribeMenuChange?: () => void;
  private unsubscribeDevices?: () => void;
  private activeMenuId = 'home';

  mount() {
    this.createBind({
      id: 'main-content',
      template,
      bind: {
        header: 'Home',
        subtitle: '',
      },
      ready: () => {
        Tabs.mount();
        this.updateSummary();
      }
    });

    this.unsubscribeMenuChange = bus.on('menu:change', ({ menuId, menuName }) => {
      this.activeMenuId = menuId;
      this.bind.header = menuName;
      this.updateSummary();
    });

    // Keep the header summary live as devices change.
    this.unsubscribeDevices = store.subscribe('devices', () => this.updateSummary());
  }

  unmount() {
    this.unsubscribeMenuChange?.();
    this.unsubscribeDevices?.();
  }

  /** A short, glanceable status line shown under the title on the Home view. */
  private updateSummary() {
    if (!this.mounted) return;
    if (this.activeMenuId !== 'home') {
      this.bind.subtitle = '';
      return;
    }

    const devices = store.get('devices') as Device[];
    const sensors = store.get('sensors') as Sensor[];

    const lightsOn = devices.filter(
      (d) =>
        (d.deviceCategory === 'light' && d.value) ||
        (d.deviceCategory === 'dimmable-light' && d.value > 0)
    ).length;

    const temps = sensors
      .filter((s) => s.sensorType === 'temp/humidity' && s.value?.temperature)
      .map((s) => parseFloat(s.value.temperature));

    const parts: string[] = [];
    parts.push(lightsOn === 0 ? 'All lights off' : `${lightsOn} light${lightsOn > 1 ? 's' : ''} on`);
    if (temps.length) {
      const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
      parts.push(`${avg.toFixed(1)}° indoors`);
    }
    this.bind.subtitle = parts.join('  ·  ');
  }
}

export const MainContent = new MainContentClass();
