import { store } from './store';
import { Device } from '../views/home/devices/devices.model';
import { Sensor } from '../views/home/sensors/sensors.model';
import { Effect } from '../views/automations/automations.model';
import { storageGet, storageSet } from '../utils/utils.service';
import { NavBarItems } from '../components/nav-bar/nav-bar.constants';

export const DeviceActions = {
  load(devices: Device[]) {
    store.set('devices', devices);
  },
  declare(device: Device) {
    const devices = store.get('devices');
    if (!devices.find(d => d.id === device.id)) {
      store.set('devices', [...devices, device]);
    }
  },
  update(update: Partial<Device> & { id: string }) {
    const devices = store.get('devices');
    const device = devices.find(d => d.id === update.id);
    if (device) {
      Object.assign(device, update);
      store.set('devices', devices);
    }
  },
};

export const SensorActions = {
  load(sensors: Sensor[]) {
    store.set('sensors', sensors);
  },
  declare(sensor: Sensor) {
    const sensors = store.get('sensors');
    if (!sensors.find(s => s.id === sensor.id)) {
      store.set('sensors', [...sensors, sensor]);
    }
  },
  update(update: Partial<Sensor> & { id: string }) {
    const sensors = store.get('sensors');
    const sensor = sensors.find(s => s.id === update.id);
    if (sensor) {
      Object.assign(sensor, update);
      store.set('sensors', sensors);
    }
  },
};

export const EffectActions = {
  load(effects: Effect[]) {
    store.set('effects', effects);
  },
  add(effect: Effect) {
    store.set('effects', [...store.get('effects'), effect]);
  },
};

export const NavActions = {
  setMenu(menuId: string) {
    storageSet('activeMenuItemId', menuId);
    store.set('activeMenuId', menuId);
    // Restore the last active tab for this menu, or default to the first tab
    const savedTabs = storageGet('activeMenuTabs') || {};
    const menuItem = NavBarItems.find(m => m.id === menuId);
    const firstTabId = menuItem?.tabs?.[0]?.id || '';
    const tabId = savedTabs[menuId] || firstTabId;
    store.set('activeTabId', tabId);
  },
  setTab(tabId: string) {
    const menuId = store.get('activeMenuId');
    const savedTabs = storageGet('activeMenuTabs') || {};
    savedTabs[menuId] = tabId;
    storageSet('activeMenuTabs', savedTabs);
    store.set('activeTabId', tabId);
  },
};
