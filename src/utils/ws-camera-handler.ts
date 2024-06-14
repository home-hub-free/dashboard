import io from "socket.io-client/dist/socket.io.js";
import { DevicesTab } from "../main-content/menu-items/home-menu/tabs/devices/devices-tab";

const cameraWSEndpoint = 'http://192.168.1.199:8082/';
const cameraWS = io.connect(cameraWSEndpoint);

const feeds: string[] = [];

export function initCameraWS() {
  cameraWS.on('connect', () => {
    console.log("Camera connections started");
  });

  cameraWS.on('error', () => {
    console.log('Failed');
  })
}

export function subscribeCameraFeed(id?: string) {
  if (!id) return;
  if (feeds.includes(id)) return;
  
  let camera = DevicesTab.bind?.devices?.find((device) => device.id === id);

  cameraWS.on(id, (frame) => {
    camera = DevicesTab.bind.devices.find((device) => device.id === id);
    if (camera) {
      camera.value = frame;
    }
  })
}