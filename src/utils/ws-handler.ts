import io from "socket.io-client/dist/socket.io.js";
// import { WebSocketDeviceDeclare, WebSocketDeviceUpdate, WebSocketSensorDeclare, WebSocketSensorUpdate } from "../main-content/tab-content/tab-content";
import { server } from "./server-handler";
import { DevicesTab } from "../main-content/menu-items/home-menu/tabs/devices/devices-tab";
import { SensorsTab } from "../main-content/menu-items/home-menu/tabs/sensors/sensors-tab";

const socket = io.connect(server);

export let socketId = '';

export function initWebSockets() {

  socket.on("connect", () => {
    console.log("WS ready");
    socketId = socket.id;
  });
  
  DevicesTab.initializeWSHooks(socket);
  SensorsTab.initializeWSHooks(socket);
}

export function getSocketId() {
  return socket.id
}
