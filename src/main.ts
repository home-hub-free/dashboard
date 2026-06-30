import { initWebSockets } from "./utils/ws-handler";
import { MainContent } from "./components/main-content/main-content";
import { NavBar } from "./components/nav-bar/nav-bar";
import { storageGet } from "./utils/utils.service";
import { NavActions } from "./store/actions";
import { syncState } from "./utils/sync";
import { Login } from "./components/login/login";
import { fetchMe } from "./utils/auth";

// CSS
import "./styles/style.scss";

async function loadInitialData() {
  await syncState();
  const activeMenuId = storageGet('activeMenuItemId') || 'home';
  NavActions.setMenu(activeMenuId);
}

async function startApp() {
  await loadInitialData();
  NavBar.mount();
  MainContent.mount();
  initWebSockets();
}

async function init() {
  // Gate the dashboard behind a household login: the hub is the single front
  // door and identity feeds the agent (askAgent → data.user). A cached token is
  // validated against the hub; if it's missing/expired we show the login form
  // and only boot the app once the user signs in.
  const user = await fetchMe();
  if (user) {
    await startApp();
  } else {
    Login.mount(() => startApp());
  }
}

init();

// Register the service worker after first paint (off the critical path). It runtime-
// caches the immutable /assets/ bundle so repeat visits and the home-screen (standalone
// PWA) launch are instant instead of re-downloading everything. No-op on insecure
// origins (e.g. the http dev server) — the rejection is swallowed.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
