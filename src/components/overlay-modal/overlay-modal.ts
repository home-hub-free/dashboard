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

export function openOverlay(context: ModalContext) {
  if (!OverlayModal.mounted) OverlayModal.mount();
  if (OverlayModal.bind.visible) return;

  OverlayModal.bind.template = context.template;
  OverlayModal.bind.data = context.data;
  OverlayModal.bind.actions = context.actions || {};
  OverlayModal.bind.visible = true;
  OverlayModal.bind.opening = true;
  setRectStyles(context.startRect);
  startPosition = context.startRect;
  setTimeout(() => {
    OverlayModal.bind.position = {
      top: context.padding.y + "px",
      left: context.padding.x + "px",
      height: `calc(100% - ${context.padding.y * 2}px)`,
      maxHeight: `calc(100% - ${context.padding.y * 2}px)`,
      width: `calc(100% - ${context.padding.x * 2}px)`,
    };
  });
  setTimeout(() => (OverlayModal.bind.opening = false), 300);
}

export function closeOverlay() {
  if (!OverlayModal.mounted) return;
  OverlayModal.bind.closing = true;
  if (startPosition) setRectStyles(startPosition);
  setTimeout(() => {
    OverlayModal.bind.data = {};
    OverlayModal.bind.actions = {};
    OverlayModal.bind.visible = false;
    OverlayModal.bind.closing = false;
  }, 300);
}

export function updateOverlayData(data: any) {
  if (OverlayModal.mounted) {
    OverlayModal.bind.data = data;
  }
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
