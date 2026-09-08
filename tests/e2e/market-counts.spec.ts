import { expect, test } from "@playwright/test";
import { makeSeed } from "../../lib/seed";

test("market distinguishes matching ads from grouped records and retains out-of-filter links", async ({
  page,
}) => {
  const base = {
    ...makeSeed()[0],
    isSample: false,
    make: "Lund",
    title: "2026 Lund 1875 Pro V",
    length: 19,
    horsepower: 200,
    category: "Bass",
    lat: 41.618,
    lng: -88.668,
    status: "active" as const,
    groupId: "reviewed-group",
    price: 40000,
  };
  const listings = [
    {
      ...base,
      id: "first",
      sourceListingId: "first",
      sourceUrl: "https://example.com/first",
    },
    {
      ...base,
      id: "second",
      sourceListingId: "second",
      sourceUrl: "https://example.com/second",
    },
    {
      ...base,
      id: "sold",
      sourceListingId: "sold",
      sourceUrl: "https://example.com/sold",
      status: "sold",
      price: 10000,
    },
    {
      ...base,
      id: "single",
      sourceListingId: "single",
      sourceUrl: "https://example.com/single",
      groupId: null,
    },
  ];
  await page.route("**/data-mode.json", (route) =>
    route.fulfill({ json: { snapshot: true } }),
  );
  await page.route("**/snapshot.json", (route) =>
    route.fulfill({
      json: { generatedAt: "2026-09-08T00:00:00.000Z", listings },
    }),
  );
  await page.goto("/#market");
  await expect(
    page
      .locator(".market-stats > div")
      .filter({ hasText: "Matching advertisements" })
      .locator("strong"),
  ).toHaveText("3");
  await expect(
    page
      .locator(".market-stats > div")
      .filter({ hasText: "Research records after grouping" })
      .locator("strong"),
  ).toHaveText("2");
  await expect(
    page
      .locator(".market-stats > div")
      .filter({ hasText: "Median asking price" })
      .locator("strong"),
  ).toHaveText("$40,000");
  await expect(page.locator(".market-note")).toContainText(
    "1 records have linked advertisements; 1 have one advertisement",
  );
  await expect(page.locator(".market-note")).toContainText("4 associated ads");
});
