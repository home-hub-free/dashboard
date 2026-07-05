/**
 * Version gate — force the client onto the latest deployed bundle.
 *
 * The home-screen (standalone PWA) launch is the problem case: it resumes in a
 * long-lived WebView with a warm service-worker cache, so a stale bundle + a
 * now-expired `authToken` can persist indefinitely (login fails, old UI sticks)
 * even after a fresh deploy. The service worker alone can't be trusted to
 * self-heal quickly on iOS, so we settle it deterministically here:
 *
 *   1. `__APP_VERSION__` is baked into this bundle at build time (vite.config.js).
 *   2. `/version.json` is written next to the bundle with the SAME stamp and is
 *      SW-bypassed (always network) — so it reflects what is *deployed*, not what
 *      is *cached*.
 *   3. On boot AND on resume/focus we compare the two. A mismatch means the code
 *      we are running is stale → wipe caches, drop the service worker, reload.
 *
 * Resume/focus matters most: a standalone app rarely does a cold navigation, so
 * checking only on load would never catch the update the user is complaining about.
 */

declare const __APP_VERSION__: string;

const RUNNING = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
// Remembers the version we already reloaded toward, so a bad/mislabelled deploy
// can't trap the app in a reload loop.
const RELOAD_FLAG = "hhf-version-reload";

let checking = false;

export async function checkVersion(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    let latest: string | undefined;
    try {
      const res = await fetch("/version.json", { cache: "no-store" });
      if (!res.ok) return; // dev (no file) / offline — never reload on a guess
      latest = (await res.json())?.version;
    } catch {
      return; // network error — keep running what we have
    }

    if (!latest || latest === RUNNING) {
      sessionStorage.removeItem(RELOAD_FLAG);
      return;
    }
    if (sessionStorage.getItem(RELOAD_FLAG) === latest) return; // already tried this one
    sessionStorage.setItem(RELOAD_FLAG, latest);
    await hardReload();
  } finally {
    checking = false;
  }
}

async function hardReload(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      // Unregister so the reload navigation hits the network directly (fresh
      // shell + fresh assets); main.ts re-registers a clean worker afterwards.
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* best-effort — reload regardless */
  }
  location.reload();
}

/** Wire boot + resume/focus checks. Call once from the entry point. */
export function initVersionGuard(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkVersion();
  });
  window.addEventListener("focus", () => void checkVersion());
}
