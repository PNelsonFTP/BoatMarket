import { expect, test } from "@playwright/test";
import { makeSeed } from "../../lib/seed";
import { lakeHolidayWorkspace } from "../../lib/lake-holiday";
import { workspaceKey } from "../../lib/storage";

test("grouped ads retain visible separate notes when the representative changes", async ({
  page,
}) => {
  const base = {
    ...makeSeed()[0],
    isSample: false,
    groupId: "reviewed-group",
    make: "Lund",
    model: "1875 Pro V",
    title: "2026 Lund 1875 Pro V",
    year: 2026,
    length: 19,
    horsepower: 200,
    category: "Bass",
    lat: 41.618,
    lng: -88.668,
    city: "Lake Holiday",
    state: "IL",
    status: "active" as const,
  };
  const first = {
    ...base,
    id: "group-first",
    source: "First dealer",
    sourceListingId: "first",
    sourceUrl: "https://example.com/first",
    price: 40000,
  };
  const second = {
    ...base,
    id: "group-second",
    source: "Second dealer",
    sourceListingId: "second",
    sourceUrl: "https://example.com/second",
    price: 38000,
  };
  let records = [first, second];
  const workspace = {
    ...lakeHolidayWorkspace(),
    notes: {
      [first.id]: "First ad inspection\nAsk about trailer",
      [second.id]: "Second ad seller call",
    },
  };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: workspaceKey("snapshot"), value: workspace },
  );
  await page.route("**/data-mode.json", (route) =>
    route.fulfill({ json: { snapshot: true } }),
  );
  await page.route("**/snapshot.json", (route) =>
    route.fulfill({
      json: { generatedAt: "2026-09-08T00:00:00.000Z", listings: records },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".boat-card")).toHaveCount(1);
  await page.locator(".card-title").click();
  await expect(page.locator("#boat-note")).toHaveValue("Second ad seller call");
  const other = page.getByRole("region", {
    name: "Notes from other advertisements",
  });
  await expect(other).toContainText("First ad inspection");
  await expect(other).toContainText("Ask about trailer");
  await expect(other.getByRole("link")).toHaveAttribute(
    "href",
    first.sourceUrl,
  );
  await expect(other.locator("textarea,input")).toHaveCount(0);
  await page.locator("#boat-note").fill("Updated second ad note");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    workspaceKey("snapshot"),
  );
  expect(saved.notes).toEqual({
    [first.id]: workspace.notes[first.id],
    [second.id]: "Updated second ad note",
  });
  records = [{ ...first, price: 35000 }, second];
  await page.reload();
  await page.locator(".card-title").click();
  await expect(page.locator("#boat-note")).toHaveValue(
    workspace.notes[first.id],
  );
  await expect(
    page.getByRole("region", { name: "Notes from other advertisements" }),
  ).toContainText("Updated second ad note");
});
