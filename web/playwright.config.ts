import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests for the Hamame web frontend (Next.js dev server on :3001).
// reuseExistingServer lets this attach to an already-running `npm run dev`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    // 127.0.0.1 instead of localhost: on some Windows setups `localhost`
    // resolves to ::1 first and Chromium stalls while Node's fetch falls back
    // to IPv4 instantly — same host, no proxy/DNS behavior change.
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3001/login",
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
