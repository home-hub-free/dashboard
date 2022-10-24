// Views
import { NavBar } from "./nav-bar/nav-bar";
import { PopupMessage } from "./popup-message/popup-message";
import { initWebSockets } from "./utils/ws-handler";
import { OverlayModal } from "./overlay-modal/overlay-modal";

// CSS
import "./styles/style.scss";

function init() {
  // Init Binds by just importing and using the imports in the main.ts file
  NavBar;
  // ContentSection;
  PopupMessage;
  OverlayModal;
}

init();
initWebSockets();
