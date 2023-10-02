import { initWebSockets } from "./utils/ws-handler";
import { MainContent } from "./main-content/main-content";
import { NavBar } from "./nav-bar/nav-bar";

// CSS
import "./styles/style.scss";

function init() {
  NavBar.initView();
  MainContent.initView();
}

init();
initWebSockets();
