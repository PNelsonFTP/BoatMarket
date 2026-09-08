import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { listingSchema } from "../lib/types";
import { sourceConfigSchema } from "../server/adapters/types";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  upsert: vi.fn(),
  parse: vi.fn(),
  renew: vi.fn(),
  findListing: vi.fn(),
  reconcile: vi.fn(),
  createRun: vi.fn(),
  updateRun: vi.fn(),
  stale: vi.fn(),
}));
vi.mock("../server/repository", () => ({
  acquireLock: mocks.acquire,
  releaseLock: mocks.release,
  upsertListing: mocks.upsert,
}));
vi.mock("../server/db", () => {
  const database = {
    jobLock: {
      updateMany: mocks.renew,
      findFirst: vi.fn(async () => ({ owner: "owner" })),
    },
    listing: {
      findUnique: mocks.findListing,
      findMany: async () => {
        const old = await mocks.findListing();
        return old ? [{ sourceListingId: "one", ...old }] : [];
      },
      updateMany: mocks.stale,
    },
    ingestRun: {
      updateMany: mocks.reconcile,
      create: mocks.createRun,
      update: mocks.updateRun,
    },
    $transaction: (callback: (tx: unknown) => unknown) => callback(database),
  };
  return { db: database };
});
vi.mock("../server/adapters", () => ({
  adapters: { dealer: { parse: mocks.parse } },
}));
vi.mock("../server/locations", () => ({
  readLocations: vi.fn(async () => []),
  locateListing: (listing: unknown) => listing,
}));
vi.mock("../server/network", () => ({
  requestPublic: vi.fn(async () => {
    throw new Error("Unexpected network request in fixture test");
  }),
  publicUrl: vi.fn(),
}));
import {
  collect,
  preserveEnrichedDetail,
  cacheAgeHours,
  listingContentFingerprint,
  mergeDetailObservation,
} from "../server/collector";
import { startCollectorLease } from "../server/lease";
import { collectionExitCode } from "../server/refresh-report";

let directory = "";
const inventoryUrl = "https://dealer.example/inventory";
const detailUrl = "https://dealer.example/boat/one";
const boat = (extra: object = {}) =>
  listingSchema.parse({
    id: "one",
    source: "Dealer",
    sourceListingId: "one",
    sourceUrl: detailUrl,
    title: "Lund Pro V",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  });
