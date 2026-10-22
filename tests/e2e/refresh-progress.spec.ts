import { test, expect } from "@playwright/test";
import { makeSeed, seedWorkspace } from "../../lib/seed";

test("active-source progress and reviewable session controls show waits, recovery and explicit finalization", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const boat = { ...makeSeed()[0], isSample: false };
  const now = new Date().toISOString();
  let progressState = "waiting",
    attempted = 1,
    sessionsStarted = false,
    continued = false,
    finalized = false;
  const session = () => ({
    sessionId: "review-session",
    status: finalized ? "complete" : continued ? "review" : "partial",
    leaseLive: false,
    collectionPasses: continued ? 2 : 1,
    maxPasses: 5,
    canContinue: !continued,
    readyForCompleteExport: continued,
    errors: [],
    sources: [
      {
        sourceId: "fixture",
        source: "Fixture Dealer",
        latestInventory: { status: "accepted" },
        currentInventoryAds: 2,
        details: {
          succeeded: continued ? 2 : 1,
          eligible: 2,
          remaining: continued ? 0 : 1,
        },
        observations: { fetched: 0, cacheOnly: 3 },
        excludedReasons: [],
      },
    ],
  });
  await page.route("**/data-mode.json", (route) =>
    route.fulfill({ json: { snapshot: false } }),
  );
  await page.route("http://127.0.0.1:54322/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/login") json = { token: "test-only" };
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
    else if (path === "/api/admin/alerts")
      json = {
        destinations: { emailConfigured: false, webhookConfigured: false },
        maximumAttempts: 5,
        semantics: "At least once",
        alerts: [],
      };
    else if (path === "/api/admin/routing")
      json = { configured: false, base: "", provider: "OSRM", cacheDays: 7 };
    else if (path === "/api/admin/locations/listings") json = { listings: [] };
    else if (path === "/api/admin/locations")
      json = { cities: [], missingCity: 0 };
    else if (path === "/api/admin/source-health")
      json = {
        sources: [],
        worker: null,
        workerFresh: false,
        refresh: null,
        collection: null,
        ledger: { sources: [] },
      };
    else if (path === "/api/admin/operations")
      json = {
        locks: [
          { key: "collector", owner: "owner", live: true, expiresAt: now },
        ],
        worker: null,
        jobs: [
          {
            runId: "active-source",
            status: "running",
            leaseLive: true,
            stage: "collection",
            progressState,
            cancelRequested: progressState === "cancellation-pending",
            progress: {
              runId: "active-source",
              status: "running",
              source: "Fixture Dealer",
              sourceIndex: 1,
              sourceCount: 1,
              phase: "inventory",
              startedAt: now,
              elapsedMs: 10000,
              lastSuccessfulCheckpointAt: now,
              wait:
                progressState === "waiting"
                  ? {
                      reason: "Source robots.txt crawl delay",
                      until: new Date(Date.now() + 30000).toISOString(),
                    }
                  : null,
              metrics: {
                inventoryPagesSucceeded: attempted - 1,
                inventoryPagesAttempted: attempted,
                inventoryPagesDiscovered: 2,
                detailPagesAttempted: 0,
                detailPagesEligible: 2,
                detailPagesSucceeded: 0,
              },
            },
          },
        ],
      };
    else if (path === "/api/admin/operations/cancel") {
      expect(route.request().postDataJSON()).toEqual({
        runId: "active-source",
      });
      progressState = "cancellation-pending";
      json = { requestedAt: now };
    } else if (path === "/api/admin/refresh-sessions") {
      if (route.request().method() === "POST") {
        sessionsStarted = true;
        json = {
          sessionId: "review-session",
          message: "Refresh session queued",
        };
      } else json = sessionsStarted ? [session()] : [];
    } else if (path === "/api/admin/refresh-sessions/review-session/continue") {
      continued = true;
      json = { message: "Bounded continuation queued" };
    } else if (path === "/api/admin/refresh-sessions/review-session/finalize") {
      expect(route.request().postDataJSON()).toEqual({ allowPartial: false });
      finalized = true;
      json = { message: "Session finalization queued" };
    } else if (path === "/api/duplicates")
      json = {
        generatedAt: now,
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
    await route.fulfill({ json });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Backend address" })
    .fill("http://127.0.0.1:54322");
  await page.getByLabel("Backend password", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Connect backend" }).click();
  await expect(
    page.getByText(/Intentional wait: Source robots.txt crawl delay/),
  ).toBeVisible();
  progressState = "running";
  attempted = 3;
  await page
    .getByRole("button", { name: "Reload operation status", exact: true })
    .click();
  await expect(
    page.getByText(/inventory 2\/3 pages \(2 discovered\)/),
  ).toBeVisible();
  progressState = "possible-stall";
  await page
    .getByRole("button", { name: "Reload operation status", exact: true })
    .click();
  await expect(
    page.getByText(/Possible stall: no progress checkpoint/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel job", exact: true }).click();
  await expect(
    page.getByText(/Cancellation requested; waiting for the current request/),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Start reviewable refresh session",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      /Fixture Dealer: inventory accepted \(2 ads\).*details 1\/2 complete, 1 remain/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Finalize with explicit partial coverage",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue eligible work", exact: true })
    .click();
  await expect(
    page.getByText(
      /Fixture Dealer: inventory accepted \(2 ads\).*details 2\/2 complete, 0 remain/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finalize complete session", exact: true })
    .click();
  await expect(
    page.getByText("Session finalization queued", { exact: true }),
  ).toBeVisible();
  expect(finalized).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
