import { initWebSockets } from "./utils/ws-handler";
import { MainContent } from "./components/main-content/main-content";
import { NavBar } from "./components/nav-bar/nav-bar";
import { storageGet } from "./utils/utils.service";
import { NavActions } from "./store/actions";
import { syncState } from "./utils/sync";

// CSS
import "./styles/style.scss";

async function loadInitialData() {
  await syncState();
  const activeMenuId = storageGet('activeMenuItemId') || 'home';
  NavActions.setMenu(activeMenuId);
}

async function init() {
  await loadInitialData();
  NavBar.mount();
  MainContent.mount();
  initWebSockets();
}

init();
