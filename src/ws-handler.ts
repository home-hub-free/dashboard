import io from "socket.io-client/dist/socket.io.js";
import { WebSocketDeviceDeclare, WebSocketDeviceUpdate, WebSocketSensorDeclare, WebSocketSensorUpdate } from "./views/content/content-section-websockets";

const socket = io.connect("http://localhost:8080");

export let socketId = '';

export function initWebSockets() {

  socket.on("connect", () => {
    console.log("WS ready");
    socketId = socket.id;
  });
  
  // Device events
  socket.on("device-declare", WebSocketDeviceDeclare);
  socket.on("device-update", WebSocketDeviceUpdate);
  
  // Sensor events
  socket.on("sensor-declare", WebSocketSensorDeclare);
  socket.on("sensor-update", WebSocketSensorUpdate);
}

export function getSocketId() {
  return socket.id
}
