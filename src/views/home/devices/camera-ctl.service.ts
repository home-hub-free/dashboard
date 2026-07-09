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
  getOverlayData,
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
  visionHlsUrl,
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

/** Timeline zoom steps — how much of the day the viewport spans: a full day
 * down to 30 minutes (where 1 px ≈ 5 s, precise enough to tap a moment). */
const TL_ZOOMS = [1, 4, 12, 48];
const TL_ZOOM_LABELS: Record<number, string> = { 1: "24 h", 4: "6 h", 12: "2 h", 48: "30 min" };

/** Tap-through settle window: while taps keep landing, navigation is pure
 * still-frames; the real clip only attaches after this long without a tap. */
const TAP_SETTLE_MS = 350;

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
 *
 * PLAYBACK rides inside it (`mode: "live" | "rec"`): the clock button swaps the
 * live stream for a <video> over the archived clips, with day chips + a 24h
 * timeline (segments as spans, identity events as dots — tap to jump). While in
 * rec mode the live <img> is REMOVED, so the MJPEG connection drops.
 *
 * NB updateOverlayData replaces the whole data blob and bindrjs's :attr handler
 * re-sets bound attributes unconditionally — re-setting a <video src> restarts
 * it. The rec <video> therefore carries NO :src: playSegment attaches src/poster
 * imperatively, which also makes a tap inside the playing clip an instant
 * in-buffer currentTime seek instead of a full reload. The timeline playhead is
 * likewise driven imperatively (direct style writes at ontimeupdate).
 */
