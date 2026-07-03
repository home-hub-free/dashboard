/**
 * Camera tune overlay — saved-view (preset) management + imaging sliders.
 *
 * The TILE owns the everyday controls (D-pad nudge + preset recall chips); this
 * overlay owns the manage/tune surface: save the current aim as a named view,
 * delete a view, and set the sensor profile (brightness/saturation/contrast/
 * sharpness — and day/night IR when the camera exposes it). All writes go through
 * the hub `/camera/:id` proxy (auth + audit); nothing here talks to the camera.
 *
 * Vision-only cameras (the static RTSP fleet) open THIS overlay from the tile —
 * the hub device-edit overlay doesn't apply to them (no hub device row).
 */
import {
  openOverlay,
  updateOverlayData,
} from "../../../components/overlay-modal/overlay-modal";
import { showToaster } from "../../../components/popup-message/popup-message";
import {
  CameraControls,
  cameraDeletePreset,
  cameraSavePreset,
  cameraSetImaging,
  cameraPtzGoto,
  cameraPtzMove,
  fetchCameraControls,
} from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import CameraCtlView from "../overlay-views/camera-ctl.template.html?raw";
import CameraLiveView from "../overlay-views/camera-live.template.html?raw";
import { Device } from "./devices.model";

/** The MC200 family stores at most 8 presets; surface the limit instead of the
 * camera's opaque fault when the user hits it. */
const PRESET_LIMIT = 8;

/** One tap = one short auto-stopped move — the arrows can never leave the camera
 * moving. Shared by the tile D-pad and the lightbox D-pad. */
export const CAM_NUDGE_SPEED = 0.5;
export const CAM_NUDGE_MS = 400;

const oops = (message: string) => showToaster({ message, from: "bottom", timer: 2500 });

export type ControlsChanged = (camId: string, ctl: CameraControls) => void;

/** Rebuild the overlay's data blob (bindrjs: reassign, don't mutate — §7). */
function overlayData(device: Device, ctl: CameraControls) {
  return {
    id: device.id,
    name: device.name,
    zone: device.zone || ctl.zone || "",
    ptz: !!ctl.onvif?.ptz,
    imaging: ctl.onvif?.imaging ? { ...(ctl.imaging || {}) } : null,
    irCut: ctl.imaging?.ir_cut ?? null,
    presets: ctl.presets || [],
    presetsFull: (ctl.presets || []).length >= PRESET_LIMIT,
    reachable: ctl.reachable,
    motionEvents: !!ctl.onvif?.events,
  };
}

export function openCameraControls(
  event: any,
  device: Device,
  ctl: CameraControls,
  onChanged: ControlsChanged,
) {
  const rect = getGlobalPosition(event.target);

  const refresh = async (data: any) => {
    const fresh = await fetchCameraControls(device.id);
    if (fresh) {
      onChanged(device.id, fresh);
      updateOverlayData({ ...data, ...overlayData(device, fresh) });
    }
  };

  openOverlay({
    template: CameraCtlView,
    data: overlayData(device, ctl),
    actions: {
      gotoPreset: async (_data: any, token: string) => {
        if (!(await cameraPtzGoto(device.id, token))) oops("Couldn't move the camera");
      },

      savePreset: async (data: any) => {
        const input = document.getElementById(`${device.id}_newPreset`) as HTMLInputElement | null;
        const name = (input?.value || "").trim();
        if (!name) return oops("Give the view a name first");
        if (data.presetsFull) return oops(`This camera stores up to ${PRESET_LIMIT} views`);
        const saved = await cameraSavePreset(device.id, name);
        if (!saved) return oops("Couldn't save the view");
        if (input) input.value = "";
        await refresh(data);
      },

      deletePreset: async (data: any, token: string) => {
        if (!(await cameraDeletePreset(device.id, token))) return oops("Couldn't delete the view");
        await refresh(data);
      },

      // Commit one imaging field on slider release; the response carries the merged
      // settings, so refresh keeps the other sliders honest.
      setImaging: async (data: any, field: string, event: Event) => {
        const value = parseInt((event.target as HTMLInputElement).value, 10);
        const result = await cameraSetImaging(device.id, { [field]: value });
        if (!result) return oops("Couldn't update the image");
        updateOverlayData({ ...data, imaging: { ...(result.imaging || data.imaging) } });
        onChanged(device.id, { ...ctl, imaging: result.imaging || ctl.imaging });
      },
    },
    startRect: rect,
    padding: { x: 6, y: 50 },
  });
}

/**
 * Fullscreen live lightbox — the camera tile's tap target. A snapshot of the
 * decorated tile's display fields (stream, who, health, PTZ caps) rendered
 * edge-to-edge; padding 0/0 drives the sheet to the full viewport.
 */
export function openCameraLive(event: any, device: Device) {
  const rect = getGlobalPosition(event.target);

  openOverlay({
    template: CameraLiveView,
    data: {
      id: device.id,
      name: device.name,
      streamUrl: device.streamUrl || "",
      who: device.who || "",
      camHealth: device.camHealth || "",
      camHealthClass: device.camHealthClass || "",
      ptz: !!device.ptz,
      presets: device.presets || [],
    },
    actions: {
      nudge: async (data: any, dx: number, dy: number) => {
        const ok = await cameraPtzMove(data.id, dx * CAM_NUDGE_SPEED, dy * CAM_NUDGE_SPEED, CAM_NUDGE_MS);
        if (!ok) oops("Couldn't move the camera");
      },
      goto: async (data: any, token: string) => {
        if (!(await cameraPtzGoto(data.id, token))) oops("Couldn't recall that view");
      },
    },
    startRect: rect,
    padding: { x: 0, y: 0 },
  });
}
