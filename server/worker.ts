import "dotenv/config";
import { collect } from "./collector";
import { evaluateAlerts, type AlertEvaluationResult } from "./alerts";
import { db } from "./db";
import { logger } from "./logger";
import {
  atomicJson,
  collectionExitCode,
  reportDirectory,
  type CollectionStatus,
} from "./refresh-report";
import { runRefresh } from "./refresh";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { acquireLock, releaseLock } from "./repository";
import { startCollectorLease } from "./lease";
import { recoverOperations } from "./operations";
import { watchJobCancellation } from "./job-control";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

export type WorkerHeartbeat = {
  instanceId?: string;
  host?: string;
  pid: number;
  startedAt: string;
  heartbeatAt: string;
  state: "collecting" | "delivering" | "waiting" | "stopped";
  intervalMinutes: number;
  nextRunAt: string | null;
  lastCycleStatus: CollectionStatus | null;
  lastAlertStatus?: AlertEvaluationResult["status"] | "failed" | null;
  lastRunId: string | null;
  autoExport: boolean;
};
export async function readWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
  const lock = await db.jobLock.findUnique({ where: { key: "worker" } });
  const file =
    lock && +lock.expiresAt > Date.now()
      ? `worker-${lock.owner}.json`
      : "worker.json";
  try {
    return JSON.parse(await readFile(join(reportDirectory(), file), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function recordAlertOutcome(
  runId: string,
  outcome: AlertEvaluationResult,
) {
  const report = {
    runId,
    status: outcome.status === "success" ? "success" : "failed",
    completedAt: new Date().toISOString(),
    error: outcome.errors.length
      ? outcome.errors.join("; ")
      : outcome.status === "success"
        ? null
        : `Alert evaluation ${outcome.status}`,
    outcome,
  };
  await atomicJson(join(reportDirectory(), `${runId}-alerts.json`), report);
  await atomicJson(join(reportDirectory(), "latest-alerts.json"), report);
}
export async function workerCycle(
  options: {
    signal?: AbortSignal;
    autoExport?: boolean;
    geocode?: boolean;
  } = {},
) {
  const result = options.autoExport
    ? await runRefresh({ signal: options.signal, geocode: options.geocode })
    : await collect(undefined, { signal: options.signal });
  const collectionStatus =
    result.status === "running" ? "failed" : result.status;
  const alerts = await evaluateAlerts({
    signal: options.signal,
    evaluateSearches: collectionStatus === "success",
  });
  await recordAlertOutcome(result.runId, alerts);
  const status: CollectionStatus =
    collectionStatus === "success" && alerts.status !== "success"
      ? alerts.status === "cancelled"
        ? "cancelled"
        : "partial"
      : collectionStatus;
  return {
    status,
    collectionStatus,
    alertStatus: alerts.status,
    runId: result.runId,
  };
}
export async function runWorker(
  args = process.argv.slice(2),
  options: { signal?: AbortSignal } = {},
) {
  if (args.some((arg) => !["--once", "--skip-busy"].includes(arg)))
    throw new Error(
      "Usage: npm run worker (or npm run collect -- [--skip-busy])",
    );
  const once = args.includes("--once");
  const intervalMinutes = Number(process.env.WORKER_INTERVAL_MINUTES ?? 30);
  if (
    !Number.isFinite(intervalMinutes) ||
    intervalMinutes < 1 ||
    intervalMinutes > 10080
  )
    throw new Error("WORKER_INTERVAL_MINUTES must be between 1 and 10080");
  const owner = once ? null : await acquireLock("worker", 90000);
  if (!once && !owner) {
    logger.warn(
      "A supervised worker already owns this database; no second daemon started",
    );
    return args.includes("--skip-busy") ? 0 : 3;
  }
  const controller = new AbortController();
  const stop = () => controller.abort(new Error("Worker stopped by operator"));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const stopFromParent = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) stopFromParent();
  else
    options.signal?.addEventListener("abort", stopFromParent, { once: true });
  const cancellation = watchJobCancellation(
    `worker-${owner ?? randomUUID()}`,
    controller.signal,
  );
  const supervision = owner
    ? startCollectorLease(owner, {
        key: "worker",
        ttlMs: 90000,
        signal: cancellation.signal,
      })
    : null;
  const signal = supervision?.signal ?? cancellation.signal;
  const heartbeat: WorkerHeartbeat = {
    instanceId: owner ?? undefined,
    host: hostname(),
    pid: process.pid,
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    state: "collecting",
    intervalMinutes,
    nextRunAt: null,
    lastCycleStatus: null,
    lastAlertStatus: null,
    lastRunId: null,
    autoExport: !once && process.env.WORKER_AUTO_EXPORT === "true",
  };
  const writeHeartbeat = async (final = false) => {
    if (!owner) return;
    if (!final) await supervision!.checkpoint();
    else if (
      !(await db.jobLock.findFirst({
        where: { key: "worker", owner, expiresAt: { gt: new Date() } },
      }))
    )
      return;
    heartbeat.heartbeatAt = new Date().toISOString();
    // Readers select the current DB lease owner's file. An obsolete process cannot overwrite its successor's authoritative heartbeat.
    await atomicJson(
      join(reportDirectory(), `worker-${owner}.json`),
      heartbeat,
    );
    await atomicJson(join(reportDirectory(), "worker.json"), heartbeat);
  };
  let failedSupervision = false;
  let heartbeatWrite = Promise.resolve();
  const timer = once
    ? undefined
    : setInterval(() => {
        heartbeatWrite = heartbeatWrite
          .then(() => writeHeartbeat())
          .catch((error) => {
            failedSupervision = true;
            controller.abort(error);
            logger.error({ err: error }, "Worker supervision failed");
          });
      }, 30000);
  timer?.unref();
  try {
    await cancellation.check();
    if (!once) {
      await writeHeartbeat();
      await recoverOperations({ apply: true });
      logger.info(
        {
          instanceId: owner,
          intervalMinutes,
          autoExport: heartbeat.autoExport,
        },
        "Supervised worker started; configured interval preserved",
      );
    }
    do {
      signal.throwIfAborted();
      heartbeat.state = "collecting";
      heartbeat.nextRunAt = null;
      await writeHeartbeat();
      try {
        const result = await workerCycle({
          signal,
          autoExport: heartbeat.autoExport,
          geocode: process.env.WORKER_AUTO_GEOCODE === "true",
        });
        heartbeat.lastCycleStatus = result.status;
        heartbeat.lastAlertStatus = result.alertStatus;
        heartbeat.lastRunId = result.runId;
        logger.info(result, "Worker cycle finished");
      } catch (error) {
        heartbeat.lastCycleStatus = signal.aborted ? "cancelled" : "failed";
        logger.error({ err: error }, "Worker cycle failed");
      }
      if (once)
        return collectionExitCode(
          heartbeat.lastCycleStatus ?? "failed",
          args.includes("--skip-busy"),
        );
      if (signal.aborted) break;
      heartbeat.state = "waiting";
      const until = Date.now() + intervalMinutes * 60000;
      heartbeat.nextRunAt = new Date(until).toISOString();
      await writeHeartbeat();
      while (!signal.aborted && Date.now() < until) {
        await delay(Math.min(60000, until - Date.now()), undefined, {
          signal,
        }).catch((error) => {
          if (!signal.aborted) throw error;
        });
        if (signal.aborted || Date.now() >= until) break;
        await supervision!.checkpoint();
        // Drain due retries without recollecting sources or changing search baselines.
        heartbeat.state = "delivering";
        await writeHeartbeat();
        try {
          const outcome = await evaluateAlerts({
            signal,
            evaluateSearches: false,
          });
          heartbeat.lastAlertStatus = outcome.status;
          if (outcome.delivered || outcome.failed)
            await recordAlertOutcome(randomUUID(), outcome);
        } catch (error) {
          heartbeat.lastAlertStatus = "failed";
          logger.error({ err: error }, "Pending alert retry failed");
        }
        heartbeat.state = "waiting";
        await writeHeartbeat();
      }
    } while (!signal.aborted);
    return failedSupervision ||
      (supervision?.signal.aborted && !cancellation.signal.aborted)
      ? 1
      : 0;
  } catch (error) {
    if (controller.signal.aborted || cancellation.signal.aborted)
      return once ? 130 : failedSupervision ? 1 : 0;
    throw error;
  } finally {
    if (timer) clearInterval(timer);
    await heartbeatWrite;
    heartbeat.state = "stopped";
    heartbeat.nextRunAt = null;
    await writeHeartbeat(true);
    await supervision?.stop();
    if (owner) await releaseLock("worker", owner);
    cancellation.stop();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    options.signal?.removeEventListener("abort", stopFromParent);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.exitCode = await runWorker();
  } catch (error) {
    logger.error({ err: error }, "Worker terminated");
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