export function openCameraLive(event: any, device: Device) {
  const rect = getGlobalPosition(event.target);

  // Seek to apply once the pending clip's metadata loads (timeline taps land
  // mid-segment). Closure state, deliberately outside the bind data (see NB).
  let pendingSeekS = 0;

  // ── Live sound: an hls.js player over the recorder's live tee. Closure-held
  // (never bind data) and attached imperatively to the :if-created <video> — the
  // same survival rule as the timeline zoom state (see NB above).
  let hlsPlayer: { destroy: () => void } | null = null;

  const stopLiveAudio = () => {
    hlsPlayer?.destroy();
    hlsPlayer = null;
    const v = document.querySelector(".cam-live-hls") as HTMLVideoElement | null;
    if (v) {
      v.removeAttribute("src"); // native-HLS path (Safari): drop the stream
      v.load();
    }
  };

  const startLiveAudio = async () => {
    // The <video> is created by the :if that just flipped — normally it's in the
    // DOM already, but give the render a frame or two before giving up.
    let v: HTMLVideoElement | null = null;
    for (let tries = 0; tries < 3 && !v; tries++) {
      v = document.querySelector(".cam-live-hls") as HTMLVideoElement | null;
      if (!v) await new Promise((r) => requestAnimationFrame(r));
    }
    if (!v) return;
    const url = visionHlsUrl(device.id);
    v.muted = false;
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = url; // iOS/macOS Safari: native HLS (hls.js is unsupported there)
      v.play().catch(() => undefined);
      return;
    }
    const { default: Hls } = await import("hls.js");
    if (!Hls.isSupported()) {
      oops("This browser can't play the sound stream");
      return;
    }
    // Hug the live edge a little tighter than default (2×2s target segments
    // ≈ 4s behind) — this view trades a few seconds of delay for sound.
    const hls = new Hls({ liveSyncDurationCount: 2, enableWorker: true });
    hls.on(Hls.Events.ERROR, (_evt: unknown, info: any) => {
      if (info?.fatal) {
        oops("Sound stream dropped — back to the silent view");
        stopLiveAudio();
        const live = getOverlayData();
        if (live?.audio) updateOverlayData({ ...live, audio: false });
      }
    });
    hls.loadSource(url);
    hls.attachMedia(v);
    hlsPlayer = hls;
    v.play().catch(() => undefined);
  };

  // ── Timeline zoom/pan state — closure + imperative DOM, never bind data
  // (re-rendering the blob would restart the playing <video>, see NB). The
  // track is `zoom × 100%` of the viewport; panning is native horizontal
  // scroll, so the % geometry of segments/marks needs no recompute.
  let zoom = 1;
  let playheadFrac = -1; // last known playhead position, as a fraction of the day
  let userScrollTs = 0; //  last manual pan — pauses playhead auto-follow for a bit
  let progScrollTs = 0; //  our own scrollLeft writes, ignored by tlScrolled
  let lastThumbAt = 0; //   throttles scrub-bubble preview frames (server grid is 15s)

  const tlScroll = () => document.querySelector(".cam-tl-scroll") as HTMLElement | null;
  const tlTrack = () => document.querySelector(".cam-tl-track") as HTMLElement | null;

  const hidePlayhead = () => {
    const el = document.querySelector(".cam-tl-playhead") as HTMLElement | null;
    if (el) el.style.opacity = "0";
  };

  const hideBubble = () => {
    const el = document.querySelector(".cam-tl-bubble") as HTMLElement | null;
    if (el) el.style.display = "none";
  };

  const syncZoomUi = () => {
    const label = document.querySelector(".cam-tl-zoom-label") as HTMLElement | null;
    if (label) label.textContent = TL_ZOOM_LABELS[zoom];
    const out = document.querySelector(".cam-tl-zoom-out") as HTMLButtonElement | null;
    const zin = document.querySelector(".cam-tl-zoom-in") as HTMLButtonElement | null;
    if (out) out.disabled = zoom === TL_ZOOMS[0];
    if (zin) zin.disabled = zoom === TL_ZOOMS[TL_ZOOMS.length - 1];
  };

  /** Re-window the timeline, keeping `anchorFrac` (a day fraction) under the
   * same viewport x. Defaults to the playhead when it's in view (zooming homes
   * in on what's playing), else the center of the current window. */
  const applyZoom = (next: number, anchorFrac?: number, anchorViewX?: number) => {
    const scroll = tlScroll();
    const track = tlTrack();
    if (!scroll || !track || next === zoom) return;
    const viewW = scroll.clientWidth || 1;
    let frac = anchorFrac;
    let viewX = anchorViewX ?? viewW / 2;
    if (frac === undefined) {
      const phX = playheadFrac >= 0 ? playheadFrac * viewW * zoom - scroll.scrollLeft : -1;
      if (phX >= 0 && phX <= viewW) {
        frac = playheadFrac;
        viewX = phX;
      } else {
        frac = (scroll.scrollLeft + viewW / 2) / (viewW * zoom);
      }
    }
    zoom = next;
    track.style.width = `${next * 100}%`;
    scroll.dataset.zoom = String(next);
    progScrollTs = performance.now();
    scroll.scrollLeft = Math.max(0, frac * viewW * next - viewX);
    syncZoomUi();
    scheduleStrip();
  };

  /** Keep the playhead inside the zoomed window while a clip plays — unless
   * the user panned away recently (they're looking at something else). */
  const followPlayhead = () => {
    const scroll = tlScroll();
    if (!scroll || zoom === 1 || playheadFrac < 0) return;
    if (performance.now() - userScrollTs < 4000) return;
    const viewW = scroll.clientWidth || 1;
    const x = playheadFrac * viewW * zoom;
    if (x < scroll.scrollLeft || x > scroll.scrollLeft + viewW) {
      progScrollTs = performance.now();
      scroll.scrollLeft = Math.max(0, x - viewW * 0.3);
    }
  };

  /** A preview frame `atS` seconds into a segment — same signed token as the clip
   * (the thumb route verifies the identical (seg_id, token) pair). One rendition
   * (h=360) everywhere and the offset snapped to the server's 15s grid CLIENT-side
   * too, so bubble, poster and filmstrip all hit the same browser-cache lines. */
  const thumbUrl = (seg: DecoratedSegment, atS = 0): string =>
    seg.clip.replace("/clip/", "/thumb/") +
    `&t=${Math.max(0, Math.floor(atS / 15) * 15)}&h=360`;

  const recVideo = () => document.querySelector(".cam-rec-video") as HTMLVideoElement | null;
  // Which clip the <video> actually has attached. Closure-tracked, NOT derived
  // from v.currentSrc — Chromium keeps a stale currentSrc after
  // removeAttribute("src") + load(), which made "is it already loaded?" lie
  // mid-tap-through.
  let loadedClip = "";
  const isLoaded = (seg: DecoratedSegment): boolean =>
    loadedClip === seg.clip && !!recVideo();

  // ── Next-segment prefetch: while a clip plays, pull its successor into the
  // browser HTTP cache (clip URLs are token-stable + Cache-Control immutable, so
  // the <video> range requests are then served locally) — auto-advance and
  // forward taps start warm instead of cold.
  const prefetched = new Set<string>();
  let prefetchTimer: number | null = null;
  const schedulePrefetch = (clip: string) => {
    if (prefetchTimer) clearTimeout(prefetchTimer);
    // A beat after playback starts, so the prefetch never races the current
    // clip's own buffering for bandwidth. Next first (auto-advance's need),
    // then the previous neighbor, sequentially.
    prefetchTimer = window.setTimeout(async () => {
      const live = getOverlayData();
      if (live?.mode !== "rec") return;
      const segs: DecoratedSegment[] = live.segments || [];
      const i = segs.findIndex((s) => s.clip === clip);
      if (i === -1) return;
      for (const n of [segs[i + 1], segs[i - 1]]) {
        if (!n || prefetched.has(n.clip)) continue;
        prefetched.add(n.clip);
        try {
          const r = await fetch(n.clip);
          if (!r.ok) throw new Error(String(r.status));
          await r.blob(); // drain → the cache entry is complete + range-servable
        } catch {
          prefetched.delete(n.clip);
        }
      }
    }, 1500);
  };
  let attachDebounce: number | null = null;

  // ── Filmstrip: frames spanning the visible timeline window — the "find it by
  // looking" surface. Imperative DOM (no bindings inside the container), rebuilt
  // on day load / zoom / pan; taps land as normal settle-navigation.
  const tlStrip = () => document.querySelector(".cam-tl-strip") as HTMLElement | null;
  let stripTimer: number | null = null;
  const scheduleStrip = (delay = 120) => {
    if (stripTimer) clearTimeout(stripTimer);
    stripTimer = window.setTimeout(renderStrip, delay);
  };
  const renderStrip = () => {
    const strip = tlStrip();
    const scroll = tlScroll();
    const live = getOverlayData();
    if (!strip) return;
    const segs: DecoratedSegment[] = live?.segments || [];
    if (!scroll || live?.mode !== "rec" || !live.selectedDay || !segs.length) {
      strip.replaceChildren();
      return;
    }
    const dayStart = dayRange(live.selectedDay).start;
    const viewW = scroll.clientWidth || 1;
    const winStart = scroll.scrollLeft / (viewW * zoom); // visible window, day fracs
    const winSpan = 1 / zoom;
    const cells = Math.max(4, Math.min(14, Math.floor(viewW / 84)));
    const frag = document.createDocumentFragment();
    for (let c = 0; c < cells; c++) {
      // A cell shows a frame from ANY segment overlapping its slice of the
      // window (center-clamped into the segment) — a short clip inside a wide
      // cell still surfaces; truly empty stretches stay placeholders.
      const cellStart = dayStart + (winStart + winSpan * (c / cells)) * 86_400;
      const cellEnd = dayStart + (winStart + winSpan * ((c + 1) / cells)) * 86_400;
      const center = (cellStart + cellEnd) / 2;
      const seg = segs.find(
        (s) => s.start < cellEnd && (s.end ?? Number.MAX_SAFE_INTEGER) > cellStart);
      const t = seg
        ? Math.max(seg.start, Math.min(center, (seg.end ?? seg.start + 1) - 1))
        : center;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cam-strip-cell";
      const label = document.createElement("span");
      label.textContent = timeFmt.format(new Date(t * 1000));
      if (seg) {
        const img = document.createElement("img");
        img.src = thumbUrl(seg, t - seg.start);
        img.alt = "";
        cell.append(img, label);
        cell.addEventListener("click", () => {
          const now = getOverlayData();
          const cur = (now?.segments || []).find((s: DecoratedSegment) => s.clip === seg.clip);
          if (now?.mode === "rec" && cur) {
            playSegment(now, cur, Math.max(0, t - cur.start), true);
          }
        });
      } else {
        const ph = document.createElement("i");
        ph.className = "cam-strip-ph";
        cell.append(ph, label);
        cell.classList.add("empty");
        cell.disabled = true;
      }
      frag.append(cell);
    }
    strip.replaceChildren(frag);
  };

  /** Swap the player to one segment (optionally starting mid-clip).
   *
   * Tap-through (`settle: true` — timeline taps, moment chips) is STILL-FRAME
   * navigation: the tap instantly shows the target moment's frame (the video's
   * poster on an unloaded element — same box, same object-fit, no overlay
   * plumbing) and only after the taps stop for TAP_SETTLE_MS does the real clip
   * attach. Rapid exploration never waits on the video pipeline at all; the
   * frame under the pointer is usually pre-warmed by the hover bubble (same
   * thumb URL). Same-clip jumps skip all of it — pure in-buffer currentTime
   * seeks. Auto-advance and entry autoplay attach immediately (no settle).
   *
   * No duration in the readout — the native video controls already show
   * elapsed/length, and two time pairs on one row read as overlapping stamps. */
  const playSegment = (data: any, seg: DecoratedSegment, seekS = 0, settle = false) => {
    hidePlayhead();
    if (data.selectedDay) {
      playheadFrac = (seg.start + seekS - dayRange(data.selectedDay).start) / 86_400;
    }
    userScrollTs = 0; // the user asked for this moment — let the window jump to it
    followPlayhead();
    updateOverlayData({
      ...data,
      activeClip: seg.clip,
      activeStart: seg.startLabel,
      activeWho: seg.whoLabel,
    });
    if (attachDebounce) {
      clearTimeout(attachDebounce);
      attachDebounce = null;
    }
    if (!settle || isLoaded(seg)) {
      attachClip(seg, seekS);
      schedulePrefetch(seg.clip);
      return;
    }
    // Still-frame preview: unload the element (stops the old clip's audio and
    // buffering immediately) and paint the target frame as its poster.
    const v = recVideo();
    if (v) {
      loadedClip = "";
      v.removeAttribute("src");
      v.load();
      v.poster = thumbUrl(seg, seekS);
    }
    attachDebounce = window.setTimeout(() => {
      attachDebounce = null;
      attachClip(seg, seekS);
      schedulePrefetch(seg.clip);
    }, TAP_SETTLE_MS);
  };

  const attachClip = async (seg: DecoratedSegment, seekS: number) => {
    // The :if may have just created the element — give the render a frame or two.
    let v = recVideo();
    for (let tries = 0; tries < 3 && !v; tries++) {
      await new Promise((r) => requestAnimationFrame(r));
      v = recVideo();
    }
    if (!v) return;
    if (loadedClip === seg.clip) {
      pendingSeekS = 0;
      v.currentTime = seekS;
      v.play().catch(() => undefined);
      return;
    }
    pendingSeekS = seekS;
    loadedClip = seg.clip;
    v.poster = thumbUrl(seg, seekS); // instant visual while the bytes arrive
    v.src = seg.clip;
    v.play().catch(() => undefined);
  };

  /** Load one day's segments (+ timeline geometry); optionally auto-play the
   * newest clip — entering playback means "show me the most recent moment". */
  const loadDay = async (data: any, day: string, autoplayLatest: boolean) => {
    playheadFrac = -1; // no clip playing until something is picked/auto-played
    loadedClip = ""; //   activeClip resets → the :if unmounts the <video>
    const base = {
      ...data,
      mode: "rec",
      selectedDay: day,
      recLoading: true,
      segments: [],
      marks: [],
      moments: [],
      activeClip: "",
      activeStart: "",
      activeWho: "",
    };
    updateOverlayData(base);
    const { start, end } = dayRange(day);
    const { segments, marks, moments } = decorateSegments(
      await fetchRecordingSegments(device.id, start, end), start);
    const next = { ...base, recLoading: false, segments, marks, moments };
    updateOverlayData(next);
    if (autoplayLatest && segments.length) {
      playSegment(next, segments[segments.length - 1]);
    }
    scheduleStrip(0);
  };

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
      // Live sound (records-cams only): true = the HLS main-stream view (with
      // the mic) replaces the silent MJPEG relay.
      audio: false,
      // ── playback state (mode "rec") ──────────────────────────────────────
      mode: "live",
      dayChips: [] as { day: string; label: string }[],
      selectedDay: "",
      segments: [] as DecoratedSegment[],
      marks: [] as TimelineMark[],
      moments: [] as RecordingMoment[],
      // Hour ruler — ticks live INSIDE the scrolling track so they pan with
      // it; CSS (keyed on [data-zoom]) decides which granularity shows (h6 =
      // 00/06/12/18/24, h2 = other even hours, h1 = the rest). Static data.
      hourTicks: Array.from({ length: 25 }, (_, h) => ({
        label: String(h).padStart(2, "0"),
        cls: h % 6 === 0 ? "h6" : h % 2 === 0 ? "h2" : "h1",
        style: {
          left: `${((h / 24) * 100).toFixed(3)}%`,
          transform: h === 0 ? "translateX(0)" : h === 24 ? "translateX(-100%)" : "translateX(-50%)",
        },
      })),
      activeClip: "",
      activeStart: "",
      activeWho: "",
      recLoading: false,
      recEmpty: false,
    },
    actions: {
      nudge: async (data: any, dx: number, dy: number) => {
        const ok = await cameraPtzMove(data.id, dx * CAM_NUDGE_SPEED, dy * CAM_NUDGE_SPEED, CAM_NUDGE_MS);
        if (!ok) oops("Couldn't move the camera");
      },
      goto: async (data: any, token: string) => {
        if (!(await cameraPtzGoto(data.id, token))) oops("Couldn't recall that view");
      },

      // Sound toggle: flip the blob first (the :if swaps <img> ↔ <video>), then
      // attach the player to the freshly-created element.
      audio: (data: any) => {
        if (data.audio) {
          stopLiveAudio();
          updateOverlayData({ ...data, audio: false });
          return;
        }
        updateOverlayData({ ...data, audio: true });
        startLiveAudio().catch(() => {
          oops("Couldn't start the sound stream");
          stopLiveAudio();
          updateOverlayData({ ...getOverlayData(), audio: false });
        });
      },

      // ── playback (footage review inside the lightbox) ────────────────────
      recordings: async (data: any) => {
        stopLiveAudio(); // leaving live view — release the HLS stream
        // Fresh entry — the :if rebuild reset the timeline DOM to its markup
        // defaults (zoom 1, "24 h", zoom-out disabled); match the closure.
        zoom = 1;
        playheadFrac = -1;
        userScrollTs = 0;
        data = { ...data, audio: false };
        updateOverlayData({ ...data, mode: "rec", recLoading: true, recEmpty: false });
        const cams = await fetchRecordingCameras();
        const days = cams.find((c) => c.id === device.id)?.days || [];
        if (!days.length) {
          updateOverlayData({ ...data, mode: "rec", recLoading: false, recEmpty: true });
          return;
        }
        const dayChips = days.map((day) => ({ day, label: dayLabel(day) }));
        await loadDay({ ...data, dayChips, recEmpty: false }, days[0], true);
      },

      backToLive: (data: any) => {
        loadedClip = ""; // mode flip unmounts the rec <video>
        updateOverlayData({ ...data, mode: "live", activeClip: "" });
      },

      pickDay: async (data: any, day: string) => {
        if (day !== data.selectedDay) await loadDay(data, day, false);
      },

      // Tap the 24h timeline → play the segment under that instant, seeked to it
      // (or the next recorded moment if the tap lands in a gap).
      seekTimeline: (data: any) => {
        const ev = (window as any).event as MouseEvent | undefined;
        const el = ev?.currentTarget as HTMLElement | null;
        if (!el || !data.selectedDay) return;
        const box = el.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (ev!.clientX - box.left) / box.width));
        const t = dayRange(data.selectedDay).start + frac * 86400;
        const segs: DecoratedSegment[] = data.segments || [];
        const inside = segs.find((s) => t >= s.start && t <= (s.end ?? t));
        if (inside) return playSegment(data, inside, t - inside.start, true);
        const after = segs.find((s) => s.start > t);
        if (after) playSegment(data, after, 0, true);
      },

      // ── timeline zoom/pan (all imperative — see the closure NB above) ────
      zoomIn: () => applyZoom(TL_ZOOMS[Math.min(TL_ZOOMS.indexOf(zoom) + 1, TL_ZOOMS.length - 1)]),
      zoomOut: () => applyZoom(TL_ZOOMS[Math.max(TL_ZOOMS.indexOf(zoom) - 1, 0)]),

      // Wheel / trackpad pinch over the bar zooms about the cursor.
      zoomWheel: () => {
        const ev = (window as any).event as WheelEvent | undefined;
        const scroll = tlScroll();
        const track = tlTrack();
        if (!ev || !scroll || !track) return;
        ev.preventDefault();
        const i = TL_ZOOMS.indexOf(zoom);
        const ni = ev.deltaY < 0 ? Math.min(i + 1, TL_ZOOMS.length - 1) : Math.max(i - 1, 0);
        if (ni === i) return;
        const box = track.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width));
        applyZoom(TL_ZOOMS[ni], frac, ev.clientX - scroll.getBoundingClientRect().left);
      },

      // A pan the user made (not our own scrollLeft writes) pauses auto-follow.
      // Either kind re-windows the filmstrip.
      tlScrolled: () => {
        scheduleStrip(150);
        if (performance.now() - progScrollTs < 250) return;
        userScrollTs = performance.now();
      },

      // Scrub bubble — a preview frame + the exact hh:mm under the pointer, so a
      // tap is trustworthy before it's committed. Positioned in track coords,
      // clamped to the visible window so the card never hides under an edge.
      tlHover: (data: any) => {
        const ev = (window as any).event as PointerEvent | undefined;
        const track = tlTrack();
        const scroll = tlScroll();
        const bubble = document.querySelector(".cam-tl-bubble") as HTMLElement | null;
        if (!ev || !track || !scroll || !bubble || !data.selectedDay) return;
        const box = track.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width));
        const t = dayRange(data.selectedDay).start + frac * 86_400;
        const timeEl = bubble.querySelector(".cam-tl-bubble-time") as HTMLElement | null;
        if (timeEl) timeEl.textContent = timeFmt.format(new Date(t * 1000));
        // Preview frame for the segment under the pointer. Throttled — the server
        // snaps offsets to a 15s grid anyway, so finer updates buy nothing; a gap
        // under the pointer collapses the card back to the time-only pill.
        const img = bubble.querySelector(".cam-tl-bubble-img") as HTMLImageElement | null;
        if (img) {
          const segs: DecoratedSegment[] = data.segments || [];
          const seg = segs.find((s) => t >= s.start && t <= (s.end ?? t));
          if (seg) {
            const want = thumbUrl(seg, t - seg.start);
            if (img.dataset.want !== want && performance.now() - lastThumbAt > 150) {
              lastThumbAt = performance.now();
              img.dataset.want = want;
              img.src = want;
            }
            bubble.classList.add("has-thumb");
          } else {
            bubble.classList.remove("has-thumb");
          }
        }
        // Viewport coordinates: the bubble is a SIBLING of the scroll viewport
        // (anything above the bar would be clipped inside it), so its x is the
        // track position minus the pan, clamped into the visible window.
        const pad = 26;
        const viewW = scroll.clientWidth || 0;
        const x = Math.min(viewW - pad,
          Math.max(pad, frac * box.width - scroll.scrollLeft));
        bubble.style.left = `${scroll.offsetLeft + x}px`;
        bubble.style.top = `${scroll.offsetTop}px`;
        bubble.style.display = "flex";
      },
      tlHoverEnd: () => hideBubble(),

      // Moment chip → jump straight into the clip at that instant.
      jumpMoment: (data: any, ts: number) => {
        const segs: DecoratedSegment[] = data.segments || [];
        const seg = segs.find((s) => ts >= s.start && ts <= (s.end ?? ts));
        if (seg) playSegment(data, seg, Math.max(0, ts - seg.start), true);
      },

      // Auto-advance: a finished clip flows into the next one — re-watching an
      // evening shouldn't take a tap every 5 minutes.
      clipEnded: (data: any) => {
        const segs: DecoratedSegment[] = data.segments || [];
        const i = segs.findIndex((s) => s.clip === data.activeClip);
        if (i > -1 && i + 1 < segs.length) playSegment(data, segs[i + 1]);
      },

      // <video> plumbing — both imperative on purpose (see NB above).
      applySeek: () => {
        const v = (window as any).event?.target as HTMLVideoElement | undefined;
        if (v && pendingSeekS > 0) {
          v.currentTime = pendingSeekS;
          pendingSeekS = 0;
        }
      },
      onTime: (data: any) => {
        const v = (window as any).event?.target as HTMLVideoElement | undefined;
        const seg = (data.segments || []).find((s: DecoratedSegment) => s.clip === data.activeClip);
        const el = document.querySelector(".cam-tl-playhead") as HTMLElement | null;
        if (!v || !seg || !el || !data.selectedDay) return;
        const frac = (seg.start + v.currentTime - dayRange(data.selectedDay).start) / 86400;
        el.style.left = `${Math.min(100, Math.max(0, frac * 100)).toFixed(3)}%`;
        el.style.opacity = "1";
        playheadFrac = Math.min(1, Math.max(0, frac));
        followPlayhead();
      },

      // Privacy switch, mirrored from the tile: optimistic flip here AND on the
      // shared device object (same reference the tile renders), reverted on failure.
      // The health pill follows along (the poll that normally feeds it is 15s away).
      privacy: async (data: any) => {
        const next = !data.privacy;
        if (next) stopLiveAudio(); // going dark stops the sound stream too
        const paint = (on: boolean) => {
          device.privacy = on;
          device.privacyClass = on ? "cam-priv--on" : "cam-priv--off";
          updateOverlayData({
            ...data,
            audio: false,
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
    // Every close path (✕, backdrop) must release the HLS stream — a destroyed
    // overlay can't, and hls.js would keep fetching segments forever. A pending
    // prefetch dies with the overlay too.
    onClose: () => {
      stopLiveAudio();
      if (prefetchTimer) clearTimeout(prefetchTimer);
      if (attachDebounce) clearTimeout(attachDebounce);
      if (stripTimer) clearTimeout(stripTimer);
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
const dayFmt = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });

/** Day-chip label for a local YYYY-MM-DD: "Today" / "Yesterday" / "Jul 4". */
function dayLabel(day: string): string {
  const start = new Date(`${day}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return dayFmt.format(start);
}

/** One playable clip, decorated for the template: labels + its span on the 24h
 * timeline (`bar` feeds a bindrjs `:style` object binding). */
export type DecoratedSegment = {
  id: number;
  clip: string;
  start: number;
  end: number | null;
  startLabel: string;
  whoLabel: string;
  bar: { left: string; width: string };
};

/** An identity moment ("David entered, 14:03") as a tappable dot on the timeline. */
export type TimelineMark = { key: string; name: string; style: { left: string } };

/** A "moment" chip — one per person-appearance on the selected day (consecutive
 * sightings within 15 min collapse into the first); tap jumps to that instant. */
export type RecordingMoment = { key: string; name: string; time: string; ts: number };

const dayPct = (t: number, dayStart: number): string =>
  `${Math.min(100, Math.max(0, ((t - dayStart) / 86_400) * 100)).toFixed(3)}%`;

/** Decorate raw segments with the display fields the template renders (start time,
 * a deduped "who was present" line, the signed clip URL the <video> plays, and
 * timeline geometry) + the day's identity marks (one dot per person per ~5
 * minutes, so a long presence doesn't smear into a solid row of dots). Clip
 * length is the native video controls' job — we never print a second duration. */
function decorateSegments(
  segs: RecordingSegment[],
  dayStart: number,
): { segments: DecoratedSegment[]; marks: TimelineMark[]; moments: RecordingMoment[] } {
  const marks: TimelineMark[] = [];
  const seenMarks = new Set<string>();
  const sightings: { name: string; ts: number }[] = [];
  const segments = segs.map((seg) => {
    const names = Array.from(
      new Set((seg.events || []).map((e) => e.identity?.name).filter((n): n is string => !!n)),
    );
    for (const e of seg.events || []) {
      const name = e.identity?.name;
      if (!name) continue;
      sightings.push({ name, ts: e.ts });
      const key = `${name}@${Math.floor(e.ts / 300)}`;
      if (seenMarks.has(key)) continue;
      seenMarks.add(key);
      marks.push({ key, name: `${name} · ${timeFmt.format(new Date(e.ts * 1000))}`, style: { left: dayPct(e.ts, dayStart) } });
    }
    const endT = seg.end ?? Date.now() / 1000;
    // Width floor keeps a lone 5-min clip visible (0.35% of a day ≈ invisible).
    const width = Math.max(0.4, ((endT - seg.start) / 86_400) * 100);
    return {
      id: seg.id,
      clip: recordingClipUrl(seg),
      start: seg.start,
      end: seg.end,
      startLabel: timeFmt.format(new Date(seg.start * 1000)),
      whoLabel: names.join(", "),
      bar: { left: dayPct(seg.start, dayStart), width: `${width.toFixed(3)}%` },
    };
  });
  // Moment chips: a person's sightings sorted by time; a >15 min gap starts a
  // new appearance (someone home all evening stays ONE chip, not a chip spam).
  sightings.sort((a, b) => a.ts - b.ts);
  const lastSeen: Record<string, number> = {};
  const moments: RecordingMoment[] = [];
  for (const s of sightings) {
    if (s.ts - (lastSeen[s.name] ?? -Infinity) > 900) {
      moments.push({
        key: `${s.name}@${s.ts}`,
        name: s.name,
        time: timeFmt.format(new Date(s.ts * 1000)),
        ts: s.ts,
      });
    }
    lastSeen[s.name] = s.ts;
  }
  return { segments, marks, moments };
}
