import { realpath } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const directory = await mkdtemp(join(tmpdir(), "boatscout-operations-"));
process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
process.env.REFRESH_REPORT_DIR = join(directory, "reports");
const { db } = await import("../server/db");
const { atomicJson } = await import("../server/refresh-report");
const { recoverOperations } = await import("../server/operations");
const { runWorker, readWorkerHeartbeat } = await import("../server/worker");
const { watchJobCancellation, requestJobCancellation } =
  await import("../server/job-control");
beforeAll(async () => {
  await writeFile(join(directory, "test.db"), "");
  const r = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, encoding: "utf8" },
  );
  if (r.status) throw new Error(r.stdout + r.stderr);
  const attached = await db.$queryRawUnsafe<{ file: string; name: string }[]>(
    "PRAGMA database_list",
  );
  expect(
    await realpath(attached.find((entry) => entry.name === "main")!.file),
  ).toBe(await realpath(join(directory, "test.db")));
});
beforeEach(async () => {
  await db.jobLock.deleteMany();
  await db.ingestRun.deleteMany();
  vi.unstubAllEnvs();
  process.env.REFRESH_REPORT_DIR = join(directory, "reports");
  await rm(join(directory, "reports"), { recursive: true, force: true });
});
afterAll(async () => {
  await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
it("previews and recovers hard-killed reports only under exclusive ownership", async () => {
  const report = {
    runId: "abandoned",
    status: "running",
    stage: "collection",
    startedAt: new Date(Date.now() - 120000).toISOString(),
    completedAt: null,
    errors: [],
  };
  await atomicJson(
    join(directory, "reports", "abandoned-refresh.json"),
    report,
  );
  await atomicJson(join(directory, "reports", "latest-refresh.json"), report);
  await db.ingestRun.create({
    data: { source: "Fixture", area: "Test", status: "running" },
  });
  expect((await recoverOperations()).actions).toHaveLength(1);
  expect(
    JSON.parse(
      await readFile(
        join(directory, "reports", "abandoned-refresh.json"),
        "utf8",
      ),
    ).status,
  ).toBe("running");
  const applied = await recoverOperations({ apply: true });
  expect("recovered" in applied && applied.recovered).toEqual(["abandoned"]);
  expect(
    JSON.parse(
      await readFile(
        join(directory, "reports", "abandoned-refresh.json"),
        "utf8",
      ),
    ),
  ).toMatchObject({ status: "failed", recovery: { outcome: "interrupted" } });
  expect(
    JSON.parse(
      await readFile(
        join(directory, "reports", "recovered", "abandoned-refresh.json"),
        "utf8",
      ),
    ),
  ).toEqual(report);
  expect((await db.ingestRun.findFirstOrThrow()).status).toBe("interrupted");
});
it("does not reconcile while another live collector owns the database", async () => {
  await db.jobLock.create({
    data: {
      key: "collector",
      owner: "other",
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  const result = await recoverOperations({ apply: true });
  expect("busy" in result && result.busy).toBe(true);
  expect(await db.jobLock.count()).toBe(1);
});
it("refuses a second daemon and reads only the active owner's heartbeat", async () => {
  await db.jobLock.create({
    data: {
      key: "worker",
      owner: "intended",
      expiresAt: new Date(Date.now() + 90000),
    },
  });
  await atomicJson(join(directory, "reports", "worker-intended.json"), {
    instanceId: "intended",
    state: "waiting",
  });
  await atomicJson(join(directory, "reports", "worker.json"), {
    instanceId: "obsolete",
    state: "collecting",
  });
  expect(await runWorker([])).toBe(3);
  expect((await readWorkerHeartbeat())?.instanceId).toBe("intended");
  expect(
    (await db.jobLock.findUniqueOrThrow({ where: { key: "worker" } })).owner,
  ).toBe("intended");
});
it("cancellation targets a job identity without sending PID signals", async () => {
  const watch = watchJobCancellation("fixture-job");
  try {
    await requestJobCancellation("fixture-job");
    await watch.check();
    expect(watch.signal.aborted).toBe(true);
  } finally {
    watch.stop();
  }
});

it("supervises a real idle worker and cooperatively stops its own identity", async () => {
  const sources = join(directory, "empty-sources.json");
  await writeFile(sources, "[]");
  vi.stubEnv("SOURCE_CONFIG", sources);
  vi.stubEnv("WORKER_AUTO_EXPORT", "false");
  vi.stubEnv("WORKER_INTERVAL_MINUTES", "30");
  const controller = new AbortController();
  const result = runWorker([], { signal: controller.signal });
  try {
    let heartbeat;
    for (let i = 0; i < 100; i++) {
      heartbeat = await readWorkerHeartbeat();
      if (heartbeat?.state === "waiting") break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(heartbeat?.state).toBe("waiting");
    expect(heartbeat?.intervalMinutes).toBe(30);
    expect(heartbeat?.autoExport).toBe(false);
    await requestJobCancellation(`worker-${heartbeat!.instanceId}`);
    expect(await result).toBe(0);
    expect(await db.jobLock.count()).toBe(0);
    expect((await readWorkerHeartbeat())?.state).toBe("stopped");
  } finally {
    controller.abort();
    await result;
  }
});
it("recovers a hard kill after a verified publication as committed", async () => {
  const { activateSnapshot } = await import("../server/publication");
  const publicDirectory = join(directory, "public");
  vi.stubEnv("PUBLICATION_DIR", join(directory, "publication"));
  const activation = await activateSnapshot('{"listings":[]}', {
    publicDirectory,
    runId: "committed",
    listings: 0,
  });
  // Simulate the narrow window after atomic pointer replacement, before the committed marker/report was flushed.
  await atomicJson(join(directory, "publication", `${activation.id}.json`), {
    ...activation,
    state: "prepared",
    committedAt: null,
  });
  await atomicJson(join(directory, "reports", "committed-refresh.json"), {
    runId: "committed",
    status: "running",
    stage: "export",
    publicDirectory,
    startedAt: new Date(Date.now() - 120000).toISOString(),
    completedAt: null,
    collection: { status: "partial" },
    errors: [],
  });
  await recoverOperations({ apply: true });
  const report = JSON.parse(
    await readFile(
      join(directory, "reports", "committed-refresh.json"),
      "utf8",
    ),
  );
  expect(report).toMatchObject({
    status: "partial",
    stage: "complete",
    recovery: { outcome: "publication-committed" },
    snapshot: {
      activation: { sha256: activation.sha256, reconciledFromPointer: true },
    },
  });
});
