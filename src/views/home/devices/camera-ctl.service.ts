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
  cameraSetPrivacy,
  cameraPtzGoto,
  cameraPtzMove,
  fetchCameraControls,
  fetchRecordingCameras,
  fetchRecordingSegments,
  recordingClipUrl,
  RecordingSegment,
} from "../../../utils/server-handler";
import { getGlobalPosition } from "../../../utils/utils.service";
import CameraCtlView from "../overlay-views/camera-ctl.template.html?raw";
import CameraLiveView from "../overlay-views/camera-live.template.html?raw";
import RecordingsView from "../overlay-views/recordings.template.html?raw";
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
      records: !!device.records,
      privacy: !!device.privacy,
    },
    actions: {
      nudge: async (data: any, dx: number, dy: number) => {
        const ok = await cameraPtzMove(data.id, dx * CAM_NUDGE_SPEED, dy * CAM_NUDGE_SPEED, CAM_NUDGE_MS);
        if (!ok) oops("Couldn't move the camera");
      },
      goto: async (data: any, token: string) => {
        if (!(await cameraPtzGoto(data.id, token))) oops("Couldn't recall that view");
      },
      recordings: (_data: any) => openCameraRecordings({ target: event.target }, device),

      // Privacy switch, mirrored from the tile: optimistic flip here AND on the
      // shared device object (same reference the tile renders), reverted on failure.
      // The health pill follows along (the poll that normally feeds it is 15s away).
      privacy: async (data: any) => {
        const next = !data.privacy;
        const paint = (on: boolean) => {
          device.privacy = on;
          device.privacyClass = on ? "cam-priv--on" : "cam-priv--off";
          updateOverlayData({
            ...data,
            privacy: on,
            camHealth: on ? "privacy" : device.camHealth || "",
            camHealthClass: on ? "cam-health--priv" : device.camHealthClass || "",
          });
        };
        paint(next);
        if (!(await cameraSetPrivacy(device.id, next))) {
          paint(!next);
          oops(next ? "Couldn't enable privacy mode" : "Couldn't resume the camera");
        }
      },
    },
    startRect: rect,
    padding: { x: 0, y: 0 },
  });
}

/** Local-day (YYYY-MM-DD) → [start, end] epoch-second window for the segment query. */
function dayRange(day: string): { start: number; end: number } {
  const start = new Date(`${day}T00:00:00`).getTime() / 1000;
  return { start, end: start + 86400 };
}

const timeFmt = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" });

/** Decorate raw segments with the display fields the template renders (start time,
 * duration, and a deduped "who was present" line pulled from the event markers) and the
 * absolute, signed clip URL the <video> plays. */
function decorateSegments(segs: RecordingSegment[]) {
  return segs.map((seg) => {
    const dur = seg.duration;
    const durationLabel =
      dur == null ? "recording…" : `${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")}`;
    const names = Array.from(
      new Set((seg.events || []).map((e) => e.identity?.name).filter((n): n is string => !!n)),
    );
    return {
      id: seg.id,
      clip: recordingClipUrl(seg),
      startLabel: timeFmt.format(new Date(seg.start * 1000)),
      durationLabel,
      whoLabel: names.join(", "),
    };
  });
}

/**
 * Footage-review overlay — browse + play a recording camera's archived clips. Fetches
 * the camera's footage days on open, loads the newest day's segments, and plays a
 * chosen clip in a seekable <video> (signed clip URL). Only the IP-cam fleet ever
 * reaches here; face-ID cams have no `records` flag so no entry point renders.
 */
export async function openCameraRecordings(event: any, device: Device) {
  const rect = getGlobalPosition(event.target);

  const base = {
    id: device.id,
    name: device.name,
    zone: device.zone || "",
    days: [] as string[],
    selectedDay: "",
    segments: [] as ReturnType<typeof decorateSegments>,
    activeClip: "",
    loading: true,
    empty: false,
  };

  const loadDay = async (data: any, day: string) => {
    updateOverlayData({ ...data, selectedDay: day, loading: true, segments: [] });
    const { start, end } = dayRange(day);
    const segs = decorateSegments(await fetchRecordingSegments(device.id, start, end));
    updateOverlayData({ ...data, selectedDay: day, loading: false, segments: segs });
  };

  openOverlay({
    template: RecordingsView,
    data: base,
    actions: {
      pickDay: async (data: any, day: string) => {
        if (day !== data.selectedDay) await loadDay(data, day);
      },
      play: (data: any, seg: { clip: string }) => updateOverlayData({ ...data, activeClip: seg.clip }),
    },
    startRect: rect,
    padding: { x: 6, y: 50 },
  });

  // Resolve this camera's footage days, then auto-load the newest.
  const cams = await fetchRecordingCameras();
  const mine = cams.find((c) => c.id === device.id);
  const days = mine?.days || [];
  if (days.length === 0) {
    updateOverlayData({ ...base, loading: false, empty: true });
    return;
  }
  updateOverlayData({ ...base, days, loading: true });
  await loadDay({ ...base, days }, days[0]);
}
