import "dotenv/config";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const directory = process.env.QA_OUTPUT || "/tmp/boatscout-review-qa";
await mkdir(directory, { recursive: true });
try {
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3000");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByLabel("Backend address", { exact: true })
      .fill("http://127.0.0.1:4310");
    await page
      .getByLabel("Backend password", { exact: true })
      .fill(process.env.BOATSCOUT_PASSWORD || "");
    await page.getByRole("button", { name: "Connect backend" }).click();
    await page
      .getByText("Connected to http://127.0.0.1:4310", { exact: true })
      .waitFor();
    const health = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Source health & refresh",
          exact: true,
        }),
      });
    await health.getByText("success", { exact: true }).first().waitFor();
    await health.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/${name}-source-health.png` });
    const duplicates = page.locator(".duplicate-review");
    await duplicates.getByText("163", { exact: false }).first().waitFor();
    await duplicates.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${directory}/${name}-duplicate-review.png`,
    });
    const locations = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Location review",
          exact: true,
        }),
      });
    await locations.getByRole("button").first().waitFor();
    await locations.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/${name}-location-review.png` });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error(`${name} horizontal overflow`);
    if (errors.length)
      throw new Error(`${name} runtime errors: ${errors.join("; ")}`);
    console.log(
      JSON.stringify({
        viewport: name,
        liveReviewPanels: "passed",
        runtimeErrors: 0,
        horizontalOverflow: false,
        screenshots: directory,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
