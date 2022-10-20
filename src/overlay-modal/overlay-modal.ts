import { Bind } from "bindrjs";
import template from './overlay-modal.template.html?raw';

interface ModalRectangle {
  top: string,
  left: string,
  height: string,
  width: string,
};

interface ModalContext {
  template: string,
  data: any,
  startRect: ModalRectangle,
  padding: {
    x: number,
    y: number
  }
  // endRect: ModalRectangle,
};

export const OverlayModal = new Bind({
  id: 'overlay-modal',
  template,
  bind: {
    visible: false,
    opening: false,
    closing: false,
    position: {},
    template: '',
    data: {},
    closeOverlay,
  }
});
const bind = OverlayModal.bind;

let startPosition: any = { }
export function openOverlay(context: ModalContext) {
  bind.template = context.template;
  bind.data = context.data;
  bind.visible = true;
  bind.opening = true;
  // Let the modal take its initial position
  bind.position = context.startRect;
  startPosition = context.startRect;
  setTimeout(() => {
    bind.position = {
      top: context.padding.y + 'px',
      left: context.padding.x + 'px',
      height: `calc(100% - ${context.padding.y * 2}px)`,
      width: `calc(100% - ${context.padding.x * 2}px)`
    }
  });
  // It takes 500ms to animate open this modal
  setTimeout(() => bind.opening = false, 300);
}

export function closeOverlay() {
  bind.closing = true;
  // bind.visible = false;
  bind.position = startPosition;
  setTimeout(() => {
    bind.visible = false;
    bind.closing = false;
  }, 300);
}
