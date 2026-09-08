import { test, expect } from "@playwright/test";
import { makeSeed, seedWorkspace } from "../../lib/seed";
test("source health queues a refresh and location review saves explicit coordinates", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let refreshes = 0,
    corrections = 0;
  const boat = { ...makeSeed()[0], isSample: false };
  await page.route("**/data-mode.json", (r) =>
    r.fulfill({ json: { snapshot: false } }),
  );
  await page.route("http://127.0.0.1:54322/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/login") json = { token: "test-only" };
    else if (path === "/api/admin/alerts")
      json = {
        destinations: { emailConfigured: false, webhookConfigured: false },
        maximumAttempts: 5,
        semantics: "At least once",
        alerts: [],
      };
    else if (path === "/api/admin/operations")
      json = { locks: [], worker: null, jobs: [] };
    else if (path === "/api/admin/routing")
      json = { configured: false, base: "", provider: "OSRM", cacheDays: 7 };
    else if (path === "/api/admin/locations/listings") json = { listings: [] };
    else if (path === "/api/listings") json = { listings: [boat] };
    else if (path === "/api/workspace")
      json = { workspace: seedWorkspace(), revision: 0 };
    else if (path === "/api/admin")
      json = {
        sources: [],
        runs: [],
        geocodes: [],
        counts: { listings: 1, samples: 0 },
        failedDeliveries: [],
      };
    else if (path === "/api/admin/source-health")
      json = {
        sources: [],
        worker: null,
        workerFresh: false,
        refresh: null,
        collection: null,
        ledger: { sources: [] },
      };
    else if (path === "/api/admin/refresh") {
      expect(r.request().method()).toBe("POST");
      expect(r.request().postDataJSON()).toEqual({});
      refreshes++;
      json = { message: "Full refresh queued", runId: "test-run" };
    } else if (path === "/api/duplicates")
      json = {
        generatedAt: new Date().toISOString(),
        candidates: [],
        candidateTotal: 0,
        offset: 0,
        limit: 25,
        groups: [],
        decisions: [],
        counts: {
          advertisements: 1,
          groupedAds: 0,
          groups: 0,
          displayUnits: 1,
        },
      };
    else if (path === "/api/admin/locations") {
      if (r.request().method() === "PUT") {
        const input = r.request().postDataJSON();
        expect(input.lat).toBe(42.97);
        expect(input.lng).toBe(-85.95);
        expect(input.evidence).toBe("Checked city on map");
        corrections++;
        json = { updated: 1, message: "City center corrected" };
      } else
        json = {
          cities: [
            {
              key: "allendale, mi",
              city: "Allendale",
              state: "MI",
              ads: 1,
              unknown: 1,
              offsite: 0,
              point: null,
              review: null,
            },
          ],
          missingCity: 0,
        };
    } else {
      await r.fulfill({
        status: 404,
        json: { error: "Unknown fixture route" },
      });
      return;
    }
    await r.fulfill({ json });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Backend address" })
    .fill("http://127.0.0.1:54322");
  await page.getByLabel("Backend password", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Connect backend" }).click();
  await expect(
    page.getByText("Connected to http://127.0.0.1:54322", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh data & snapshot", exact: true })
    .click();
  await expect(
    page.getByText("Full refresh queued Run test-run."),
  ).toBeVisible();
  expect(refreshes).toBe(1);
  await page
    .getByRole("button", { name: "Allendale, MI · 1 ads · 1 unlocated" })
    .click();
  await page
    .locator("form")
    .filter({ hasText: "Correct Allendale" })
    .getByLabel("Latitude", { exact: true })
    .fill("42.97");
  await page
    .locator("form")
    .filter({ hasText: "Correct Allendale" })
    .getByLabel("Longitude", { exact: true })
    .fill("-85.95");
  await page
    .getByLabel("Evidence for this correction")
    .fill("Checked city on map");
  await page.getByRole("button", { name: "Save reviewed city center" }).click();
  await expect(
    page.getByText("City center corrected", { exact: true }),
  ).toBeVisible();
  expect(corrections).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
