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
  /** Teardown for resources the overlay holds outside bind data (media players,
   * timers). Runs once on EVERY close path — ✕ button, backdrop, a re-open. */
  onClose?: () => void;
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
