import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.BUILT_PORT || 4390);
const basePath = (process.env.BUILT_BASE_PATH || "").replace(/\/$/, "");
const baseURL =
  process.env.BUILT_BASE_URL || `http://127.0.0.1:${port}${basePath}/`;
const label = basePath ? "pages" : "root";
export default defineConfig({
  testDir: "./tests/production",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: `test-results/production-${label}`,
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "production-desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "production-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer:
    process.env.BUILT_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "node scripts/serve-built.mjs",
          url: baseURL,
          reuseExistingServer: false,
          timeout: 30000,
        },
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: `playwright-report/production-${label}` },
    ],
    [
      "json",
      { outputFile: `playwright-report/production-${label}/summary.json` },
    ],
  ],
});
