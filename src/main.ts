// Views
import { NavBar } from "./views/nav-bar/nav-bar";
import { ContentSection, updateSensor } from "./views/content/content-section";
import { PopupMessage } from "./views/popup-message/popup-message";
import io from "socket.io-client/dist/socket.io.js";

// please note that the types are reversed
const socket = io.connect("http://localhost:8080");

// CSS
import "./style.scss";

// Init Binds by just importing and using the imports in the main.ts file
NavBar;
ContentSection;
PopupMessage;

socket.on("connect", () => {
  console.log("WS ready");
});

socket.on("sensor-update", (data: any) => {
  updateSensor(data);
});

socket.on("sensor-declare", (data: any) => {
  if (data) {
    let exists =
      ContentSection.bind.sensors &&
      ContentSection.bind.sensors.length &&
      ContentSection.bind.sensors.find((sensor: any) => sensor.id === data.id);
    if (!exists) {
      if (!ContentSection.bind.sensors) ContentSection.bind.sensors = [];
      ContentSection.bind.sensors.push(data);
    }
  }
});
