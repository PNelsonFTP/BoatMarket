import { chromium, devices } from "@playwright/test";
import "dotenv/config";
import { mkdir } from "node:fs/promises";
const output = process.env.QA_OUTPUT || "/tmp/boatscout-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3000");
  await page.locator(".boat-card").first().waitFor();
  await page
    .locator(".boat-card img")
    .first()
    .evaluate((img) => img.decode());
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({ path: `${output}/dark.png` });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Backend password", { exact: true })
    .fill(process.env.BOATSCOUT_PASSWORD);
  await page
    .getByRole("button", { name: "Connect backend", exact: true })
    .click();
  await page.getByText("Connected to your backend", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.locator(".boat-card").first().waitFor();
  if (
    !(await page.locator(".mode-banner").innerText()).includes(
      "Connected workspace",
    )
  )
    throw new Error("Live connection not reflected in the UI");
  console.log(
    JSON.stringify({
      liveConnection: true,
      cards: await page.locator(".boat-card").count(),
      pageErrors: errors,
      webMcpAvailable: await page.evaluate(() => !!document.modelContext),
    }),
  );
  await context.close();
  const mobile = await browser.newContext({
    ...devices["iPhone 13"],
    defaultBrowserType: undefined,
  });
  const m = await mobile.newPage();
  await m.goto("http://127.0.0.1:3000");
  await m.locator(".boat-card").first().waitFor();
  await m
    .locator(".boat-card img")
    .first()
    .evaluate((img) => img.decode());
  await m.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  await mobile.close();
} finally {
  await browser.close();
}
