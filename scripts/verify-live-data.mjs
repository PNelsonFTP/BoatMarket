import { chromium, devices, expect } from "@playwright/test";
import "dotenv/config";
import { mkdir, readFile } from "node:fs/promises";
const output = "/tmp/boatscout-live";
await mkdir(output, { recursive: true });
const snapshot = JSON.parse(await readFile("public/snapshot.json", "utf8"));
const expected = snapshot.listings.length;
const sourceCount = new Set(snapshot.listings.map((l) => l.source)).size;
const browser = await chromium.launch();
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(
      mobile
        ? { ...devices["iPhone 13"], defaultBrowserType: undefined }
        : { viewport: { width: 1440, height: 1050 } },
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3000/");
    await page.getByText("Lake Holiday is home.", { exact: true }).waitFor();
    await page.locator(".boat-card").first().waitFor();
    await expect(page.locator(".mode-banner")).toContainText(
      `${expected} listings`,
    );
    await page
      .locator(".boat-card img")
      .first()
      .evaluate((img) => img.decode());
    await page.screenshot({
      path: output + (mobile ? "/mobile.png" : "/desktop.png"),
      fullPage: false,
    });
    const shortlist = Number(
      (await page.locator(".results-toolbar strong").textContent()).split(
        " ",
      )[0],
    );
    await page.locator(".source-coverage summary").click();
    await expect(page.locator(".source-coverage tbody tr")).toHaveCount(
      sourceCount,
    );
    await expect(page.locator(".source-coverage summary")).toContainText(
      `${shortlist} shortlist matches`,
    );
    await page
      .getByRole("button", { name: "Browse all nearby ads", exact: true })
      .click();
    const nearby = Number(
      (await page.locator(".results-toolbar strong").textContent()).split(
        " ",
      )[0],
    );
    if (nearby <= shortlist)
      throw new Error("The wider view did not reveal more ads");
    await page
      .getByRole("button", { name: "Include unreported lengths", exact: true })
      .click();
    const review = Number(
      (await page.locator(".results-toolbar strong").textContent()).split(
        " ",
      )[0],
    );
    if (review <= shortlist)
      throw new Error("Unknown-length candidates are missing");
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      throw new Error("Coverage panel has horizontal overflow");
    await page.screenshot({
      path:
        output + (mobile ? "/coverage-mobile.png" : "/coverage-desktop.png"),
      fullPage: true,
    });
    await page.locator(".source-coverage summary").click();
    await page
      .getByRole("button", {
        name: "MasterCraft & peers · under 21 ft",
        exact: true,
      })
      .click();
    await page.locator(".boat-card").first().waitFor();
    const ski = await page.locator(".boat-card").count();
    await page.locator(".card-title").first().click();
    await page
      .getByRole("heading", { name: "Lake Holiday screening", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Fishing · 200+ hp · nearby", exact: true })
      .click();
    await page.locator(".boat-card").first().waitFor();
    const fishing = await page.locator(".boat-card").count();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      throw new Error("Horizontal overflow");
    console.log(
      JSON.stringify({
        device: mobile ? "mobile" : "desktop",
        snapshot: expected,
        sources: sourceCount,
        shortlist,
        nearby,
        review,
        fishingCards: fishing,
        skiCards: ski,
        pageErrors: errors,
      }),
    );
    if (errors.length) throw new Error(errors.join(";"));
    if (!mobile) {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByLabel("Backend password", { exact: true })
        .fill(process.env.BOATSCOUT_PASSWORD);
      await page
        .getByRole("button", { name: "Connect backend", exact: true })
        .click();
      await page
        .getByText("Connected to your backend", { exact: true })
        .waitFor();
      console.log("Authenticated backend connection verified.");
    }
    await context.close();
  }
} finally {
  await browser.close();
}
