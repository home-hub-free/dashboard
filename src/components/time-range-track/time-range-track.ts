// A direct-manipulation 24-hour time picker: drag a handle (or, in "range"
// mode, the filled window between two handles) along a horizontal rail with a
// 15-minute snap. Built for EFFECT_CREATION_REPAIR's D3 ruling (the automation
// "between"/"before"/"after"/"at" time guard) — see
// docs/plans/EFFECT_CREATION_REPAIR.md.
//
// WHY THIS IS A PLAIN CLASS, NOT A bindrjs TEMPLATE COMPONENT: a drag needs to
// move a handle on every `pointermove` — dozens of times a second, mid-gesture,
// with no "commit" in between. bindrjs re-renders a whole template string off a
// Proxy-tracked object; routing 60fps position updates through that would be
// visibly janky (a full-string re-render per pixel) and would trip straight
// into exactly what DESIGN.md §7 warns stylists about (reassign-to-re-render,
// `:selected` quirks, loop-var substitution) for zero benefit — nothing here is
// a *list*, it's one widget continuously repainting itself. So this class owns
// a plain DOM subtree directly: the constructor takes a mount element and
// paints into it once, then every drag/keyboard/typed-input update mutates
// that same subtree's inline styles/text directly, never through a template
// re-render. A bindrjs view that wants one of these mounts it into an empty
// `<div>` inside its own template and never touches that div's insides itself
// again — the same pattern `media-enroll.ts`'s VoiceSession/FaceSession use to
// hand a live `<canvas>`/`<video>` a stable DOM home bindrjs won't recreate.
//
// Value contract: {from, to} in "range" mode, {at} in "point" mode — always
// 24h "HH:MM" strings. `onChange` fires on every COMMIT (a pointerup, an
// arrow-key step, or a typed/native `type="time"` change) — never mid-drag, so
// a consumer that POSTs on change is never spammed by a single drag gesture.
//
// See dashboard/UI-LIBRARY.md for the catalog entry + the /ui-kit.html demo.

export type TimeRangeTrackMode = "range" | "point";

export interface TimeRangeTrackRangeValue {
  from: string; // "HH:MM"
  to: string; // "HH:MM"
}

export interface TimeRangeTrackPointValue {
  at: string; // "HH:MM"
}

export type TimeRangeTrackValue = TimeRangeTrackRangeValue | TimeRangeTrackPointValue;

export interface TimeRangeTrackOptions {
  mode: TimeRangeTrackMode;
  value: TimeRangeTrackValue;
  onChange: (value: TimeRangeTrackValue) => void;
}

type HandleKind = "from" | "to" | "at";

const MINUTES_PER_DAY = 1440;
const SNAP_MINUTES = 15;

