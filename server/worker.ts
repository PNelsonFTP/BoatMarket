import "dotenv/config";
import { collect } from "./collector";
import { evaluateAlerts } from "./alerts";
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

export type WorkerHeartbeat = {
  pid: number;
  startedAt: string;
  heartbeatAt: string;
  state: "collecting" | "waiting" | "stopped";
  intervalMinutes: number;
  nextRunAt: string | null;
  lastCycleStatus: CollectionStatus | null;
  lastRunId: string | null;
  autoExport: boolean;
};
export async function readWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
  try {
    return JSON.parse(
      await readFile(join(reportDirectory(), "worker.json"), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
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
  const status = result.status === "running" ? "failed" : result.status;
  if (status === "success") await evaluateAlerts();
  return { status, runId: result.runId };
}

export async function runWorker(args = process.argv.slice(2)) {
  const controller = new AbortController();
  const stop = () => controller.abort(new Error("Worker stopped by operator"));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const once = args.includes("--once");
  const intervalMinutes = Number(process.env.WORKER_INTERVAL_MINUTES ?? 30);
  if (
    !Number.isFinite(intervalMinutes) ||
    intervalMinutes < 1 ||
    intervalMinutes > 10080
  )
    throw new Error("WORKER_INTERVAL_MINUTES must be between 1 and 10080");
  const heartbeat: WorkerHeartbeat = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    state: "collecting",
    intervalMinutes,
    nextRunAt: null,
    lastCycleStatus: null,
    lastRunId: null,
    // The low-level `collect` command never unexpectedly exports because of a daemon setting.
    autoExport: !once && process.env.WORKER_AUTO_EXPORT === "true",
  };
  const writeHeartbeat = async () => {
    heartbeat.heartbeatAt = new Date().toISOString();
    await atomicJson(join(reportDirectory(), "worker.json"), heartbeat);
  };
  let writingHeartbeat = Promise.resolve();
  const heartbeatTimer = once
    ? undefined
    : setInterval(() => {
        writingHeartbeat = writingHeartbeat
          .then(writeHeartbeat)
          .catch((error) =>
            logger.error(
              { err: error },
              "Worker heartbeat could not be written",
            ),
          );
      }, 30000);
  heartbeatTimer?.unref();
  try {
    if (!once)
      logger.info(
        {
          intervalMinutes,
          autoExport: heartbeat.autoExport,
          geocode: process.env.WORKER_AUTO_GEOCODE === "true",
        },
        "Worker started; interval begins after each completed cycle",
      );
    do {
      heartbeat.state = "collecting";
      heartbeat.nextRunAt = null;
      if (!once) await writeHeartbeat();
      try {
        const result = await workerCycle({
          signal: controller.signal,
          autoExport: heartbeat.autoExport,
          geocode: process.env.WORKER_AUTO_GEOCODE === "true",
        });
        heartbeat.lastCycleStatus = result.status;
        heartbeat.lastRunId = result.runId;
        logger.info(result, "Worker cycle finished");
      } catch (error) {
        heartbeat.lastCycleStatus = controller.signal.aborted
          ? "cancelled"
          : "failed";
        logger.error({ err: error }, "Worker cycle failed");
      }
      if (once)
        return collectionExitCode(
          heartbeat.lastCycleStatus ?? "failed",
          args.includes("--skip-busy"),
        );
      if (controller.signal.aborted) break;
      heartbeat.state = "waiting";
      heartbeat.nextRunAt = new Date(
        Date.now() + intervalMinutes * 60000,
      ).toISOString();
      await writeHeartbeat();
      await delay(intervalMinutes * 60000, undefined, {
        signal: controller.signal,
      }).catch((error) => {
        if (!controller.signal.aborted) throw error;
      });
    } while (!controller.signal.aborted);
    return 0;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await writingHeartbeat;
    heartbeat.state = "stopped";
    heartbeat.nextRunAt = null;
    if (!once) await writeHeartbeat();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
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
