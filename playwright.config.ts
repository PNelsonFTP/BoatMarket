import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.E2E_PORT || 3002);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer:
    process.env.E2E_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: `npm run dev:web -- --port ${port}`,
          url: baseURL,
          reuseExistingServer: process.env.E2E_REUSE_SERVER === "true",
          timeout: 120000,
        },
  reporter: [["list"], ["html", { open: "never" }]],
});
