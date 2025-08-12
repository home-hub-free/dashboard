import { Bind } from "bindrjs";
import template from "./overlay-modal.html?raw";

interface ModalRectangle {
  top: number;
  left: number;
  height: number;
  width: number;
}

type ModalContext = {
  template: string;
  data: any;
  actions?: any;
  startRect: ModalRectangle;
  padding: {
    x: number;
    y: number;
  };
};

export const OverlayModal = new Bind<any>({
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
    closeOverlay,
  },
});
const bind = OverlayModal.bind;

let startPosition: any = {};
export function openOverlay(context: ModalContext) {
  if (bind.visible) return;
  bind.template = context.template;
  bind.data = context.data;
  bind.actions = context.actions || {};
  bind.visible = true;
  bind.opening = true;
  setRectStyles(context.startRect);
  startPosition = context.startRect;
  setTimeout(() => {
    bind.position = {
      top: context.padding.y + "px",
      left: context.padding.x + "px",
      height: `calc(100% - ${context.padding.y * 2}px)`,
      maxHeight: `calc(100% - ${context.padding.y * 2}px)`,
      width: `calc(100% - ${context.padding.x * 2}px)`,
    };
  });
  // It takes 500ms to animate open this modal
  setTimeout(() => (bind.opening = false), 300);
}

export function closeOverlay() {
  bind.closing = true;
  setRectStyles(startPosition);
  setTimeout(() => {
    bind.data = {};
    bind.actions = {};
    bind.visible = false;
    bind.closing = false;
  }, 300);
}

function setRectStyles(rect: ModalRectangle) {
  // Let the modal take its initial position
  bind.position = {
    top: rect.top + "px",
    left: rect.left + "px",
    height: rect.height + "px",
    maxHeight: rect.height + "px",
    width: rect.width + "px",
  };
}
