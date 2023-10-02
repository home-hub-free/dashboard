import io from "socket.io-client/dist/socket.io.js";
// import { WebSocketDeviceDeclare, WebSocketDeviceUpdate, WebSocketSensorDeclare, WebSocketSensorUpdate } from "../main-content/tab-content/tab-content";
import { server } from "./server-handler";
import { DevicesTab } from "../main-content/menu-items/home-menu/tabs/devices/devices-tab";
import { DeviceWSEvents } from "../main-content/menu-items/home-menu/tabs/devices/devices-tab.model";

const socket: io.Socket<DeviceWSEvents> = io.connect(server);

export let socketId = '';

export function initWebSockets() {

  socket.on("connect", () => {
    console.log("WS ready");
    socketId = socket.id;
  });
  
  // socket.on("device-declare")
  // Device events
  DevicesTab.initializeWSHooks(socket);
  // socket.on("device-declare", WebSocketDeviceDeclare);
  // socket.on("device-update", WebSocketDeviceUpdate);
  
  // Sensor events
  // socket.on("sensor-declare", WebSocketSensorDeclare);
  // socket.on("sensor-update", WebSocketSensorUpdate);
}

export function getSocketId() {
  return socket.id
}
