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
  endRect: ModalRectangle,
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

const position = { start: {}, end: {} }

export function openOverlay(context: ModalContext) {
  bind.template = context.template;
  bind.data = context.data;
  bind.visible = true;
  bind.opening = true;
  // Let the modal take its initial position
  bind.position = context.startRect;
  position.start = context.startRect;
  setTimeout(() => {
    bind.position = {
      top: '60px',
      left: '20px',
      height: 'calc(100% - 120px)',
      width: 'calc(100% - 40px)'
    }
  });
  // It takes 500ms to animate open this modal
  setTimeout(() => bind.opening = false, 500);
}

export function closeOverlay() {
  bind.closing = true;
  // bind.visible = false;
  bind.position = position.start;
  setTimeout(() => {
    bind.visible = false;
    bind.closing = false;
  }, 300);
}
