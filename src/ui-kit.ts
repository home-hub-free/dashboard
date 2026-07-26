// UI-kit gallery entry — loads the app stylesheet, then mounts the imperative
// (non-bindrjs) components that a raw markup snippet can't demo by itself.
// Open with `npm run dev` → http://localhost:8081/ui-kit.html
// See dashboard/UI-LIBRARY.md for the written catalog.
import "./styles/style.scss";
import { TimeRangeTrack, type TimeRangeTrackValue } from "./components/time-range-track/time-range-track";

function mountTimeTrackDemos(): void {
  const logChange = (label: string) => (value: TimeRangeTrackValue) =>
    console.log(`[ui-kit] time-track ${label} onChange`, value);

  const rangeEl = document.getElementById("kit-time-track-range");
  if (rangeEl) {
    new TimeRangeTrack(rangeEl, {
      mode: "range",
      value: { from: "07:00", to: "11:00" },
      onChange: logChange("range"),
    });
  }

  const pointEl = document.getElementById("kit-time-track-point");
  if (pointEl) {
    new TimeRangeTrack(pointEl, {
      mode: "point",
      value: { at: "21:30" },
      onChange: logChange("point"),
    });
  }

  const wrapEl = document.getElementById("kit-time-track-wrap");
  if (wrapEl) {
    new TimeRangeTrack(wrapEl, {
      mode: "range",
      value: { from: "22:00", to: "06:00" },
      onChange: logChange("wrapped"),
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountTimeTrackDemos);
} else {
  mountTimeTrackDemos();
}
