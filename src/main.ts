// Views
import { NavBar } from "./views/nav-bar/nav-bar";
// import { ContentSection } from "./views/content/content-section";
import { PopupMessage } from "./views/popup-message/popup-message";
import { initWebSockets } from "./utils/ws-handler";

// CSS
import "./styles/style.scss";

// Init Binds by just importing and using the imports in the main.ts file
NavBar;
// ContentSection;
PopupMessage;

initWebSockets();
