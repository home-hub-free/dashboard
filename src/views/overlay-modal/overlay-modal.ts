import { Bind } from "bindrjs";
import template from './overlay-modal.template.html?raw';

interface ModalRectangle {
  top: number,
  left: number,
  height: number,
  width: number
};

interface ModalContext {
  template: string,
  data: any,
  startRect?: ModalRectangle,
  endTect?: ModalRectangle,
};

export const OverlayModal = new Bind({
  id: 'overlay-modal',
  template,
  bind: {
    visible: false,
    opening: false,
    template: '',
    data: {}
  }
});
const bind = OverlayModal.bind;

function open(context: ModalContext) {
  bind.template = context.template;
  bind.data = context.data;
  bind.visible = true;
  bind.opening = true;
}

function close() { }
