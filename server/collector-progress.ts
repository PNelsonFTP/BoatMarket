import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  atomicJson,
  reportDirectory,
  type SourceMetrics,
  type CollectionStatus,
} from "./refresh-report";

export type CollectorProgress = {
  version: 1;
  runId: string;
  leaseOwner: string;
  status: "running" | CollectionStatus;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  elapsedMs: number;
  lastSuccessfulCheckpointAt: string | null;
  sourceId: string | null;
  source: string | null;
  ingestRunId: string | null;
  sourceIndex: number;
  sourceCount: number;
  phase:
    "starting" | "inventory" | "details" | "quality" | "writing" | "complete";
  currentUrl: string | null;
  wait: { reason: string; until: string } | null;
  cancellationPending: boolean;
  metrics: SourceMetrics | null;
  error: string | null;
  reportPath: string;
};
export const collectorProgressPath = (runId: string) => {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(runId))
    throw new Error("Invalid progress run ID");
  return join(reportDirectory(), "progress", `${runId}.json`);
};
/** Dirty checkpoints coalesce to at most one write per interval; source/final boundaries force a flush. */
export function createCollectorProgress(
  runId: string,
  leaseOwner: string,
  options: {
    intervalMs?: number;
    now?: () => number;
    persist?: typeof atomicJson;
  } = {},
) {
  const now = options.now ?? Date.now,
    intervalMs = options.intervalMs ?? 2500;
  const started = now();
  const value: CollectorProgress = {
    version: 1,
    runId,
    leaseOwner,
    status: "running",
    startedAt: new Date(started).toISOString(),
    updatedAt: new Date(started).toISOString(),
    completedAt: null,
    elapsedMs: 0,
    lastSuccessfulCheckpointAt: null,
    sourceId: null,
    source: null,
    ingestRunId: null,
    sourceIndex: 0,
    sourceCount: 0,
    phase: "starting",
    currentUrl: null,
    wait: null,
    cancellationPending: false,
    metrics: null,
    error: null,
    reportPath: collectorProgressPath(runId),
  };
  let lastWrite = -Infinity,
    dirty = false,
    stopped = false;
  let failure: unknown;
  let pending: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    if (failure) throw failure;
    if (!dirty) return pending;
    dirty = false;
    lastWrite = now();
    const snapshot = structuredClone({
      ...value,
      elapsedMs: Math.max(0, now() - started),
    });
    pending = pending
      .then(() => (options.persist ?? atomicJson)(value.reportPath, snapshot))
      .catch((error) => {
        failure = error;
        throw error;
      });
    return pending;
  };
  const checkpoint = async (
    patch: Partial<CollectorProgress> = {},
    force = false,
  ) => {
    if (failure) throw failure;
    if (stopped) return;
    const bounded = { ...patch };
    if (patch.metrics) {
      const {
        inventoryIds,
        eligibleDetailUrls,
        detailResults,
        observations,
        failures,
        ...counters
      } = patch.metrics;
      bounded.metrics = { ...counters, failures: failures?.slice(-10) };
    }
    Object.assign(value, bounded, { updatedAt: new Date(now()).toISOString() });
    dirty = true;
    if (force || now() - lastWrite >= intervalMs) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await flush();
    } else if (!timer) {
      timer = setTimeout(
        () => {
          timer = undefined;
          void flush().catch(() => {});
        },
        Math.max(1, intervalMs - (now() - lastWrite)),
      );
      timer.unref?.();
    }
  };
  return {
    value,
    checkpoint,
    async finish(status: CollectionStatus, error: string | null = null) {
      await checkpoint(
        {
          status,
          phase: "complete",
          currentUrl: null,
          wait: null,
          completedAt: new Date(now()).toISOString(),
          error,
        },
        true,
      );
      stopped = true;
      if (timer) clearTimeout(timer);
      await pending;
    },
  };
}
export async function readCollectorProgress(
  runId: string,
): Promise<CollectorProgress | null> {
  try {
    return JSON.parse(await readFile(collectorProgressPath(runId), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function listCollectorProgress() {
  const directory = join(reportDirectory(), "progress");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const values = await Promise.all(
    names
      .filter((name) => /^[a-zA-Z0-9-]{1,100}\.json$/.test(name))
      .map((name) => readCollectorProgress(name.slice(0, -5))),
  );
  return values
    .filter((value): value is CollectorProgress => !!value)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
