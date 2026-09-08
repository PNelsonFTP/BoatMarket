import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "./db";
import { acquireLock, releaseLock } from "./repository";
import { atomicJson, reportDirectory } from "./refresh-report";
import { requestJobCancellation } from "./job-control";
import { startCollectorLease } from "./lease";
import { readSnapshotActivation } from "./publication";

type RunRecord = {
  runId?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string | null;
  leaseOwner?: string;
  stage?: string;
  errors?: unknown;
  [key: string]: unknown;
};
async function records() {
  let files: string[];
  try {
    files = await readdir(reportDirectory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result: { filename: string; report: RunRecord; key: string }[] = [];
  for (const filename of files.filter(
    (file) =>
      /^[a-zA-Z0-9-]+\.json$/.test(file) &&
      !/^(latest-|cancel-|worker)/.test(file) &&
      !file.endsWith("-alerts.json"),
  )) {
    try {
      const report = JSON.parse(
        await readFile(join(reportDirectory(), filename), "utf8"),
      ) as RunRecord;
      if (
        report.runId &&
        (["running", "queued"].includes(report.status ?? "") ||
          (filename.endsWith("-refresh.json") &&
            ["success", "partial"].includes(report.status ?? "") &&
            report.stage !== "complete")) &&
        !report.completedAt
      )
        result.push({
          filename,
          report,
          key: filename.endsWith("-refresh.json")
            ? "refresh-pipeline"
            : "collector",
        });
    } catch {
      /* Corrupt files are reported independently by the normal reader; do not overwrite unknown evidence. */
    }
  }
  return result;
}
export async function readOperationStatus() {
  const locks = await db.jobLock.findMany();
  const pending = await records();
  let worker: Record<string, unknown> | null = null;
  const workerOwner = locks.find(
    (lock) => lock.key === "worker" && +lock.expiresAt > Date.now(),
  );
  try {
    worker = JSON.parse(
      await readFile(
        join(
          reportDirectory(),
          workerOwner ? `worker-${workerOwner.owner}.json` : "worker.json",
        ),
        "utf8",
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const now = Date.now();
  return {
    generatedAt: new Date(now).toISOString(),
    locks: locks.map((lock) => ({ ...lock, live: +lock.expiresAt > now })),
    worker,
    jobs: pending.map(({ report, key }) => ({
      ...report,
      leaseKey: key,
      leaseLive: locks.some(
        (lock) =>
          lock.key === key &&
          +lock.expiresAt > now &&
          (!report.leaseOwner || report.leaseOwner === lock.owner),
      ),
    })),
  };
}
export async function reconcileAbandonedReports(
  ownership: {
    key: "collector" | "refresh-pipeline";
    owner: string;
    excludeRunId?: string;
  },
  apply = true,
) {
  const candidates = (await records()).filter(
    ({ key, report }) =>
      key === ownership.key &&
      report.runId !== ownership.excludeRunId &&
      Date.now() - Date.parse(report.startedAt ?? "") > 60000,
  );
  const recovered: string[] = [];
  for (const { filename, report } of candidates) {
    if (!apply) {
      recovered.push(report.runId!);
      continue;
    }
    const lock = await db.jobLock.findFirst({
      where: {
        key: ownership.key,
        owner: ownership.owner,
        expiresAt: { gt: new Date() },
      },
    });
    if (!lock)
      throw new Error("Recovery lease lost; no further reports were changed");
    const activation =
      ownership.key === "refresh-pipeline"
        ? await readSnapshotActivation(
            report.runId,
            String(report.publicDirectory || "public"),
          )
        : null;
    const collection = report.collection as { status?: string } | null;
    // Preserve the original report; a verified committed pointer distinguishes completed publication from interruption.
    await atomicJson(join(reportDirectory(), "recovered", filename), report);
    const recoveredReport = {
      ...report,
      status: activation
        ? collection?.status === "partial"
          ? "partial"
          : "success"
        : "failed",
      ...(activation
        ? {
            stage: "complete",
            snapshot: {
              ...(typeof report.snapshot === "object" && report.snapshot
                ? report.snapshot
                : {}),
              activation,
            },
          }
        : {}),
      completedAt: new Date().toISOString(),
      recovery: {
        outcome: activation ? "publication-committed" : "interrupted",
        activation: activation ?? null,
        recoveredAt: new Date().toISOString(),
        previousStatus: report.status,
        previousStage: report.stage ?? null,
      },
      errors: [
        ...(Array.isArray(report.errors) ? report.errors : []),
        ...(activation
          ? []
          : [
              "Process ended without a completed report; reconciled after exclusive lease acquisition. No matching active publication could be verified; no rollback was assumed.",
            ]),
      ],
    };
    await atomicJson(join(reportDirectory(), filename), recoveredReport);
    const latestName =
      ownership.key === "refresh-pipeline"
        ? "latest-refresh.json"
        : "latest-collection.json";
    try {
      const latest = JSON.parse(
        await readFile(join(reportDirectory(), latestName), "utf8"),
      );
      if (latest.runId === report.runId)
        await atomicJson(join(reportDirectory(), latestName), recoveredReport);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    recovered.push(report.runId!);
  }
  return recovered;
}
export async function recoverOperations(options: { apply?: boolean } = {}) {
  const status = await readOperationStatus();
  const actions = status.jobs
    .filter(
      (job) =>
        !job.leaseLive &&
        Date.now() - Date.parse(String(job.startedAt)) > 60000,
    )
    .map((job) => ({
      runId: job.runId,
      action: "mark interrupted with original report retained",
    }));
  if (!options.apply) return { dryRun: true, status, actions };
  const owners: {
    key: string;
    owner: string;
    lease: ReturnType<typeof startCollectorLease>;
  }[] = [];
  try {
    for (const key of [
      "refresh-pipeline",
      "collector",
      "alerts",
      "publication",
    ]) {
      const owner = await acquireLock(key, 600000);
      if (!owner)
        return {
          dryRun: false,
          busy: true,
          message: `Active ${key} owner; recovery made no changes`,
          actions: [],
        };
      owners.push({
        key,
        owner,
        lease: startCollectorLease(owner, { key, ttlMs: 600000 }),
      });
    }
    const recovered: string[] = [];
    for (const item of owners) {
      await item.lease.checkpoint();
      if (item.key === "collector" || item.key === "refresh-pipeline")
        recovered.push(
          ...(await reconcileAbandonedReports({
            key: item.key as "collector" | "refresh-pipeline",
            owner: item.owner,
          })),
        );
    }
    const collector = owners.find((owner) => owner.key === "collector")!;
    const ingest = await db.$transaction(async (tx) => {
      if (
        !(await tx.jobLock.findFirst({
          where: {
            key: "collector",
            owner: collector.owner,
            expiresAt: { gt: new Date() },
          },
        }))
      )
        throw new Error("Recovery lease lost");
      return tx.ingestRun.updateMany({
        where: { status: "running", completedAt: null },
        data: {
          status: "interrupted",
          completedAt: new Date(),
          errors: [
            "Reconciled by exclusive recovery; prior process did not complete",
          ],
        },
      });
    });
    const workerLock = await db.jobLock.findUnique({
      where: { key: "worker" },
    });
    if (status.worker && (!workerLock || +workerLock.expiresAt <= Date.now()))
      await atomicJson(join(reportDirectory(), "worker.json"), {
        ...status.worker,
        state: "stopped",
        nextRunAt: null,
        recoveredAt: new Date().toISOString(),
        recoveryReason: "No live worker supervision lease",
      });
    return {
      dryRun: false,
      busy: false,
      recovered,
      interruptedIngestRuns: ingest.count,
      actions,
    };
  } finally {
    for (const item of owners.reverse()) {
      await item.lease.stop();
      await releaseLock(item.key, item.owner);
    }
  }
}
export async function cancelOperation(runId?: string) {
  if (runId) {
    const entry = (await records()).find(
      ({ report }) => report.runId === runId,
    );
    if (!entry) throw new Error("No queued or running job with that ID");
    return requestJobCancellation(runId);
  }
  const status = await readOperationStatus();
  const instance = status.worker?.instanceId;
  if (
    typeof instance !== "string" ||
    !status.locks.some(
      (lock) => lock.key === "worker" && lock.owner === instance && lock.live,
    )
  )
    throw new Error("No supervised live worker to stop");
  return requestJobCancellation(`worker-${instance}`);
}
