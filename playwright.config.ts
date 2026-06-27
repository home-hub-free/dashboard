import { defineConfig } from "@playwright/test";

// Visual harness for the dashboard redesign. Boots the Vite dev server on
// loopback (no --host, so it is NOT exposed to the LAN) and drives it headless.
// All backend calls are stubbed per-test (see tests/visual/stub.ts), so the hub
// / memory / voice services do NOT need to be running.
export default defineConfig({
  testDir: "./tests/visual",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8081",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: "npx vite --config vite.config.js --port 8081",
    url: "http://localhost:8081",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
