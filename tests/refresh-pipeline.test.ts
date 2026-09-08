import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  renew: vi.fn(),
}));
vi.mock("../server/repository", () => ({
  acquireLock: mocks.acquire,
  releaseLock: mocks.release,
  allListings: vi.fn(),
}));
vi.mock("../server/collector", () => ({ collect: vi.fn() }));
vi.mock("../server/db", () => ({
  db: { jobLock: { updateMany: mocks.renew } },
}));
import { runRefresh } from "../server/refresh";
import type {
  CollectionReport,
  CollectionStatus,
} from "../server/refresh-report";
import type { exportSnapshot as ExportSnapshot } from "../scripts/export-snapshot";
let directory = "";
const collection = (status: CollectionStatus): CollectionReport => ({
  version: 1,
  runId: "fixture",
  status,
  busy: status === "busy",
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T01:00:00.000Z",
  runs: [],
  metrics: [],
  reconciledRuns: 0,
  errors: [],
  reportPath: "fixture.json",
});
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), "boatscout-refresh-"));
  vi.stubEnv("REFRESH_REPORT_DIR", join(directory, "reports"));
  vi.stubEnv("REFRESH_BACKUP_DIR", join(directory, "backups"));
  mocks.acquire.mockResolvedValue("owner");
  mocks.release.mockResolvedValue(undefined);
  mocks.renew.mockResolvedValue({ count: 1 });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it.each(["failed", "partial", "busy", "cancelled"] as const)(
  "does not export when collection is %s",
  async (status) => {
    const backup = vi.fn(async () => ({
      directory: "fixture",
      database: "fixture",
      version: 1,
      createdAt: "fixture",
      databaseIntegrity: "ok",
      files: [],
      note: "fixture",
    }));
    const exportSnapshot = vi.fn();
    const geocode = vi.fn();
    const report = await runRefresh(
      { geocode: true },
      {
        backup,
        collect: vi.fn(async () => collection(status)),
        geocode,
        export: exportSnapshot,
      },
    );
    expect(report.status).toBe(status);
    expect(report.snapshot).toBeNull();
    expect(backup).toHaveBeenCalledOnce();
    expect(geocode).not.toHaveBeenCalled();
    expect(exportSnapshot).not.toHaveBeenCalled();
    expect(
      JSON.parse(await readFile(report.reportPath, "utf8")).completedAt,
    ).toBeTruthy();
  },
);
it("runs backup, collection, optional geocode and validated export in order", async () => {
  const stages: string[] = [];
  const report = await runRefresh(
    { geocode: true },
    {
      backup: vi.fn(async () => {
        stages.push("backup");
        return {
          directory: "fixture",
          database: "fixture",
          version: 1,
          createdAt: "fixture",
          databaseIntegrity: "ok",
          files: [],
          note: "fixture",
        };
      }),
      collect: vi.fn(async () => {
        stages.push("collection");
        return collection("success");
      }),
      geocode: vi.fn(async (_signal, owner) => {
        expect(owner).toBe("owner");
        stages.push("geocode");
      }),
      export: vi.fn(async (options) => {
        stages.push("export");
        expect(options?.provenance?.partial).toBe(false);
        return {
          target: "fixture",
          listings: 1,
          generatedAt: "fixture",
          observationRange: { oldest: null, newest: null },
          backup: null,
        };
      }),
    },
  );
  expect(stages).toEqual(["backup", "collection", "geocode", "export"]);
  expect(report).toMatchObject({
    status: "success",
    stage: "complete",
    geocode: "success",
  });
});
it("labels explicit allow-partial exports and preserves partial outcome", async () => {
  const exportSnapshot = vi.fn<typeof ExportSnapshot>(async () => ({
    target: "fixture",
    listings: 1,
    generatedAt: "fixture",
    observationRange: { oldest: null, newest: null },
    backup: null,
  }));
  const report = await runRefresh(
    { allowPartial: true },
    {
      backup: vi.fn(async () => ({
        directory: "fixture",
        database: "fixture",
        version: 1,
        createdAt: "fixture",
        databaseIntegrity: "ok",
        files: [],
        note: "fixture",
      })),
      collect: vi.fn(async () => collection("partial")),
      export: exportSnapshot,
    },
  );
  expect(report.status).toBe("partial");
  expect(exportSnapshot.mock.calls[0][0]?.provenance).toMatchObject({
    status: "partial",
    partial: true,
  });
});
it("stops before collection when a consistent backup cannot be made", async () => {
  const collect = vi.fn();
  const exportSnapshot = vi.fn();
  const report = await runRefresh(
    {},
    {
      backup: vi.fn(async () => {
        throw new Error("Backup disk full");
      }),
      collect,
      export: exportSnapshot,
    },
  );
  expect(report.status).toBe("failed");
  expect(collect).not.toHaveBeenCalled();
  expect(exportSnapshot).not.toHaveBeenCalled();
});
it("keeps the website when requested geocoding fails", async () => {
  const exportSnapshot = vi.fn();
  const report = await runRefresh(
    { geocode: true },
    {
      backup: vi.fn(async () => ({
        directory: "fixture",
        database: "fixture",
        version: 1,
        createdAt: "fixture",
        databaseIntegrity: "ok",
        files: [],
        note: "fixture",
      })),
      collect: vi.fn(async () => collection("success")),
      geocode: vi.fn(async () => {
        throw new Error("Geocoder rate limit");
      }),
      export: exportSnapshot,
    },
  );
  expect(report).toMatchObject({ status: "failed", geocode: "failed" });
  expect(exportSnapshot).not.toHaveBeenCalled();
});
