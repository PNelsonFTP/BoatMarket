import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
const server = Fastify();
await server.register(fastifyStatic, {
  root: resolve("out"),
  prefix: "/BoatMarket/",
});
await server.listen({ host: "127.0.0.1", port: 4390 });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  const missing = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith("http://127.0.0.1:4390"))
      missing.push(r.url());
  });
  await page.goto("http://127.0.0.1:4390/BoatMarket/");
  await page.locator(".boat-card").first().waitFor();
  await page
    .locator(".boat-card img")
    .first()
    .evaluate((img) => img.decode());
  const dataMode = JSON.parse(await readFile("public/data-mode.json", "utf8"));
  if (dataMode.snapshot)
    await expect(page.locator(".mode-banner")).toContainText(
      "Snapshot workspace",
    );
  await page
    .getByRole("textbox", { name: "Search boats" })
    .fill(dataMode.snapshot ? "Falcon" : "Lund");
  if (dataMode.snapshot) {
    await expect(page.locator(".boat-card").first()).toBeVisible();
    for (const title of await page.locator(".card-title").allTextContents())
      if (!/Falcon/i.test(title))
        throw new Error("Static search did not filter the cards");
  } else await expect(page.locator(".boat-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("link", { name: "Download a listing import example" })
    .waitFor();
  if (errors.length || missing.length)
    throw new Error(JSON.stringify({ errors, missing }));
  console.log(
    JSON.stringify({
      repositoryPath: "/BoatMarket/",
      staticSearch: true,
      images: true,
      errors,
      missing,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
