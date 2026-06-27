import io from "socket.io-client/dist/socket.io.js";
import { DeviceActions } from "../store/actions";
import { OverlayModal } from "../components/overlay-modal/overlay-modal";
import { server } from "./server-handler";

// Camera frames come from a *separate* Socket.IO server on :8082. Behind nginx it's
// reachable same-origin at `/camera/` (→ :8082), so the stream rides the page's secure
// context like everything else; with an absolute VITE_SERVER_URL (direct dev) we hit
// :8082 on that host instead.
function cameraEndpoint(base: string): string {
  const ep = new URL(base);
  ep.port = "8082";
  return ep.toString();
}

const cameraWS = /^https?:\/\//.test(server)
  ? io.connect(cameraEndpoint(server))
  : io.connect({ path: "/camera/socket.io/" });

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
