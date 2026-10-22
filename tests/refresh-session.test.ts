import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  renew: vi.fn(),
  latestIngest: vi.fn(),
  sourceRows: vi.fn(),
}));
vi.mock("../server/repository", () => ({
  acquireLock: mocks.acquire,
  releaseLock: mocks.release,
  allListings: vi.fn(),
}));
vi.mock("../server/db", () => ({
  db: {
    jobLock: {
      updateMany: mocks.renew,
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ owner: "owner" })),
    },
    ingestRun: { findFirst: mocks.latestIngest },
    listing: { findMany: mocks.sourceRows },
  },
}));
import { sourceConfigSchema } from "../server/adapters/types";
import {
  startRefreshSession,
  continueRefreshSession,
  finalizeRefreshSession,
  readRefreshSession,
  sessionPreview,
} from "../server/refresh-session";
import {
  acceptInventoryBaseline,
  inventoryConfigHash,
  sourceWriteFingerprint,
  type FailureReason,
} from "../server/inventory-outcome";
import {
  runRefresh,
  type RefreshReport,
  type RefreshOptions,
} from "../server/refresh";
import type { CollectionReport, SourceMetrics } from "../server/refresh-report";
let directory = "";
const source = sourceConfigSchema.parse({
  id: "dealer",
  name: "Dealer",
  adapter: "dealer",
  enabled: true,
  urls: ["https://dealer.example/inventory"],
  followDetails: true,
  detailPolicy: "complete",
  maxDetailPages: 1,
});
const captured = "2026-10-19T12:00:00.000Z";
const first = "https://dealer.example/one",
  second = "https://dealer.example/two";
