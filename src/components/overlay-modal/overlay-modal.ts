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
  if (OverlayModal.bind.visible) return;

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
}

export function closeOverlay() {
  if (!OverlayModal.mounted) return;
  try {
    onCloseHook?.();
  } catch {
    /* teardown must never block the close animation */
  }
  onCloseHook = null;
  const teardown = () => {
    OverlayModal.bind.data = {};
    OverlayModal.bind.actions = {};
    OverlayModal.bind.visible = false;
    OverlayModal.bind.closing = false;
  };
  if (prefersReducedMotion()) {
    teardown();
    return;
  }
  OverlayModal.bind.closing = true;
  if (startPosition) setRectStyles(startPosition);
  setTimeout(teardown, 300);
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
