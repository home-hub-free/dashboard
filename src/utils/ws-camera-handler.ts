import io from "socket.io-client/dist/socket.io.js";
import { DeviceActions } from "../store/actions";
import { OverlayModal } from "../components/overlay-modal/overlay-modal";
import { server } from "./server-handler";

const cameraWSEndpoint = new URL(server);
cameraWSEndpoint.port = "8082";
const cameraWS = io.connect(cameraWSEndpoint.toString());

const feeds: string[] = [];

export function initCameraWS() {
  cameraWS.on("connect", () => {
    console.log("Camera connections started");
  });

  cameraWS.on("error", () => {
    console.log("Failed");
  });
}

export function subscribeCameraFeed(id?: string) {
  if (!id) return;
  if (feeds.includes(id)) return;

  feeds.push(id);

  cameraWS.on(id, (frame) => {
    const blob = new Blob([frame], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    DeviceActions.update({ id, value: url });

    if (OverlayModal.mounted && OverlayModal.bind.data?.id === id) {
      OverlayModal.bind.data.value = url;
    }
  });
}