const source = sourceConfigSchema.parse({
  id: "dealer",
  name: "Dealer",
  adapter: "dealer",
  enabled: true,
  urls: [inventoryUrl],
  followDetails: true,
});
async function cache(url: string, html: string) {
  await writeFile(
    join(
      directory,
      "cache",
      createHash("sha256").update(url).digest("hex") + ".html",
    ),
    html,
  );
}
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), "boatscout-collection-"));
  await mkdir(join(directory, "cache"));
  vi.stubEnv("COLLECTION_CACHE_DIR", join(directory, "cache"));
  vi.stubEnv("REFRESH_REPORT_DIR", join(directory, "reports"));
  vi.stubEnv("EVIDENCE_ARCHIVE_DIR", join(directory, "evidence"));
  vi.stubEnv("ENRICHMENT_STATE_DIR", join(directory, "enrichment"));
  mocks.acquire.mockResolvedValue("owner");
  mocks.release.mockResolvedValue(undefined);
  mocks.renew.mockResolvedValue({ count: 1 });
  mocks.reconcile.mockResolvedValue({ count: 2 });
  mocks.createRun.mockResolvedValue({ id: "ingest-one" });
  mocks.updateRun.mockImplementation(async ({ data }) => ({
    id: "ingest-one",
    source: "Dealer",
    ...data,
  }));
  mocks.findListing.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue({ isNew: false, updated: true });
  mocks.stale.mockResolvedValue({ count: 0 });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("collection outcome and detail provenance", () => {
  it("returns busy without reconciling or writing records", async () => {
    mocks.acquire.mockResolvedValue(null);
    const result = await collect([source]);
    expect(result.status).toBe("busy");
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(result.reportPath, "utf8")).status).toBe(
      "busy",
    );
  });
  it("preserves an older successful detail observation when detail parsing fails", async () => {
    await cache(inventoryUrl, "summary");
    await cache(detailUrl, "invalid-detail");
    mocks.parse.mockImplementation((html) =>
      html === "summary" ? [boat({ price: 25000, length: 20 })] : [],
    );
    mocks.findListing.mockResolvedValue({
      data: boat({
        price: 30000,
        length: 20.75,
        horsepower: 250,
        engineHours: 180,
        photos: ["https://dealer.example/boat.jpg"],
        specs: {
          detailsCheckedAt: "2026-01-01T00:00:00.000Z",
          hin: "ABC12345A626",
        },
      }),
    });
    const result = await collect([source]);
    expect(result.status).toBe("partial");
    expect(result.reconciledRuns).toBe(2);
    expect(result.metrics[0]).toMatchObject({
      cacheHits: 2,
      fetchedPages: 0,
      detailPagesAttempted: 1,
      detailPagesFailed: 1,
    });
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved).toMatchObject({
      price: 25000,
      length: 20.75,
      horsepower: 250,
      engineHours: 180,
    });
    expect(saved.specs).toMatchObject({
      detailsCheckedAt: "2026-01-01T00:00:00.000Z",
      retainedDetailObservedAt: "2026-01-01T00:00:00.000Z",
      hin: "ABC12345A626",
    });
    expect(saved.specs.detailEnrichmentStatus).toContain("failed");
    expect(mocks.upsert.mock.calls[0][1]).toEqual({
      dedupe: true,
      collectorLease: { owner: "owner" },
    });
  });
  it("fails and aborts remaining writes immediately when its lease is lost", async () => {
    await cache(inventoryUrl, "summary");
    await cache(detailUrl, "detail");
    mocks.parse.mockImplementation((html) => {
      if (html === "detail") mocks.renew.mockResolvedValue({ count: 0 });
      return [boat()];
    });
    const result = await collect([
      source,
      { ...source, id: "other", name: "Other" },
    ]);
    expect(result.status).toBe("failed");
    expect(result.errors.join(" ")).toContain("lease lost");
    expect(mocks.createRun).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.stale).not.toHaveBeenCalled();
  });
  it("distinguishes operator cancellation and does not start ingestion", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Cancelled"));
    const result = await collect([source], { signal: controller.signal });
    expect(result.status).toBe("cancelled");
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.createRun).not.toHaveBeenCalled();
  });
  it("labels skipped detail limits as incomplete and retains earlier details", async () => {
    await cache(inventoryUrl, "summary");
    await cache(detailUrl, "detail");
    mocks.parse.mockImplementation((html) =>
      html === "summary"
        ? [
            boat(),
            boat({
              id: "two",
              sourceListingId: "two",
              sourceUrl: "https://dealer.example/boat/two",
            }),
          ]
        : [boat({ horsepower: 250 })],
    );
    const result = await collect([{ ...source, maxDetailPages: 1 }]);
    expect(result.status).toBe("partial");
    expect(result.metrics[0]).toMatchObject({
      detailPagesEligible: 2,
      detailPagesSkippedLimit: 1,
    });
    expect(result.runs[0].errors).toContain(
      "Detail page limit reached or retry deferred; 1 eligible ads were not enriched.",
    );
  });
  it("retains reported zero horsepower and does not retain stale asking prices", () => {
    const result = preserveEnrichedDetail(
      boat({ price: 10000, status: "sold" }),
      boat({
        horsepower: 0,
        price: 30000,
        specs: { detailsCheckedAt: "2026-01-01T00:00:00.000Z" },
      }),
      "failed",
    );
    expect(result).toMatchObject({
      horsepower: 0,
      price: 10000,
      status: "sold",
    });
  });
});

it("renews throughout a long operation and rejects an expired owner's renewal", async () => {
  vi.useFakeTimers();
  const renew = vi
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const lease = startCollectorLease("owner", { ttlMs: 90, renew });
  try {
    await vi.advanceTimersByTimeAsync(30);
    expect(renew).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30);
    expect(lease.signal.aborted).toBe(true);
    await expect(lease.checkpoint()).rejects.toThrow("lease lost");
  } finally {
    await lease.stop();
    vi.useRealTimers();
  }
});

it("makes failure, partial, busy and cancellation distinguishable to schedulers", () => {
  expect(
    ["success", "partial", "busy", "failed", "cancelled"].map((status) =>
      collectionExitCode(status as never),
    ),
  ).toEqual([0, 2, 3, 1, 130]);
  expect(collectionExitCode("busy", true)).toBe(0);
  expect(cacheAgeHours(24)).toBe(24);
  expect(() => cacheAgeHours(0)).toThrow();
  expect(() => cacheAgeHours("nonsense")).toThrow();
});

it("distinguishes content changes from observation metadata", () => {
  const old = boat({
    price: 10000,
    specs: { detailsCheckedAt: "2026-01-01T00:00:00.000Z", deck: "carpet" },
  });
  const observed = boat({
    price: 10000,
    lastSeenAt: "2026-02-01T00:00:00.000Z",
    specs: {
      deck: "carpet",
      detailsCheckedAt: "2026-02-01T00:00:00.000Z",
      detailEnrichmentStatus: "success",
    },
  });
  expect(listingContentFingerprint(old)).toBe(
    listingContentFingerprint(observed),
  );
  expect(listingContentFingerprint(old)).not.toBe(
    listingContentFingerprint({ ...observed, price: 9000 }),
  );
});

