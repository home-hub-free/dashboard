import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import type { ModalContext, ModalRectangle, OverlayModalState } from "./overlay-modal.model";
import template from "./overlay-modal.html?raw";

class OverlayModalClass extends Component<OverlayModalState> {
  private unsubscribeDeviceUpdate?: () => void;

  mount() {
    this.createBind({
      id: "overlay-modal",
      template,
      bind: {
        visible: false,
        opening: false,
        closing: false,
        position: {},
        template: "",
        data: {},
        actions: {},
        closeOverlay: () => closeOverlay(),
      },
    });

    this.unsubscribeDeviceUpdate = bus.on('device:update', (device) => {
      if (this.bind.visible && this.bind.data?.id === device.id) {
        this.bind.data.value = device.value;
        this.bind.data.manual = device.manual;
        this.bind.data.name = device.name;
        this.bind.data.operationalRanges = device.operationalRanges;
        if (this.bind.data.parsedRanges !== undefined) {
          // Re-parse ranges if the component that opened this overlay provides a parser
          // For now, just update the raw data
        }
      }
    });
  }

  unmount() {
    this.unsubscribeDeviceUpdate?.();
  }
}

export const OverlayModal = new OverlayModalClass();

let startPosition: ModalRectangle | null = null;
let onCloseHook: (() => void) | null = null;
/** The pending close→teardown timer (see closeOverlay). Tracked so a fresh openOverlay()
 * can cancel a stale one — otherwise it fires ~300ms later and wipes the freshly-opened
 * overlay's data/visibility right out from under it (EFFECT_CREATION_REPAIR 1.4). */
let teardownTimer: ReturnType<typeof setTimeout> | null = null;

/** Honor prefers-reduced-motion: the sheet appears/disappears IN PLACE — no
 * grow-from-rect choreography. Besides a11y, this removes the load-sensitive
 * window where the sheet sits at its start rect waiting for the deferred
 * final-position render (overlay.scss zeroes the matching transitions). */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function openOverlay(context: ModalContext) {
  if (!OverlayModal.mounted) OverlayModal.mount();

  const doOpen = () => {
    // Cancel any teardown left running by a closeOverlay() we just triggered ourselves
    // (the safety-net branch below) — otherwise it fires later and wipes this fresh
    // overlay's data/visibility. Also clear `closing` so a superseded overlay's close-out
    // animation can never bleed into this open (both classes present would fight in CSS).
    if (teardownTimer) {
      clearTimeout(teardownTimer);
      teardownTimer = null;
    }
    OverlayModal.bind.closing = false;

    onCloseHook = context.onClose || null;
    OverlayModal.bind.template = context.template;
    OverlayModal.bind.data = context.data;
    OverlayModal.bind.actions = context.actions || {};
    OverlayModal.bind.visible = true;
    const finalRect = () => {
      OverlayModal.bind.position = {
        top: context.padding.y + "px",
        left: context.padding.x + "px",
        height: `calc(100% - ${context.padding.y * 2}px)`,
        maxHeight: `calc(100% - ${context.padding.y * 2}px)`,
        width: `calc(100% - ${context.padding.x * 2}px)`,
      };
    };
    startPosition = context.startRect;
    if (prefersReducedMotion()) {
      finalRect();
      return;
    }
    OverlayModal.bind.opening = true;
    setRectStyles(context.startRect);
    setTimeout(finalRect);
    setTimeout(() => (OverlayModal.bind.opening = false), 300);
  };

  if (OverlayModal.bind.visible) {
    // Safety net (EFFECT_CREATION_REPAIR B3): a stuck-visible overlay (e.g. a save path that
    // never reached closeOverlay) used to make every subsequent openOverlay() silently no-op
    // forever — the reported "app freeze". Instead of refusing, tear the stale one down and
    // open the new one the moment that teardown actually finishes — NOT on a guessed delay:
    // under normal motion closeOverlay()'s own exit animation keeps `visible` true for ~300ms,
    // and racing doOpen() against that stomped fresh data/template onto a still-mounted stale
    // overlay (the outgoing template's bindings then evaluate against mismatched data and
    // throw). Chaining onto its real completion via the callback is race-free either way.
    closeOverlay(doOpen);
    return;
  }
  doOpen();
}

export function closeOverlay(afterTeardown?: () => void) {
  if (!OverlayModal.mounted) {
    afterTeardown?.();
    return;
  }
  try {
    onCloseHook?.();
  } catch {
    /* teardown must never block the close animation */
  }
  onCloseHook = null;
  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }
  const teardown = () => {
    // `visible` flips off FIRST: it's the sole gate on the whole rendered subtree
    // (`:if="this.visible"` in overlay-modal.html), so nothing downstream can attempt to
    // re-evaluate the outgoing template's bindings (e.g. a multi-arm rule's nested
    // `this.data.newEffect.arms.length`) against the now-cleared `data`/`actions` below.
    OverlayModal.bind.visible = false;
    OverlayModal.bind.data = {};
    OverlayModal.bind.actions = {};
    OverlayModal.bind.closing = false;
    teardownTimer = null;
    afterTeardown?.();
  };
  if (prefersReducedMotion()) {
    teardown();
    return;
  }
  OverlayModal.bind.closing = true;
  if (startPosition) setRectStyles(startPosition);
  teardownTimer = setTimeout(teardown, 300);
}

export function updateOverlayData(data: any) {
  if (OverlayModal.mounted) {
    OverlayModal.bind.data = data;
  }
}

/** Current overlay blob — for async callbacks (media errors, timers) that need
 * to repaint but hold a stale `data` snapshot from when they were registered. */
export function getOverlayData(): any {
  return OverlayModal.mounted ? OverlayModal.bind.data : {};
}

function setRectStyles(rect: ModalRectangle) {
  OverlayModal.bind.position = {
    top: rect.top + "px",
    left: rect.left + "px",
    height: rect.height + "px",
    maxHeight: rect.height + "px",
    width: rect.width + "px",
  };
}

// Mount at module load time (it's always in the DOM)
OverlayModal.mount();