function normalize(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function snap(minutes: number): number {
  return normalize(Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES);
}

/** Parse a strict 24h "HH:MM" — what a native `type="time"` input always sends
 * (sans seconds) when it has a value at all. Null for anything else, including
 * "" (a cleared field), so callers can tell "no value" from "bad value" apart
 * from a real 00:00. */
function parseHHMM(s: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s || "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatHHMM(minutes: number): string {
  const m = normalize(minutes);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Forward (never-negative, wrap-aware) distance from `from` to `to` around the
 * 24h clock — 0 when equal, growing toward (but never reaching) 1440 "the long
 * way around." This is the same quantity `paintPositions` branches on to decide
 * whether a range wraps past midnight (there, `a <= b` is just `forwardDistance
 * (a, b) === b - a`) — so a valid wrapped window and this distance are the same
 * concept measured two ways. EFFECT_CREATION_FOLLOWUPS.md 1.3's min-gap guard is
 * simply "this must be >= SNAP_MINUTES." */
function forwardDistance(from: number, to: number): number {
  return normalize(to - from);
}

const RANGE_TEMPLATE = `
  <div class="tt-rail">
    <div class="tt-track" aria-hidden="true">
      <div class="tt-fill" data-seg="a"></div>
      <div class="tt-fill tt-fill--wrap" data-seg="b"></div>
    </div>
    <div class="tt-handle" data-kind="from" role="slider" tabindex="0"
      aria-orientation="horizontal" aria-label="From time"
      aria-valuemin="0" aria-valuemax="1439"><span class="tt-bubble"></span></div>
    <div class="tt-handle" data-kind="to" role="slider" tabindex="0"
      aria-orientation="horizontal" aria-label="To time"
      aria-valuemin="0" aria-valuemax="1439"><span class="tt-bubble"></span></div>
  </div>
  <div class="tt-inputs">
    <div class="form-group"><label>From</label><input type="time" step="900" class="tt-input" data-kind="from" /></div>
    <div class="form-group"><label>To</label><input type="time" step="900" class="tt-input" data-kind="to" /></div>
  </div>
`;

const POINT_TEMPLATE = `
  <div class="tt-rail">
    <div class="tt-track" aria-hidden="true"></div>
    <div class="tt-handle" data-kind="at" role="slider" tabindex="0"
      aria-orientation="horizontal" aria-label="Time"
      aria-valuemin="0" aria-valuemax="1439"><span class="tt-bubble"></span></div>
  </div>
  <div class="tt-inputs">
    <div class="form-group"><label>At</label><input type="time" step="900" class="tt-input" data-kind="at" /></div>
  </div>
`;

export class TimeRangeTrack {
  private readonly mount: HTMLElement;
  private readonly mode: TimeRangeTrackMode;
  private readonly onChangeCb: (value: TimeRangeTrackValue) => void;
  private readonly primaryKind: HandleKind;

  // Minutes-since-midnight is the single source of truth; HH:MM strings are
  // derived only at the edges (paint + onChange). `bMinutes` is meaningless in
  // "point" mode (kept equal to `aMinutes`, never read there).
  private aMinutes: number;
  private bMinutes: number;

  private rail!: HTMLElement;
  private handleA!: HTMLElement;
  private handleB: HTMLElement | null = null;
  private inputA!: HTMLInputElement;
  private inputB: HTMLInputElement | null = null;

  /** Which handle (or, range mode, "window" for a window-body drag) is
   * currently pointer-captured. Null when nothing is being dragged. */
  private dragging: HandleKind | "window" | null = null;
  private windowDragStart = { a: 0, b: 0, frac: 0 };

  constructor(mountEl: HTMLElement, options: TimeRangeTrackOptions) {
    this.mount = mountEl;
    this.mode = options.mode;
    this.onChangeCb = options.onChange;
    this.primaryKind = this.mode === "range" ? "from" : "at";

    if (this.mode === "range") {
      const v = options.value as TimeRangeTrackRangeValue;
      // clampPair (1.3): a caller could in principle hand in an already-degenerate
      // {from,to} (e.g. a legacy stored effect saved before this guard existed) —
      // the widget must never DISPLAY a from===to window, not just refuse to
      // produce a new one, so the initial value is enforced the same as every
      // other entry point.
      const initial = this.clampPair(parseHHMM(v.from) ?? 0, parseHHMM(v.to) ?? 0);
      this.aMinutes = initial.a;
      this.bMinutes = initial.b;
    } else {
      const v = options.value as TimeRangeTrackPointValue;
      this.aMinutes = parseHHMM(v.at) ?? 0;
      this.bMinutes = this.aMinutes;
    }

    this.mount.classList.add("time-track");
    this.mount.dataset.mode = this.mode;
    this.paintDom();
  }

  /** Programmatic value update (e.g. loading a different staged arm into an
   * already-mounted editor). Does NOT fire onChange — the caller already has
   * the value it's pushing in; re-notifying it of its own write would be a
   * feedback loop. */
  setValue(value: TimeRangeTrackValue): void {
    if (this.mode === "range") {
      const v = value as TimeRangeTrackRangeValue;
      const next = this.clampPair(parseHHMM(v.from) ?? this.aMinutes, parseHHMM(v.to) ?? this.bMinutes);
      this.aMinutes = next.a;
      this.bMinutes = next.b;
    } else {
      const v = value as TimeRangeTrackPointValue;
      this.aMinutes = parseHHMM(v.at) ?? this.aMinutes;
      this.bMinutes = this.aMinutes;
    }
    this.paintPositions();
    this.syncInputs();
  }

  /** Release this instance's DOM. setPointerCapture means a drag never needed
   * a document-level listener, so clearing the mount's subtree is the whole
   * teardown — nothing else to unhook. */
  destroy(): void {
    this.mount.innerHTML = "";
  }

  private currentValue(): TimeRangeTrackValue {
    return this.mode === "range"
      ? { from: formatHHMM(this.aMinutes), to: formatHHMM(this.bMinutes) }
      : { at: formatHHMM(this.aMinutes) };
  }

  private commit(): void {
    this.onChangeCb(this.currentValue());
  }

  // ---- min-gap invariant (EFFECT_CREATION_FOLLOWUPS.md 1.3) -----------------
  //
  // Range mode only: `from` and `to` must stay >= SNAP_MINUTES apart by
  // forwardDistance (the same forward/wrapped measure `paintPositions` already
  // renders by), so a window that wraps past midnight (e.g. 23:45 -> 00:00, a
  // valid 15-min window) is untouched — `from === to` (forwardDistance 0) is
  // the one state this forbids, since it is the sole degenerate case: the
  // server's `between` evaluator (`dynamic-evaluate.ts`) can never match an
  // equal-endpoint window, making it a silently dead rule. Point mode has no
  // second endpoint to compare against and is always passed through unchanged.
  //
  // Every clamp here moves the endpoint TOWARD its own last valid position —
  // never swaps which value is `from` vs `to`. Once the gap sits at its floor,
  // further movement toward the other handle simply has no further effect
  // (like an ordinary min-gap range slider refusing to compress past its
  // minimum) rather than letting one handle leapfrog its partner.

  /** Clamp a candidate `from` against a FIXED `to` — used wherever `from` is
   * the endpoint actively moving (its own drag/keyboard/input path). */
  private clampA(candidateA: number, fixedB: number): number {
    if (this.mode !== "range") return candidateA;
    return forwardDistance(candidateA, fixedB) < SNAP_MINUTES ? normalize(fixedB - SNAP_MINUTES) : candidateA;
  }

  /** Clamp a candidate `to` against a FIXED `from` — used wherever `to` is the
   * endpoint actively moving. */
  private clampB(fixedA: number, candidateB: number): number {
    if (this.mode !== "range") return candidateB;
    return forwardDistance(fixedA, candidateB) < SNAP_MINUTES ? normalize(fixedA + SNAP_MINUTES) : candidateB;
  }

  /** Used only where `from`/`to` arrive TOGETHER as a fresh pair (the
   * constructor's initial value, `setValue`'s programmatic update) rather than
   * one endpoint moving against a fixed partner. `from` is treated as the
   * anchor (it's the mode's primary handle — `primaryKind`) and `to` is pulled
   * forward to close the gap if the incoming pair itself violates it, e.g. a
   * legacy stored effect that predates this guard. */
  private clampPair(a: number, b: number): { a: number; b: number } {
    return { a, b: this.clampB(a, b) };
  }

  // ---- initial DOM + wiring -------------------------------------------------

  private paintDom(): void {
    const isRange = this.mode === "range";
    this.mount.innerHTML = isRange ? RANGE_TEMPLATE : POINT_TEMPLATE;

    this.rail = this.mount.querySelector(".tt-rail")!;
    this.handleA = this.mount.querySelector(`.tt-handle[data-kind="${this.primaryKind}"]`)!;
    this.handleB = isRange ? this.mount.querySelector('.tt-handle[data-kind="to"]') : null;
    this.inputA = this.mount.querySelector(`.tt-input[data-kind="${this.primaryKind}"]`)!;
    this.inputB = isRange ? this.mount.querySelector('.tt-input[data-kind="to"]') : null;

    this.wireHandle(this.handleA, this.primaryKind);
    if (this.handleB) this.wireHandle(this.handleB, "to");
    if (isRange) this.wireWindowDrag();
    this.wireInput(this.inputA, this.primaryKind);
    if (this.inputB) this.wireInput(this.inputB, "to");

    this.paintPositions();
    this.syncInputs();
  }

  private wireHandle(handle: HTMLElement, kind: HandleKind): void {
    const get = () => (kind === "to" ? this.bMinutes : this.aMinutes);
    // Shared by BOTH the pointermove and keydown listeners below — the min-gap
    // clamp (1.3) lands in both the drag and the keyboard-arrow mutation paths
    // from this one spot.
    const set = (m: number) => {
      if (kind === "to") this.bMinutes = this.clampB(this.aMinutes, m);
      else this.aMinutes = this.clampA(m, this.bMinutes);
    };

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.focus({ preventScroll: true }); // preventDefault above can suppress default focus-on-press
      this.dragging = kind;
      handle.classList.add("dragging");
    });

    handle.addEventListener("pointermove", (e) => {
      if (this.dragging !== kind) return;
      set(snap(this.fracFromClientX(e.clientX) * MINUTES_PER_DAY));
      this.paintPositions();
    });

    const endDrag = (e: PointerEvent) => {
      if (this.dragging !== kind) return;
      this.finishDrag([handle], handle, e);
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      set(normalize(get() + (e.key === "ArrowLeft" ? -SNAP_MINUTES : SNAP_MINUTES)));
      this.paintPositions();
      this.syncInputs();
      this.commit();
    });
  }

  /** Range mode only: dragging the fill itself shifts BOTH handles by the same
   * delta, preserving the window's duration — including across a midnight
   * wrap, since both ends just move mod 1440 and stay wrapped either way. */
  private wireWindowDrag(): void {
    const fills = Array.from(this.mount.querySelectorAll<HTMLElement>(".tt-fill"));

    fills.forEach((fill) => {
      fill.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        fill.setPointerCapture(e.pointerId);
        this.dragging = "window";
        this.windowDragStart = { a: this.aMinutes, b: this.bMinutes, frac: this.fracFromClientX(e.clientX) };
        fills.forEach((f) => f.classList.add("dragging"));
      });

      fill.addEventListener("pointermove", (e) => {
        if (this.dragging !== "window") return;
        const deltaMin = snap((this.fracFromClientX(e.clientX) - this.windowDragStart.frac) * MINUTES_PER_DAY);
        // No min-gap clamp needed here (1.3): shifting both endpoints by the
        // IDENTICAL delta mod 1440 leaves forwardDistance(a, b) exactly
        // unchanged (both sides of the subtraction shift by the same amount),
        // so a window that was already valid when the drag started — guaranteed,
        // since every OTHER mutation path (handle drag/keyboard, native input,
        // setValue, the constructor) enforces the floor — cannot become invalid
        // here. Preserving duration exactly is also this gesture's whole
        // contract: "shifts both handles... preserving the window's duration."
        this.aMinutes = normalize(this.windowDragStart.a + deltaMin);
        this.bMinutes = normalize(this.windowDragStart.b + deltaMin);
        this.paintPositions();
      });

      const endDrag = (e: PointerEvent) => {
        if (this.dragging !== "window") return;
        this.finishDrag(fills, fill, e);
      };
      fill.addEventListener("pointerup", endDrag);
      fill.addEventListener("pointercancel", endDrag);
    });
  }

  /** Shared drag-release path: clear the dragging state/class, release capture
   * (best-effort — pointercancel may have already released it), then commit. */
  private finishDrag(dragClassEls: HTMLElement[], capturedEl: HTMLElement, e: PointerEvent): void {
    this.dragging = null;
    dragClassEls.forEach((el) => el.classList.remove("dragging"));
    try {
      capturedEl.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    this.syncInputs();
    this.commit();
  }

  private wireInput(input: HTMLInputElement, kind: HandleKind): void {
    input.addEventListener("change", () => {
      const parsed = parseHHMM(input.value);
      if (parsed === null) {
        // Empty/invalid (e.g. a cleared field) — revert the input, leave state alone.
        input.value = formatHHMM(kind === "to" ? this.bMinutes : this.aMinutes);
        return;
      }
      const snapped = snap(parsed); // keep the 15-min grid honest from BOTH entry paths
      // Min-gap clamp (1.3): a committed value that would collapse the window
      // below the floor snaps back to the nearest legal one — the input then
      // shows that clamped value (via syncInputs below), not what was typed.
      if (kind === "to") this.bMinutes = this.clampB(this.aMinutes, snapped);
      else this.aMinutes = this.clampA(snapped, this.bMinutes);
      this.paintPositions();
      this.syncInputs();
      this.commit();
    });
  }

  // ---- geometry --------------------------------------------------------------

  private fracFromClientX(clientX: number): number {
    const box = this.rail.getBoundingClientRect();
    if (box.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  }

  private paintPositions(): void {
    if (this.mode === "range") {
      const a = this.aMinutes;
      const b = this.bMinutes;
      const segA = this.mount.querySelector('.tt-fill[data-seg="a"]') as HTMLElement;
      const segB = this.mount.querySelector('.tt-fill[data-seg="b"]') as HTMLElement;
      if (a <= b) {
        segA.style.left = `${(a / MINUTES_PER_DAY) * 100}%`;
        segA.style.width = `${((b - a) / MINUTES_PER_DAY) * 100}%`;
        segB.style.display = "none";
      } else {
        // Wraps past midnight: render as [a, 24:00) + [00:00, b].
        segA.style.left = `${(a / MINUTES_PER_DAY) * 100}%`;
        segA.style.width = `${((MINUTES_PER_DAY - a) / MINUTES_PER_DAY) * 100}%`;
        segB.style.display = b > 0 ? "" : "none";
        segB.style.left = "0%";
        segB.style.width = `${(b / MINUTES_PER_DAY) * 100}%`;
      }
    }

    this.positionHandle(this.handleA, this.aMinutes);
    if (this.handleB) this.positionHandle(this.handleB, this.bMinutes);
  }

  private positionHandle(handle: HTMLElement, minutes: number): void {
    const leftPct = (minutes / MINUTES_PER_DAY) * 100;
    handle.style.left = `${leftPct}%`;
    handle.setAttribute("aria-valuenow", String(minutes));
    const label = formatHHMM(minutes);
    handle.setAttribute("aria-valuetext", label);

    const bubble = handle.querySelector<HTMLElement>(".tt-bubble");
    if (!bubble) return;
    bubble.textContent = label;

    // Clamp the bubble horizontally so it never spills past the rail's edge
    // near 00:00/23:45 — measured against the rendered width (not hardcoded,
    // though HH:MM is fixed-width under the mono/tabular-nums styling), same
    // idea as the camera timeline's scrub bubble (camera-ctl.service.ts's
    // tlHover). Skipped while unlaid-out (e.g. mounted inside a hidden
    // overlay) — the next real paint recomputes it once width is real.
    //
    // The math has to cross a coordinate-space boundary: `handle` (this
    // bubble's containing block, since both are position:absolute) sits at
    // `leftPct` of the RAIL, but the bubble's own `left` is relative to the
    // HANDLE, not the rail. So compute the desired position in rail-relative
    // px first (clamped into the rail's bounds), then re-express it as an
    // offset from the handle's own center — 12px (half the handle's 24px
    // width) is that center under the CSS default, so the delta from the
    // unclamped rail-relative center is what actually needs to move.
    const railBox = this.rail.getBoundingClientRect();
    if (railBox.width === 0) return;
    const half = (bubble.offsetWidth || 34) / 2;
    const handleCenterPx = (leftPct / 100) * railBox.width; // rail-relative
    const desiredCenterPx = Math.min(railBox.width - half, Math.max(half, handleCenterPx));
    bubble.style.left = `${12 + (desiredCenterPx - handleCenterPx)}px`;
    bubble.style.transform = "translateX(-50%)";
  }

  private syncInputs(): void {
    this.inputA.value = formatHHMM(this.aMinutes);
    if (this.inputB) this.inputB.value = formatHHMM(this.bMinutes);
  }
}
