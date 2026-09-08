import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
const mocks = vi.hoisted(() => ({
  sources: vi.fn(),
  collection: vi.fn(),
  refresh: vi.fn(),
  worker: vi.fn(),
  runs: vi.fn(),
}));
vi.mock("../server/collector", () => ({ readSources: mocks.sources }));
vi.mock("../server/refresh-report", async (original) => ({
  ...(await original<typeof import("../server/refresh-report")>()),
  readLatestCollectionReport: mocks.collection,
}));
vi.mock("../server/refresh", () => ({
  readLatestRefreshReport: mocks.refresh,
}));
vi.mock("../server/worker", () => ({ readWorkerHeartbeat: mocks.worker }));
vi.mock("../server/db", () => ({
  db: { ingestRun: { findMany: mocks.runs } },
}));
import {
  sourceHealth,
  registerSourceHealthRoutes,
} from "../server/source-health";
let directory = "";
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), "boatscout-health-"));
  vi.stubEnv("REFRESH_REPORT_DIR", directory);
  mocks.sources.mockResolvedValue([
    { id: "dealer", name: "Dealer", enabled: true },
  ]);
  mocks.collection.mockResolvedValue({
    runs: [{ id: "old-run", source: "Dealer" }],
    metrics: [{ sourceId: "dealer", inventoryPagesSucceeded: 20 }],
  });
  mocks.refresh.mockResolvedValue(null);
  mocks.worker.mockResolvedValue(null);
  mocks.runs.mockResolvedValue([
    { id: "new-run", source: "Dealer", status: "running" },
  ]);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it("does not show previous collection counters alongside a different latest run", async () => {
  const current = await sourceHealth();
  expect(current.sources[0].latestRun?.id).toBe("new-run");
  expect(current.sources[0].metrics).toBeNull();
  mocks.runs.mockResolvedValue([
    { id: "old-run", source: "Dealer", status: "success" },
  ]);
  expect(
    (await sourceHealth()).sources[0].metrics?.inventoryPagesSucceeded,
  ).toBe(20);
});
it("augments job outcomes with separate alert failures without changing collection status", async () => {
  const alert = {
    runId: "job",
    status: "failed",
    completedAt: "2026-09-08T00:00:00.000Z",
    error: "Alert evaluation failed",
  };
  await writeFile(
    join(directory, "job-refresh.json"),
    JSON.stringify({
      runId: "job",
      status: "success",
      stage: "complete",
      snapshot: { listings: 1538 },
    }),
  );
  await writeFile(join(directory, "job-alerts.json"), JSON.stringify(alert));
  await writeFile(join(directory, "latest-alerts.json"), JSON.stringify(alert));
  const app = Fastify();
  registerSourceHealthRoutes(app);
  try {
    const response = await app.inject({ url: "/api/admin/jobs/job" });
    expect(response.json()).toMatchObject({
      status: "success",
      stage: "complete",
      snapshot: { listings: 1538 },
      alertEvaluation: alert,
    });
    expect((await sourceHealth()).alertEvaluation).toEqual(alert);
    await writeFile(
      join(directory, "no-alert.json"),
      JSON.stringify({ runId: "no-alert", status: "partial" }),
    );
    expect(
      (await app.inject({ url: "/api/admin/jobs/no-alert" })).json(),
    ).toMatchObject({ status: "partial", alertEvaluation: null });
  } finally {
    await app.close();
  }
});
