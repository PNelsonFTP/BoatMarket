import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { makeSeed } from "../../lib/seed";
import { DEFAULT_FILTERS, type Listing } from "../../lib/types";
import { buildSearchCatalog } from "../../server/snapshot-catalog";

const hash = (body: string | Buffer) =>
  createHash("sha256").update(body).digest("hex");
const listings = makeSeed()
  .slice(0, 3)
  .map((listing, index) => ({
    ...listing,
    id: `built-${index}`,
    source: "Built fixture",
    sourceListingId: `built-${index}`,
    sourceUrl: `https://dealer.example/boat-${index}`,
    title: `Production ${index === 0 ? "Atlas" : "Beacon"} ${index}`,
    make: index === 0 ? "Atlas" : "Beacon",
    model: `Model ${index}`,
    groupId: null,
    vesselId: null,
    isSample: false,
    status: "active" as const,
    photos: ["/photos/fishing.jpg"],
    price: 25000 + index * 10000,
    fieldProvenance: {
      length: [
        {
          value: listing.length,
          sourceUrl: `https://dealer.example/boat-${index}`,
          source: "Built fixture",
          observedAt: "2026-09-12T12:00:00.000Z",
          method: "source" as const,
        },
        {
          value: listing.length,
          sourceUrl: `https://dealer.example/boat-${index}`,
          source: "Built fixture",
          observedAt: "2026-10-20T12:00:00.000Z",
          method: "detail" as const,
        },
      ],
    },
  }));