function metric(extra: Partial<SourceMetrics> = {}): SourceMetrics {
  return {
    sourceId: source.id,
    source: source.name,
    ingestRunId: "ingest",
    writeFingerprint: createHash("sha256").update("[]").digest("hex"),
    inventoryPagesConfigured: 1,
    inventoryPagesDiscovered: 0,
    inventoryPagesAttempted: 1,
    inventoryPagesSucceeded: 1,
    inventoryPageLimitReached: false,
    detailPagesEligible: 2,
    detailPagesAttempted: 1,
    detailPagesSucceeded: 1,
    detailPagesFailed: 0,
    detailPagesSkippedLimit: 1,
    duplicateAdsSkipped: 0,
    contentChanged: 0,
    metadataOnlyUpdated: 0,
    priceChanges: 0,
    priceDrops: 0,
    cacheHits: 2,
    fetchedPages: 0,
    cacheMaxAgeHours: 24,
    oldestObservationAt: captured,
    newestObservationAt: captured,
    inventory: {
      status: "accepted",
      accepted: true,
      count: 2,
      configHash: inventoryConfigHash(source),
      capturedAt: captured,
      reasons: [],
      baseline: { kind: "retained-ads", count: 0 },
    },
    inventoryIds: ["one", "two"],
    eligibleDetailUrls: [first, second],
    failures: [],
    detailResults: [
      { url: first, status: "succeeded", observedAt: captured },
      { url: second, status: "deferred" },
    ],
    observations: [
      {
        url: source.urls[0],
        observedAt: captured,
        retrieval: "cache",
        phase: "inventory",
      },
      { url: first, observedAt: captured, retrieval: "cache", phase: "detail" },
    ],
    ...extra,
  };
}
const report = (
  options: RefreshOptions,
  metrics: SourceMetrics[],
  status: CollectionReport["status"] = "partial",
): RefreshReport => ({
  version: 1,
  runId: options.runId!,
  status,
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  stage: "review",
  publicationDeferred: true,
  sessionId: options.sessionId,
  allowPartial: false,
  backupDirectory: "fixture",
  geocode: "not-requested",
  snapshot: null,
  errors: [],
  reportPath: join(directory, `${options.runId}-refresh.json`),
  collection: {
    version: 1,
    runId: options.runId!,
    status,
    busy: false,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    runs: [],
    metrics,
    reconciledRuns: 0,
    errors: [],
    reportPath: join(directory, `${options.runId}.json`),
  },
});
async function accept(runId: string, count = 2) {
  mocks.latestIngest.mockResolvedValue({ id: "ingest" });
  await acceptInventoryBaseline(source, {
    runId,
    ingestRunId: "ingest",
    count,
    capturedAt: captured,
    acceptedAt: new Date().toISOString(),
    oldestObservationAt: captured,
    newestObservationAt: captured,
    verifiedEmpty: false,
    qualityReportPath: "quality.json",
    collectionReportPath: `${runId}.json`,
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), "boatscout-session-"));
  vi.stubEnv("REFRESH_REPORT_DIR", directory);
  vi.stubEnv("REFRESH_BACKUP_DIR", join(directory, "backups"));
  mocks.acquire.mockResolvedValue("owner");
  mocks.release.mockResolvedValue(undefined);
  mocks.renew.mockResolvedValue({ count: 1 });
  mocks.latestIngest.mockResolvedValue(null);
  mocks.sourceRows.mockResolvedValue([]);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it("reconciles bounded detail passes without double-counting ads, pages or cached observation dates", async () => {
  let passNumber = 0;
  const refresh = vi.fn<typeof runRefresh>(async (options = {}) => {
    passNumber++;
    expect(options.deferExport).toBe(true);
    await accept(options.runId!);
    const next =
      passNumber === 1
        ? metric()
        : metric({
            detailPagesSkippedLimit: 0,
            detailResults: [
              { url: first, status: "not-requested" },
              { url: second, status: "succeeded", observedAt: captured },
            ],
            observations: [
              {
                url: source.urls[0],
                observedAt: captured,
                retrieval: "cache",
                phase: "inventory",
              },
              {
                url: second,
                observedAt: captured,
                retrieval: "cache",
                phase: "detail",
              },
            ],
          });
    return report(
      options,
      [next],
      next.detailPagesSkippedLimit ? "partial" : "success",
    );
  });
  const dependencies = { refresh, readSources: async () => [source] };
  const started = await startRefreshSession({}, dependencies);
  expect(started).toMatchObject({
    status: "partial",
    collectionPasses: 1,
    canContinue: true,
  });
  expect(started.sources[0].details).toMatchObject({
    eligible: 2,
    succeeded: 1,
    remaining: 1,
  });
  const original = await readFile(started.passes[0].reportPath, "utf8");
  const continued = await continueRefreshSession(
    started.sessionId,
    {},
    dependencies,
  );
  expect(refresh.mock.calls[1][0]?.detailUrlsBySource).toEqual({
    dealer: [second],
  });
  expect(continued).toMatchObject({
    status: "review",
    readyForCompleteExport: true,
    canContinue: false,
    collectionPasses: 2,
  });
  expect(continued.sources[0]).toMatchObject({
    currentInventoryAds: 2,
    adsSeenAcrossPasses: 2,
    details: { eligible: 2, succeeded: 2, remaining: 0 },
    observations: { unique: 3, fetched: 0, cacheOnly: 3, predatesSession: 3 },
  });
  expect(
    continued.sources[0].details.results
      .map((result) => result.observedAt)
      .filter(Boolean),
  ).toEqual([captured, captured]);
  expect(await readFile(started.passes[0].reportPath, "utf8")).toBe(original);
});
it("retries DNS failures but leaves a denied source explicit and excluded", async () => {
  const blocked = {
    ...source,
    id: "blocked",
    name: "Blocked",
    followDetails: false,
  };
  let passNumber = 0;
  const refresh = vi.fn<typeof runRefresh>(async (options = {}) => {
    passNumber++;
    const a =
      passNumber === 1
        ? metric({
            inventory: {
              ...metric().inventory!,
              status: "incomplete",
              accepted: false,
            },
            eligibleDetailUrls: [],
            detailResults: [],
            failures: [
              {
                phase: "inventory",
                reason: "transient-network",
                message: "EAI_AGAIN",
              },
            ],
          })
        : metric({ eligibleDetailUrls: [], detailResults: [] });
    const b = metric({
      sourceId: blocked.id,
      source: blocked.name,
      inventory: {
        ...metric().inventory!,
        configHash: inventoryConfigHash(blocked),
        status: "incomplete",
        accepted: false,
      },
      eligibleDetailUrls: [],
      detailResults: [],
      failures: [
        { phase: "inventory", reason: "access-denied", message: "HTTP 403" },
      ],
    });
    return report(
      options,
      options.sources?.some((value) => value.id === "blocked") ? [a, b] : [a],
    );
  });
  const dependencies = { refresh, readSources: async () => [source, blocked] };
  const started = await startRefreshSession({}, dependencies);
  expect(
    started.sources.map((value) => [value.sourceId, value.canContinue]),
  ).toEqual([
    ["dealer", true],
    ["blocked", false],
  ]);
  const continued = await continueRefreshSession(
    started.sessionId,
    {},
    dependencies,
  );
  expect(refresh.mock.calls[1][0]?.sources?.map((value) => value.id)).toEqual([
    "dealer",
  ]);
  expect(continued).toMatchObject({
    status: "partial",
    readyForCompleteExport: false,
  });
  expect(continued.sources[1].excludedReasons).toEqual(["access-denied"]);
  await expect(
    finalizeRefreshSession(started.sessionId, {}, dependencies),
  ).rejects.toThrow("remains partial");
});
it.each([
  "access-denied",
  "robots-policy",
  "rate-limited",
  "challenge",
  "quality",
  "inventory-cap",
  "parse",
] as FailureReason[])("does not blindly retry %s", async (reason) => {
  const refresh = vi.fn<typeof runRefresh>(async (options = {}) =>
    report(options, [
      metric({
        inventory: {
          ...metric().inventory!,
          accepted: false,
          status: "incomplete",
          reasons: [reason],
        },
        eligibleDetailUrls: [],
        detailResults: [],
        failures: [{ phase: "inventory", reason, message: reason }],
      }),
    ]),
  );
  const dependencies = { refresh, readSources: async () => [source] };
  const started = await startRefreshSession({}, dependencies);
  expect(started.canContinue).toBe(false);
  expect(
    (await continueRefreshSession(started.sessionId, {}, dependencies))
      .collectionPasses,
  ).toBe(1);
  expect(refresh).toHaveBeenCalledOnce();
});
it("bounds continuation attempts and rejects repeated source IDs or changed source policy", async () => {
  const refresh = vi.fn<typeof runRefresh>(async (options = {}) =>
    report(options, [
      metric({
        inventory: {
          ...metric().inventory!,
          accepted: false,
          status: "incomplete",
        },
        failures: [
          {
            phase: "inventory",
            reason: "transient-network",
            message: "ENOTFOUND",
          },
        ],
        detailResults: [],
      }),
    ]),
  );
  const dependencies = { refresh, readSources: async () => [source] };
  await expect(
    startRefreshSession({ sourceIds: [source.id, source.id] }, dependencies),
  ).rejects.toThrow("Repeated source IDs");
  const started = await startRefreshSession(
    { maxPasses: 2, maxSourceAttempts: 2 },
    dependencies,
  );
  const continued = await continueRefreshSession(
    started.sessionId,
    {},
    dependencies,
  );
  expect(continued.canContinue).toBe(false);
  expect(
    (await continueRefreshSession(started.sessionId, {}, dependencies))
      .collectionPasses,
  ).toBe(2);
  expect(refresh).toHaveBeenCalledTimes(2);
  const another = await startRefreshSession(
    { deferFirstPass: true },
    dependencies,
  );
  await expect(
    continueRefreshSession(
      another.sessionId,
      {},
      {
        ...dependencies,
        readSources: async () => [{ ...source, enabled: false }],
      },
    ),
  ).rejects.toThrow("changed or was disabled");
});
it("preserves cancelled attempts and allows an explicit continuation with a new run identity", async () => {
  let passNumber = 0;
  const refresh = vi.fn<typeof runRefresh>(async (options = {}) => {
    passNumber++;
    return report(
      options,
      passNumber === 1
        ? []
        : [metric({ eligibleDetailUrls: [], detailResults: [] })],
      passNumber === 1 ? "cancelled" : "success",
    );
  });
  const dependencies = { refresh, readSources: async () => [source] };
  const started = await startRefreshSession({}, dependencies);
  expect(started.status).toBe("cancelled");
  const continued = await continueRefreshSession(
    started.sessionId,
    {},
    dependencies,
  );
  expect(continued.status).toBe("review");
  expect(new Set(continued.passes.map((pass) => pass.runId)).size).toBe(2);
  expect(
    (await readRefreshSession(started.sessionId)).passes[0].report?.status,
  ).toBe("cancelled");
});
it("leaves the website intact and records finalization failure after collection has completed", async () => {
  const target = join(directory, "snapshot.json");
  await writeFile(target, "last reviewed website");
  const refresh = vi.fn<typeof runRefresh>(async (options = {}, pipeline) => {
    if (options.deferExport) {
      await accept(options.runId!);
      return report(
        options,
        [metric({ eligibleDetailUrls: [], detailResults: [] })],
        "success",
      );
    }
    return runRefresh(options, pipeline);
  });
  const exportSnapshot = vi.fn(async () => {
    throw new Error("Activation fixture failure before commit");
  });
  const dependencies = {
    refresh,
    readSources: async () => [source],
    pipeline: {
      backup: vi.fn(async () => ({
        directory: "fixture",
        database: "fixture",
        version: 1,
        createdAt: captured,
        databaseIntegrity: "ok",
        files: [],
        note: "fixture",
      })),
      export: exportSnapshot,
    },
  };
  const started = await startRefreshSession({ target }, dependencies);
  const finalized = await finalizeRefreshSession(
    started.sessionId,
    {},
    dependencies,
  );
  expect(finalized.status).toBe("failed");
  expect(exportSnapshot).toHaveBeenCalledOnce();
  expect(await readFile(target, "utf8")).toBe("last reviewed website");
  expect((await readRefreshSession(started.sessionId)).passes).toHaveLength(2);
  expect(finalized.errors.join(" ")).toContain("Activation fixture failure");
});
it.each(["external-partial-ingestion", "manual-source-edit"])(
  "blocks %s even when the accepted inventory baseline remains unchanged",
  async (kind) => {
    const target = join(directory, "snapshot.json");
    await writeFile(target, "last reviewed website");
    const refresh = vi.fn<typeof runRefresh>(async (options = {}, pipeline) => {
      if (options.deferExport) {
        await accept(options.runId!);
        return report(
          options,
          [metric({ eligibleDetailUrls: [], detailResults: [] })],
          "success",
        );
      }
      return runRefresh(options, pipeline);
    });
    const exportSnapshot = vi.fn(async () => {
      throw new Error("Stale session must not export");
    });
    const dependencies = {
      refresh,
      readSources: async () => [source],
      pipeline: {
        backup: vi.fn(async () => ({
          directory: "fixture",
          database: "fixture",
          version: 1,
          createdAt: captured,
          databaseIntegrity: "ok",
          files: [],
          note: "fixture",
        })),
        export: exportSnapshot,
      },
    };
    const started = await startRefreshSession({ target }, dependencies);
    if (kind === "external-partial-ingestion")
      mocks.latestIngest.mockResolvedValue({ id: "external-partial" });
    else
      mocks.sourceRows.mockResolvedValue([
        {
          id: "new-manual-row",
          source: source.name,
          sourceListingId: "new",
          data: { title: "Imported after collection" },
        },
      ]);
    const finalized = await finalizeRefreshSession(
      started.sessionId,
      {},
      dependencies,
    );
    expect(finalized.status).toBe("failed");
    expect(exportSnapshot).not.toHaveBeenCalled();
    expect(await readFile(target, "utf8")).toBe("last reviewed website");
    expect(finalized.errors.join(" ")).toMatch(
      /another ingestion|changed outside this session/,
    );
  },
);
it("respects transient detail backoff while leaving expired policy and legacy-unknown failures for manual review", async () => {
  const future = new Date(Date.now() + 600000).toISOString();
  const refresh = vi.fn<typeof runRefresh>(async (options = {}) =>
    report(options, [
      metric({
        detailResults: [
          { url: first, status: "succeeded", observedAt: captured },
          {
            url: second,
            status: "backoff",
            reason: "transient-network",
            nextAttemptAt: future,
          },
        ],
      }),
    ]),
  );
  const dependencies = { refresh, readSources: async () => [source] };
  const started = await startRefreshSession({}, dependencies);
  expect(started.canContinue).toBe(false);
  const session = await readRefreshSession(started.sessionId);
  expect(sessionPreview(session, Date.parse(future) + 1).canContinue).toBe(
    true,
  );
  for (const reason of [
    "rate-limited",
    "access-denied",
    "robots-policy",
    "challenge",
    "other",
  ] as FailureReason[]) {
    session.passes[0].report!.collection!.metrics[0].detailResults![1].reason =
      reason;
    const preview = sessionPreview(session, Date.parse(future) + 1);
    expect(preview.canContinue).toBe(false);
    expect(preview.sources[0].excludedReasons).toContain(reason);
  }
});
it("preserves the original scope when the same explicit session identity is started twice", async () => {
  const dependencies = { readSources: async () => [source] };
  await startRefreshSession(
    { sessionId: "same-session", deferFirstPass: true },
    dependencies,
  );
  const original = await readFile(
    join(directory, "sessions/same-session.json"),
    "utf8",
  );
  await expect(
    startRefreshSession(
      { sessionId: "same-session", maxPasses: 1, deferFirstPass: true },
      dependencies,
    ),
  ).rejects.toThrow("original scope was preserved");
  expect(
    await readFile(join(directory, "sessions/same-session.json"), "utf8"),
  ).toBe(original);
});
