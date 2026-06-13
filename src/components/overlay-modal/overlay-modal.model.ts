export interface ModalRectangle {
  top: number;
  left: number;
  height: number;
  width: number;
}

export type ModalContext = {
  template: string;
  data: any;
  actions?: any;
  startRect: ModalRectangle;
  padding: {
    x: number;
    y: number;
  };
};

export type OverlayModalState = {
  visible: boolean;
  opening: boolean;
  closing: boolean;
  position: Record<string, string>;
  template: string;
  data: any;
  actions: any;
  closeOverlay: () => void;
};
