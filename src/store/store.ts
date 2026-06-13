import { Device } from '../views/home/devices/devices.model';
import { Sensor } from '../views/home/sensors/sensors.model';
import { AutoEffect } from '../views/automations/automations.model';

export type AppState = {
  devices: Device[];
  sensors: Sensor[];
  effects: AutoEffect[];
  activeMenuId: string;
  activeTabId: string;
};

type Listener<T> = (value: T) => void;

class Store {
  private state: AppState = {
    devices: [],
    sensors: [],
    effects: [],
    activeMenuId: '',
    activeTabId: '',
  };
  private listeners = new Map<keyof AppState, Set<Listener<any>>>();

  get<K extends keyof AppState>(key: K): AppState[K] {
    return this.state[key];
  }

  set<K extends keyof AppState>(key: K, value: AppState[K]) {
    this.state[key] = value;
    this.listeners.get(key)?.forEach(fn => fn(value));
  }

  subscribe<K extends keyof AppState>(key: K, listener: Listener<AppState[K]>): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener);
    return () => this.listeners.get(key)!.delete(listener);
  }
}

export const store = new Store();
