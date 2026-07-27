import { DataChanges } from "bindrjs";
import { Component } from "../../core/component";
import type { ToasterOptions, PopupMessageState } from "./popup-message.model";
import template from "./popup-message.html?raw";

class PopupMessageClass extends Component<PopupMessageState> {
  private currentTimeout: ReturnType<typeof setTimeout> | null = null;

  mount() {
    this.createBind({
      id: "popup-message-container",
      template,
      bind: {
        toasterOptions: null,
        popToast: false,
        hidingToaster: false,
        hideToaster: () => this.hideToaster(),
      },
      onChange: (changes: DataChanges) => this.onChange(changes),
    });
  }

  private onChange(changes: DataChanges) {
    // showMessage assigns the whole `toasterOptions` object (there is no write to
    // a `message` property, which the old check matched — the pop-in never fired,
    // audit D21). Pop only on a real toast, not on hideToaster's null reset.
    if (changes.property === 'toasterOptions' && changes.newValue) {
      this.bind.popToast = true;
      setTimeout(() => {
        this.bind.popToast = false;
      }, 180);
    }
  }

  private hideToaster() {
    this.bind.hidingToaster = true;
    setTimeout(() => {
      this.bind.toasterOptions = null;
      this.bind.hidingToaster = false;
    }, 180);
  }

  showMessage(options: ToasterOptions) {
    if (!this.mounted) this.mount();
    this.bind.toasterOptions = options;
    if (options.timer >= 0) {
      if (this.currentTimeout) clearTimeout(this.currentTimeout);
      this.currentTimeout = setTimeout(() => {
        this.hideToaster();
      }, options.timer);
    }
  }
}

export const PopupMessage = new PopupMessageClass();

export function showToaster(options: ToasterOptions) {
  PopupMessage.showMessage(options);
}

// Mount at module load time (it's always in the DOM)
PopupMessage.mount();
