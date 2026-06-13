import { initWebSockets } from "./utils/ws-handler";
import { MainContent } from "./components/main-content/main-content";
import { NavBar } from "./components/nav-bar/nav-bar";
import { getEndPointData } from "./utils/server-handler";
import { storageGet } from "./utils/utils.service";
import { DeviceActions, SensorActions, EffectActions, NavActions } from "./store/actions";
import { SensorsService } from "./views/home/sensors/sensors.service";

// CSS
import "./styles/style.scss";

async function loadInitialData() {
  try {
    const [devicesData, sensorsData, effectsData] = await Promise.all([
      getEndPointData('get-devices'),
      getEndPointData('get-sensors'),
      getEndPointData('get-effects'),
    ]);

    DeviceActions.load(devicesData);

    SensorsService.formatSensorsValues(sensorsData);
    SensorActions.load(sensorsData);

    EffectActions.load(effectsData);

    const activeMenuId = storageGet('activeMenuItemId') || 'home';
    NavActions.setMenu(activeMenuId);

    console.log('Initial data loaded:', { devices: devicesData.length, sensors: sensorsData.length, effects: effectsData.length });
  } catch (error) {
    console.error('Failed to load initial data:', error);
  }
}

async function init() {
  await loadInitialData();
  NavBar.mount();
  MainContent.mount();
  initWebSockets();
}

init();
