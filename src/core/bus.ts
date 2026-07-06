import type { Tab } from '../components/tabs/tabs.model';
import type { Device } from '../views/home/devices/devices.model';
import type { Sensor } from '../views/home/sensors/sensors.model';
import type { ZoneOccupant, VisionCameraStatus } from '../utils/server-handler';

export type BusEvents = {
  'menu:change': { menuId: string; menuName: string; tabs: Tab[] };
  'tab:change': { tabId: string };
  'device:update': Device;
  'device:declare': Device;
  'sensor:update': Sensor;
  'sensor:declare': Sensor;
  // Per-zone occupancy/identity from the vision-service (replaces the old per-frame
  // camera blob feed) — drives the camera tile's "who is here" headline (§6).
  'vision:occupancy': Record<string, ZoneOccupant[]>;
  // Per-camera worker health from the same poll — drives the tile's stream/detection
  // status badge (frames flowing? backend detecting, or null stub?).
  'vision:cameras': VisionCameraStatus[];
  'ws:status': { state: 'connected' | 'disconnected' | 'syncing' };
  // Fired when a full-state resync settles — success or failure. Views use it to
  // leave their skeleton first-load state (and show real empty/error states).
  'sync:done': { ok: boolean };
  // The signed-in member's pinned-device list changed (see pins.service).
  'pins:changed': string[];
};

type Handler<K extends keyof BusEvents> = (data: BusEvents[K]) => void;

class EventBus {
  private map = new Map<string, Handler<any>[]>();

  emit<K extends keyof BusEvents>(event: K, data?: BusEvents[K]) {
    (this.map.get(event) || []).forEach(fn => fn(data));
  }

  on<K extends keyof BusEvents>(event: K, handler: Handler<K>): () => void {
    const list = this.map.get(event) || [];
    list.push(handler);
    this.map.set(event, list);
    return () => this.off(event, handler);
  }

  off<K extends keyof BusEvents>(event: K, handler: Handler<K>) {
    const list = this.map.get(event) || [];
    this.map.set(event, list.filter(fn => fn !== handler));
  }
}

export const bus = new EventBus();
