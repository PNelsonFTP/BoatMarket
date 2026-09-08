import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/data-mode.json", (route) =>
    route.fulfill({ json: { snapshot: false } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find your next boat." }),
  ).toBeVisible();
  await expect(page.locator(".boat-card").first()).toBeVisible();
});
test("search, save a boat, write a note, compare, and persist", async ({
  page,
}) => {
  await page.getByRole("textbox", { name: "Search boats" }).fill("Lund");
  await expect(page.locator(".boat-card")).toHaveCount(4);
  const card = page.locator(".boat-card").first();
  await card.getByRole("button", { name: /^Save / }).click();
  await card.getByRole("button", { name: "Compare", exact: true }).click();
  await card.locator(".card-title").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("textbox", { name: /Notes for/ })
    .fill("Ask about service records.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Compare boats", exact: true })
    .click();
  await expect(page.locator(".compare-table")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Shortlist", exact: true }).click();
  await expect(page.locator(".boat-card")).toHaveCount(1);
  await page.locator(".card-title").first().click();
  await expect(page.getByRole("textbox", { name: /Notes for/ })).toHaveValue(
    "Ask about service records.",
  );
});
test("saved search, filtering, rule editor and theme", async ({
  page,
  isMobile,
}) => {
  await page.getByRole("button", { name: "Ski & wake", exact: true }).click();
  await expect(page.locator(".boat-card").first()).toContainText(
    "Ski / wake / surf",
  );
  await page
    .getByRole("button", { name: "Save this search", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search name" })
    .fill("Wake under budget");
  await page.getByRole("button", { name: "Save search", exact: true }).click();
  await page
    .getByRole("button", { name: "Saved searches", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Wake under budget", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Add rule set", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("My tow limit");
  await dialog.getByRole("spinbutton", { name: "Tow limit (lb)" }).fill("3500");
  await dialog.getByRole("button", { name: "Save rule set" }).click();
  await expect(
    page.getByRole("button", { name: /^My tow limit/ }),
  ).toBeVisible();
  if (!isMobile) {
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  }
});
test("map, unknown filters, empty states, and no horizontal overflow", async ({
  page,
  isMobile,
}) => {
  await page.getByRole("button", { name: "Map view", exact: true }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  if (isMobile) await page.getByRole("button", { name: /Filters \d/ }).click();
  await page
    .getByRole("textbox", { name: "Find a filter" })
    .fill("engine hours");
  await page
    .getByRole("spinbutton", { name: "Maximum Engine hours", exact: true })
    .fill("100");
  if (isMobile)
    await page.getByRole("button", { name: "Close filters" }).click();
  await expect(page.locator(".boat-card").first()).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search boats" })
    .fill("nonexistent boat abcxyz");
  await expect(
    page.getByRole("heading", { name: "No boats match this search" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
test("adds a manual listing without losing existing saved boats", async ({
  page,
}) => {
  const first = page.locator(".boat-card").first();
  await first.getByRole("button", { name: /^Save / }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Add a boat", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Listing title", exact: true })
    .fill("2020 Test Boat");
  await dialog
    .getByRole("textbox", { name: "Original listing URL" })
    .fill("https://example.com/manual-test");
  await dialog
    .getByRole("spinbutton", { name: "Price ($)", exact: true })
    .fill("12345");
  await dialog.getByRole("button", { name: "Add boat", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".mode-banner")).toContainText(
    "Snapshot workspace",
  );
  await page.getByRole("button", { name: "Shortlist", exact: true }).click();
  await expect(page.locator(".boat-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search boats" })
    .fill("2020 Test Boat");
  await expect(page.locator(".boat-card")).toHaveCount(1);
  await expect(page.locator(".boat-card")).toContainText("$12,345");
});
