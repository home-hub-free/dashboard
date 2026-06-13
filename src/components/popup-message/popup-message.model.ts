export type ToasterOptions = {
  from: "top" | "bottom" | "left" | "right";
  message: string;
  timer: number;
};

export type PopupMessageState = {
  toasterOptions: ToasterOptions | null;
  popToast: boolean;
  hidingToaster: boolean;
  hideToaster: () => void;
};