const fixture = JSON.stringify({
  generatedAt: "2026-10-21T12:00:00.000Z",
  listings,
});
const fixtureHash = hash(fixture);
function guard(page: Page, baseURL: string) {
  const errors: string[] = [],
    missing: string[] = [];
  const localOrigin = new URL(baseURL).origin;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      new URL(response.url()).origin === localOrigin
    )
      missing.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    if (
      new URL(request.url()).origin === localOrigin &&
      !request.failure()?.errorText.includes("ERR_ABORTED")
    )
      missing.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  return () => {
    expect(errors, "browser runtime errors").toEqual([]);
    expect(missing, "missing local assets").toEqual([]);
  };
}
const browseURL = (baseURL: string, filters = DEFAULT_FILTERS) => {
  const url = new URL(baseURL);
  url.searchParams.set("f", JSON.stringify(filters));
  return url.href;
};
async function fixtureRoutes(page: Page, baseURL: string, body = fixture) {
  await page.route(new URL("data-mode.json", baseURL).href, (route) =>
    route.fulfill({
      json: {
        snapshot: true,
        path: `snapshots/${fixtureHash}.json`,
        sha256: fixtureHash,
      },
    }),
  );
  await page.route(
    new URL(`snapshots/${fixtureHash}.json`, baseURL).href,
    (route) => route.fulfill({ contentType: "application/json", body }),
  );
}
async function catalogFixtureRoutes(page: Page, baseURL: string) {
  const built = buildSearchCatalog(fixture);
  await page.route(new URL("data-mode.json", baseURL).href, (route) =>
    route.fulfill({
      json: {
        snapshot: true,
        path: `snapshots/${fixtureHash}.json`,
        sha256: fixtureHash,
        catalog: built.reference,
      },
    }),
  );
  for (const file of built.files)
    await page.route(new URL(file.path, baseURL).href, (route) =>
      route.fulfill({ contentType: "application/json", body: file.body }),
    );
  return built;
}
test("production assets, snapshot activation, search, filters, images and navigation work without Falcon ads", async ({
  page,
  baseURL,
}) => {
  const check = guard(page, baseURL!);
  await fixtureRoutes(page, baseURL!);
  await page.goto(browseURL(baseURL!));
  await expect(page.locator(".mode-banner")).toContainText(
    "Snapshot workspace",
  );
  await expect(page.locator(".boat-card")).toHaveCount(3);
  expect(await page.locator(".card-title").allTextContents()).not.toEqual(
    expect.arrayContaining([expect.stringMatching(/Falcon/i)]),
  );
  const image = page.locator(".boat-card img").first();
  await expect(image).toBeVisible();
  expect(
    await image.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      return element.naturalWidth > 0;
    }),
  ).toBe(true);
  expect(
    new URL((await image.getAttribute("src")) || "", baseURL).pathname,
  ).toBe(`${new URL(baseURL!).pathname}photos/fishing.jpg`);
  const search = page.getByRole("textbox", { name: "Search boats" });
  await search.fill("Atlas");
  await expect(page.locator(".boat-card")).toHaveCount(1);
  await expect(page.locator(".card-title")).toContainText("Atlas");
  await search.fill("NoMatchingBoatFixture9b6b");
  await expect(page.locator(".boat-card")).toHaveCount(0);
  await expect(
    page.getByText("No boats match this search", { exact: true }),
  ).toBeVisible();
  await search.fill("");
  await page
    .getByRole("combobox", { name: "Sort boats" })
    .selectOption("price-desc");
  await expect(page.locator(".card-title").first()).toContainText(
    "Beacon Model 2",
  );
  if (test.info().project.name.endsWith("mobile")) {
    await page.getByRole("button", { name: /^Filters / }).click();
    await expect(page.getByLabel("Close filters")).toBeVisible();
  }
  const filters = page.getByLabel("Search filters");
  await filters.getByLabel("Find a filter").fill("price");
  await filters
    .getByRole("spinbutton", { name: "Maximum Asking price", exact: true })
    .fill("30000");
  if (test.info().project.name.endsWith("mobile"))
    await page.getByLabel("Close filters").click();
  await expect(page.locator(".boat-card")).toHaveCount(1);
  await expect(page.locator(".card-title")).toContainText("Atlas");
  await page.getByRole("button", { name: /Asking price:.*30,000/ }).click();
  await expect(page.locator(".boat-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const example = page.getByRole("link", {
    name: "Download a listing import example",
  });
  await expect(example).toBeVisible();
  expect(
    (
      await page.request.get(
        new URL((await example.getAttribute("href")) || "", baseURL!).href,
      )
    ).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.locator(".boat-card")).toHaveCount(3);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  check();
});
test("a snapshot hash mismatch never activates unverified inventory", async ({
  page,
  baseURL,
}) => {
  const check = guard(page, baseURL!);
  await fixtureRoutes(page, baseURL!, `${fixture}\n`);
  await page.goto(browseURL(baseURL!));
  await expect(page.getByText(/failed its integrity check/)).toBeVisible();
  await expect(page.locator(".mode-banner")).not.toContainText(
    "Snapshot workspace",
  );
  check();
});
test("the versioned catalog defers evidence reads and hydrates history on demand", async ({
  page,
  baseURL,
}) => {
  const check = guard(page, baseURL!);
  const built = await catalogFixtureRoutes(page, baseURL!);
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.goto(browseURL(baseURL!, { ...DEFAULT_FILTERS, q: "Atlas" }));
  await expect(page.locator(".mode-banner")).toContainText(
    "Snapshot workspace",
  );
  await expect(page.locator(".boat-card")).toHaveCount(1);
  expect(requested).toContain(new URL(built.reference.path, baseURL!).href);
  expect(
    requested.some(
      (url) => url.includes("/snapshots/") || url.includes("/catalog-details/"),
    ),
  ).toBe(false);
  await page.locator(".card-title").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect
    .poll(
      () => requested.filter((url) => url.includes("/catalog-details/")).length,
    )
    .toBe(1);
  await dialog
    .getByText("Specification sources and observation history", { exact: true })
    .click();
  await expect(
    dialog.getByText("2 observations", { exact: true }),
  ).toBeVisible();
  await dialog.getByText("2 observations", { exact: true }).click();
  await expect(
    dialog.getByRole("link", { name: "Source", exact: true }),
  ).toHaveCount(2);
  check();
});
test("merging a browser import preserves all evidence from an unhydrated catalog", async ({
  page,
  baseURL,
}) => {
  const check = guard(page, baseURL!);
  await catalogFixtureRoutes(page, baseURL!);
  const detailReads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/catalog-details/"))
      detailReads.push(request.url());
  });
  await page.goto(browseURL(baseURL!));
  await expect(page.locator(".mode-banner")).toContainText(
    "Snapshot workspace",
  );
  await expect(page.locator(".boat-card")).toHaveCount(3);
  expect(detailReads).toEqual([]);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const added = {
    ...listings[0],
    id: "import-added",
    sourceListingId: "import-added",
    sourceUrl: "https://dealer.example/import-added",
    title: "Atlas Added Boat",
  };
  await page.getByLabel("Import listing JSON", { exact: true }).setInputFiles({
    name: "additional-listing.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ listings: [added] })),
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 validated listings");
  await dialog
    .getByRole("checkbox", {
      name: "I reviewed the import destination and behavior.",
    })
    .check();
  await dialog.getByRole("button", { name: "Confirm listing import" }).click();
  await expect(dialog).not.toBeVisible();
  expect(detailReads).toHaveLength(1);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export listings", exact: true })
    .click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.listings).toHaveLength(4);
  for (const original of listings) {
    const retained = exported.listings.find(
      (listing: Listing) => listing.id === original.id,
    );
    expect(retained.fieldProvenance).toEqual(original.fieldProvenance);
    expect(retained.firstSeenAt).toBe(original.firstSeenAt);
    expect(retained.lastSeenAt).toBe(original.lastSeenAt);
  }
  check();
});
test("the actual built inventory matches its immutable pointer and can be searched", async ({
  page,
  baseURL,
}, testInfo) => {
  const check = guard(page, baseURL!);
  const configResponse = await page.request.get(
    new URL("data-mode.json", baseURL!).href,
  );
  expect(configResponse.ok()).toBe(true);
  const activation = await configResponse.json();
  expect(activation.snapshot).toBe(true);
  expect(activation.path).toMatch(/^snapshots\/[a-f0-9]{64}\.json$/);
  expect(activation.path).toBe(`snapshots/${activation.sha256}.json`);
  const response = await page.request.get(
    new URL(activation.path, baseURL!).href,
  );
  expect(response.ok()).toBe(true);
  const body = await response.body();
  expect(hash(body)).toBe(activation.sha256);
  const snapshot: { listings: Listing[] } = JSON.parse(body.toString());
  const active =
    snapshot.listings.find((listing) => listing.status === "active") ||
    snapshot.listings[0];
  expect(active, "real snapshot has a searchable ad").toBeTruthy();
  const token = active!.title.match(/[A-Za-z]{3,}/)?.[0] || active!.title;
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  if (activation.catalog) {
    const catalogResponse = await page.request.get(
      new URL(activation.catalog.path, baseURL!).href,
    );
    expect(catalogResponse.ok()).toBe(true);
    expect(hash(await catalogResponse.body())).toBe(activation.catalog.sha256);
    expect(activation.catalog.snapshotHash).toBe(activation.sha256);
  }
  const started = performance.now();
  await page.goto(
    browseURL(baseURL!, {
      ...DEFAULT_FILTERS,
      q: token,
      criteria: active!.status === "active" ? DEFAULT_FILTERS.criteria : {},
    }),
  );
  await expect(page.locator(".mode-banner")).toContainText(
    "Snapshot workspace",
  );
  await expect(page.locator(".boat-card").first()).toBeVisible();
  if (activation.catalog)
    expect(requested).toContain(
      new URL(activation.catalog.path, baseURL!).href,
    );
  const image = page.locator(".boat-card img").first();
  // Remote seller photos may expire or deny automation; deterministic local image
  // loading is asserted above. Here only test a local image if one is published.
  if (
    (await image.count()) &&
    (await image.getAttribute("src"))?.startsWith("/")
  )
    expect(
      await image.evaluate(async (element: HTMLImageElement) => {
        await element.decode();
        return element.naturalWidth > 0;
      }),
    ).toBe(true);
  await page.locator(".card-title").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await testInfo.attach("actual-built-summary", {
    contentType: "application/json",
    body: Buffer.from(
      JSON.stringify(
        {
          baseURL,
          count: snapshot.listings.length,
          snapshotHash: activation.sha256,
          searchToken: token,
          catalogHash: activation.catalog?.sha256 || null,
          readyAndDetailMs: Math.round(performance.now() - started),
        },
        null,
        2,
      ),
    ),
  });
  check();
});
test("browser benchmarks compare full and lazy startup on current and larger inventories", async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(120000);
  const activation = await (
    await page.request.get(new URL("data-mode.json", baseURL!).href)
  ).json();
  const response = await page.request.get(
    new URL(activation.path, baseURL!).href,
  );
  expect(response.ok()).toBe(true);
  const originalBody = (await response.body()).toString();
  const original: { generatedAt?: string; listings: Listing[] } =
    JSON.parse(originalBody);
  const targetCount = Math.ceil(original.listings.length * 1.25);
  const larger = Array.from({ length: targetCount }, (_, index) => {
    const listing = original.listings[index % original.listings.length];
    const generation = Math.floor(index / original.listings.length);
    return {
      ...listing,
      id: `benchmark-${index}`,
      sourceListingId: `benchmark-${index}`,
      groupId: listing.groupId
        ? `${listing.groupId}-benchmark-${generation}`
        : null,
      vesselId: listing.vesselId
        ? `${listing.vesselId}-benchmark-${generation}`
        : null,
    };
  });
  const cases = [
    { name: "current", body: originalBody },
    {
      name: "125-percent",
      body: JSON.stringify({
        generatedAt: original.generatedAt,
        listings: larger,
      }),
    },
  ];
  const metrics: unknown[] = [];
  for (const input of cases) {
    const snapshot: { listings: Listing[] } = JSON.parse(input.body);
    const snapshotHash = hash(input.body);
    const active =
      snapshot.listings.find((listing) => listing.status === "active") ||
      snapshot.listings[0];
    const token = active.title.match(/[A-Za-z]{3,}/)?.[0] || active.title;
    let built: ReturnType<typeof buildSearchCatalog>;
    try {
      built = buildSearchCatalog(input.body);
    } catch (error) {
      if (input.name === "current") throw error;
      metrics.push({
        sample: input.name,
        count: snapshot.listings.length,
        unsupported: (error as Error).message,
      });
      continue;
    }
    for (const lazy of [false, true]) {
      await page.unrouteAll();
      const requested: string[] = [];
      const listener = (request: import("@playwright/test").Request) =>
        requested.push(request.url());
      page.on("request", listener);
      await page.route(new URL("data-mode.json", baseURL!).href, (route) =>
        route.fulfill({
          json: {
            snapshot: true,
            path: `snapshots/${snapshotHash}.json`,
            sha256: snapshotHash,
            ...(lazy ? { catalog: built.reference } : {}),
          },
        }),
      );
      await page.route(
        new URL(`snapshots/${snapshotHash}.json`, baseURL!).href,
        (route) =>
          route.fulfill({ contentType: "application/json", body: input.body }),
      );
      for (const file of built.files)
        await page.route(new URL(file.path, baseURL!).href, (route) =>
          route.fulfill({ contentType: "application/json", body: file.body }),
        );
      const started = performance.now();
      await page.goto(
        browseURL(baseURL!, {
          ...DEFAULT_FILTERS,
          q: token,
          criteria: active.status === "active" ? DEFAULT_FILTERS.criteria : {},
        }),
      );
      await expect(page.locator(".mode-banner")).toContainText(
        "Snapshot workspace",
      );
      await expect(page.locator(".boat-card").first()).toBeVisible();
      const readyMs = Math.round(performance.now() - started);
      if (lazy) {
        expect(requested).toContain(
          new URL(built.reference.path, baseURL!).href,
        );
        expect(
          requested.some(
            (url) =>
              url.includes("/snapshots/") || url.includes("/catalog-details/"),
          ),
        ).toBe(false);
      }
      const filtering = performance.now();
      await page
        .getByRole("textbox", { name: "Search boats" })
        .fill("BenchmarkNoMatchingBoat9b6b");
      await expect(page.locator(".boat-card")).toHaveCount(0);
      const filterInteractionMs = Math.round(performance.now() - filtering);
      const initialBody = lazy ? built.files[0].body : input.body;
      const browser = await page.evaluate((body) => {
        const diagnosticMemory = () =>
          (
            performance as Performance & {
              memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
            }
          ).memory?.usedJSHeapSize ?? null;
        const heapBeforeParseProbe = diagnosticMemory();
        const start = performance.now();
        const parsed = JSON.parse(body);
        const parseMs = performance.now() - start;
        return {
          jsonParseMs: parseMs,
          records: parsed.listings.length,
          applicationMeasures: performance
            .getEntriesByType("measure")
            .map((entry) => ({ name: entry.name, durationMs: entry.duration })),
          heapBeforeParseProbe,
          heapAfterParseProbe: diagnosticMemory(),
          resources: performance
            .getEntriesByType("resource")
            .filter((entry) =>
              /\/(?:snapshots|catalogs|catalog-details)\//.test(entry.name),
            )
            .map((entry) => {
              const resource = entry as PerformanceResourceTiming;
              return {
                path: new URL(resource.name).pathname,
                encodedBytes: resource.encodedBodySize,
                decodedBytes: resource.decodedBodySize,
              };
            }),
        };
      }, initialBody);
      metrics.push({
        sample: input.name,
        mode: lazy ? "catalog" : "full",
        count: snapshot.listings.length,
        initialJsonBytes: Buffer.byteLength(initialBody),
        readyMs,
        filterInteractionMs,
        detailRequestsBeforeOpen: requested.filter((url) =>
          url.includes("/catalog-details/"),
        ).length,
        ...browser,
      });
      page.off("request", listener);
    }
  }
  await testInfo.attach("browser-payload-benchmark", {
    contentType: "application/json",
    body: Buffer.from(
      JSON.stringify(
        {
          profile: testInfo.project.name,
          baseURL,
          notes:
            "Diagnostic measurements, not timing assertions. Route-served decoded JSON byte counts are exact; browser transfer timing may report zero for intercepted responses. Heap is a Chromium diagnostic, not a peak or isolated-process measurement. JSON parse is measured separately from application validation marks. Filter interaction includes browser/render/test-driver work. Each current/larger full-vs-catalog pair uses the same device profile.",
          samples: metrics,
        },
        null,
        2,
      ),
    ),
  });
});
