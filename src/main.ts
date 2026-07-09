import { initWebSockets } from "./utils/ws-handler";
import { MainContent } from "./components/main-content/main-content";
import { NavBar } from "./components/nav-bar/nav-bar";
import { storageGet } from "./utils/utils.service";
import { NavActions } from "./store/actions";
import { syncState } from "./utils/sync";
import { Login } from "./components/login/login";
import { fetchMe } from "./utils/auth";
import { checkVersion, initVersionGuard } from "./utils/version-guard";

// CSS
import "./styles/style.scss";

async function loadInitialData() {
  await syncState();
  const activeMenuId = storageGet('activeMenuItemId') || 'home';
  NavActions.setMenu(activeMenuId);
}

/** Drop the inline boot splash (index.html) — called the moment real UI exists
 *  to replace it: the app shell after first sync, or the login form. */
function removeBootSplash() {
  document.getElementById("boot-splash")?.remove();
}

async function startApp() {
  await loadInitialData();
  NavBar.mount();
  MainContent.mount();
  removeBootSplash();
  initWebSockets();
}

async function init() {
  // Before anything else, make sure we are the current build. If a stale bundle
  // is running (the classic home-screen-app failure — old code + a dead token that
  // can't log in), this wipes caches, drops the worker, and reloads; execution
  // stops here on that path. Then keep watching on resume/focus.
  await checkVersion();
  initVersionGuard();

  // Gate the dashboard behind a household login: the hub is the single front
  // door and identity feeds the agent (askAgent → data.user). A cached token is
  // validated against the hub; if it's missing/expired we show the login form
  // and only boot the app once the user signs in.
  const user = await fetchMe();
  if (user) {
    await startApp();
  } else {
    removeBootSplash(); // the login form is the first real UI on this path
    Login.mount(() => startApp());
  }
}

// If boot fails unexpectedly, drop the splash rather than spin forever.
init().catch((e) => {
  console.error("boot failed:", e);
  removeBootSplash();
});

// Register the service worker after first paint (off the critical path). It runtime-
// caches the immutable /assets/ bundle so repeat visits and the home-screen (standalone
// PWA) launch are instant instead of re-downloading everything. No-op on insecure
// origins (e.g. the http dev server) — the rejection is swallowed.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      // When a new worker finishes installing, tell it to activate immediately
      // instead of waiting for every tab to close.
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            sw.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    } catch {
      /* insecure origin (http dev server) — SW unavailable, no-op */
    }
  });
}
