import io from "socket.io-client/dist/socket.io.js";
import { server } from "./server-handler";
import { DeviceActions, SensorActions } from "../store/actions";
import { SensorsService } from "../views/home/sensors/sensors.service";

const socket = io.connect(server);

export let socketId = '';

export function initWebSockets() {
  socket.on("connect", () => {
    console.log("WS ready");
    socketId = socket.id;
  });

  socket.on('device-declare', (device) => {
    DeviceActions.declare(device);
  });

  socket.on('device-update', (device) => {
    DeviceActions.update(device);
  });

  socket.on('sensor-declare', (sensor) => {
    SensorActions.declare(sensor);
  });

  socket.on('sensor-update', (sensor) => {
    SensorActions.update(sensor);
    SensorsService.formatSensorsValues([sensor]);
  });
}

export function getSocketId() {
  return socket.id;
}