it("never replaces fresh summary prices or sold status with older cached details", () => {
  const older = "2026-09-01T10:00:00.000Z",
    newer = "2026-09-01T12:00:00.000Z";
  const detail = boat({
    price: 30000,
    status: "active",
    horsepower: 250,
    specs: { availability: "For sale" },
  });
  const summary = boat({
    price: 25000,
    status: "sold",
    specs: { availability: "Sold" },
  });
  const merged = mergeDetailObservation(summary, detail, newer, older);
  expect(merged).toMatchObject({
    price: 25000,
    status: "sold",
    horsepower: 250,
  });
  expect(merged.specs).toMatchObject({
    availability: "Sold",
    detailsCheckedAt: older,
    priceObservedAt: newer,
    availabilityObservedAt: newer,
  });
  expect(
    mergeDetailObservation({ ...summary, price: null }, detail, newer, older)
      .price,
  ).toBeNull();
  expect(mergeDetailObservation(summary, detail, newer, newer).status).toBe(
    "sold",
  );
  expect(mergeDetailObservation(summary, detail, older, newer)).toMatchObject({
    price: 30000,
    status: "active",
  });
  expect(
    mergeDetailObservation(summary, { ...detail, price: null }, older, newer)
      .price,
  ).toBe(25000);
});

it("rotates a bounded detail budget across runs and distinguishes planned deferral from partial failure", async () => {
  const secondUrl = "https://dealer.example/boat/two";
  const first = boat(),
    second = boat({ id: "two", sourceListingId: "two", sourceUrl: secondUrl });
  await cache(inventoryUrl, "inventory");
  await cache(detailUrl, "detail-one");
  await cache(secondUrl, "detail-two");
  mocks.parse.mockImplementation((html) =>
    html === "inventory"
      ? [first, second]
      : html === "detail-one"
        ? [first]
        : [second],
  );
  const config = {
    ...source,
    maxDetailPages: 1,
    detailPolicy: "rotating" as const,
  };
  const a = await collect([config]);
  expect(a.status).toBe("success");
  expect(a.metrics[0]).toMatchObject({
    detailPagesAttempted: 1,
    detailPagesDeferred: 1,
    detailPagesSkippedLimit: 0,
  });
  const detailBefore = mocks.parse.mock.calls
    .filter((call) => call[0] !== "inventory")
    .map((call) => call[0]);
  expect(detailBefore).toEqual(["detail-one"]);
  const b = await collect([config]);
  expect(b.status).toBe("success");
  expect(
    mocks.parse.mock.calls
      .filter((call) => call[0] !== "inventory")
      .map((call) => call[0]),
  ).toEqual(["detail-one", "detail-two"]);
});
it("summary-only policy avoids detail requests and source quality gates reject all staged bad rows", async () => {
  await cache(inventoryUrl, "summary");
  mocks.parse.mockReturnValue([boat()]);
  const result = await collect([
    { ...source, detailPolicy: "summary-only", quality: { minRecords: 2 } },
  ]);
  expect(result.status).toBe("partial");
  expect(result.metrics[0]).toMatchObject({
    detailPagesAttempted: 0,
    detailPagesDeferred: 1,
    quality: { status: "failed" },
  });
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("honors an operator cancellation marker before any source request", async () => {
  await mkdir(join(directory, "reports"), { recursive: true });
  await writeFile(
    join(directory, "reports", "cancel-test-cancel.json"),
    JSON.stringify({ runId: "test-cancel" }),
  );
  const result = await collect([source], { runId: "test-cancel" });
  expect(result.status).toBe("cancelled");
  expect(mocks.parse).not.toHaveBeenCalled();
});

it("enriches exactly the configured maximum length and excludes boats above it", async () => {
  await cache(inventoryUrl, "summary");
  await cache(detailUrl, "detail");
  mocks.parse.mockImplementation((html) =>
    html === "summary"
      ? [
          boat({ length: 21 }),
          boat({
            id: "over",
            sourceListingId: "over",
            sourceUrl: "https://dealer.example/boat/over",
            length: 21.1,
          }),
        ]
      : [boat({ length: 21, horsepower: 350 })],
  );
  const result = await collect([{ ...source, detailMaxLength: 21 }]);
  expect(result.status).toBe("success");
  expect(result.metrics[0]).toMatchObject({
    detailPagesEligible: 1,
    detailPagesSucceeded: 1,
  });
  expect(
    mocks.upsert.mock.calls.find(([listing]) => listing.id === "one")?.[0]
      .horsepower,
  ).toBe(350);
});
