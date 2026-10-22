import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sourceConfigSchema, type SourceConfig } from "./adapters/types";
import { readSources } from "./collector";
import {
  automaticRetryReasons,
  inventoryConfigHash,
  readInventoryBaseline,
  sourceWriteFingerprint,
  type FailureReason,
} from "./inventory-outcome";
import { acquireLock, releaseLock } from "./repository";
import { startCollectorLease } from "./lease";
import { runRefresh, type RefreshOptions, type RefreshReport } from "./refresh";
import { db } from "./db";
import {
  atomicJson,
  reportDirectory,
  type CollectionReport,
  type SourceMetrics,
} from "./refresh-report";

const idSchema = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
const directory = () => join(reportDirectory(), "sessions");
export const refreshSessionPath = (id: string) =>
  join(directory(), `${idSchema.parse(id)}.json`);
type SessionPass = {
  runId: string;
  kind: "collection" | "finalization";
  sourceIds: string[];
  startedAt: string;
  completedAt: string | null;
  reportPath: string;
  originalReportPath: string;
  report: RefreshReport | null;
  evidencePaths?: string[];
};
export type RefreshSession = {
  version: 1;
  sessionId: string;
  status:
    | "ready"
    | "running"
    | "partial"
    | "review"
    | "complete"
    | "cancelled"
    | "failed";
  startedAt: string;
  updatedAt: string;
  activeRunId: string | null;
  maxPasses: number;
  maxSourceAttempts: number;
  sources: SourceConfig[];
  options: Pick<RefreshOptions, "cacheMaxAgeHours" | "geocode" | "target">;
  passes: SessionPass[];
  errors: string[];
  reportPath: string;
  leaseOwner?: string;
  initialIngestRunIds?: Record<string, string | null>;
  initialSourceFingerprints?: Record<string, string>;
};
type Dependencies = {
  refresh?: typeof runRefresh;
  readSources?: typeof readSources;
  pipeline?: Parameters<typeof runRefresh>[1];
};
export async function readRefreshSession(id: string): Promise<RefreshSession> {
  const value = JSON.parse(
    await readFile(refreshSessionPath(id), "utf8"),
  ) as RefreshSession;
  if (
    value.version !== 1 ||
    value.sessionId !== id ||
    !Array.isArray(value.passes) ||
    value.passes.length > 22
  )
    throw new Error("Invalid or unsupported refresh session manifest");
  value.sources = z
    .array(sourceConfigSchema)
    .min(1)
    .max(50)
    .parse(value.sources);
  z.number().int().min(1).max(10).parse(value.maxPasses);
  z.number().int().min(1).max(10).parse(value.maxSourceAttempts);
  for (const pass of value.passes) idSchema.parse(pass.runId);
  value.reportPath = refreshSessionPath(id);
  for (const pass of value.passes) {
    pass.reportPath = join(directory(), id, "passes", `${pass.runId}.json`);
    pass.evidencePaths = pass.evidencePaths?.map((path) => {
      const name = path.split(/[\\/]/).at(-1)!;
      if (!/^[a-zA-Z0-9-]+\.json$/.test(name))
        throw new Error("Unsafe session evidence filename");
      return join(directory(), id, "passes", name);
    });
  }
  return value;
}
async function save(session: RefreshSession) {
  if (
    session.leaseOwner &&
    !(await db.jobLock.findFirst({
      where: {
        key: `refresh-session-${session.sessionId}`,
        owner: session.leaseOwner,
        expiresAt: { gt: new Date() },
      },
    }))
  )
    throw new Error(
      "Refresh session lease lost; stale operator may not overwrite its successor's manifest",
    );
  session.updatedAt = new Date().toISOString();
  await atomicJson(refreshSessionPath(session.sessionId), session);
  await atomicJson(join(directory(), "latest-session.json"), {
    sessionId: session.sessionId,
    updatedAt: session.updatedAt,
    reportPath: session.reportPath,
  });
}
export async function listRefreshSessions() {
  let names: string[];
  try {
    names = await readdir(directory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const sessions = await Promise.all(
    names
      .filter(
        (name) =>
          /^[a-zA-Z0-9-]{1,100}\.json$/.test(name) &&
          name !== "latest-session.json",
      )
      .map((name) => readRefreshSession(name.slice(0, -5))),
  );
  const locks = await db.jobLock.findMany();
  return sessions
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
    .map((session) => ({
      ...summarizeSession(sessionPreview(session)),
      leaseLive: locks.some(
        (lock) =>
          lock.key === `refresh-session-${session.sessionId}` &&
          +lock.expiresAt > Date.now(),
      ),
    }));
}
function summarizeSession(preview: ReturnType<typeof sessionPreview>) {
  return {
    ...preview,
    sources: preview.sources.map((source) => {
      const { remainingUrls, retryableUrls, results, ...counts } =
        source.details;
      return {
        ...source,
        details: {
          ...counts,
          results: results
            .filter(
              (result) =>
                result.status === "failed" || result.status === "backoff",
            )
            .slice(0, 20),
          resultCount: results.length,
        },
        failures: source.failures.slice(0, 20),
      };
    }),
  };
}
function collectionMetrics(session: RefreshSession, sourceId: string) {
  return session.passes
    .filter((pass) => pass.kind === "collection")
    .flatMap(
      (pass) =>
        pass.report?.collection?.metrics.filter(
          (metric) => metric.sourceId === sourceId,
        ) ?? [],
    );
}
export function sessionPreview(session: RefreshSession, now = Date.now()) {
  const sources = session.sources.map((source) => {
    const history = collectionMetrics(session, source.id);
    const latest = history.at(-1);
    const accepted = history
      .filter((metric) => metric.inventory?.accepted)
      .at(-1);
    const detailResults = new Map<
      string,
      NonNullable<SourceMetrics["detailResults"]>[number]
    >();
    const successes = new Map<string, string>();
    for (const metric of history)
      for (const result of metric.detailResults ?? []) {
        if (result.status === "not-requested") continue;
        const previous = detailResults.get(result.url);
        detailResults.set(result.url, {
          ...result,
          reason: result.reason ?? previous?.reason,
        });
        if (result.status === "succeeded" && result.observedAt)
          successes.set(
            result.url,
            [successes.get(result.url) ?? "", result.observedAt].sort().at(-1)!,
          );
      }
    const eligible =
      source.detailPolicy === "summary-only" || !source.followDetails
        ? []
        : (accepted?.eligibleDetailUrls ?? []);
    const remaining = eligible.filter((url) => !successes.has(url));
    const retryableDetails = remaining.filter((url) => {
      const result = detailResults.get(url);
      if (result?.nextAttemptAt && Date.parse(result.nextAttemptAt) > now)
        return false;
      return (
        !result ||
        result.status === "deferred" ||
        ((result.status === "failed" || result.status === "backoff") &&
          result.reason === "transient-network")
      );
    });
    const inventoryFailures =
      latest?.failures?.filter((failure) => failure.phase !== "detail") ?? [];
    const requestFailures = inventoryFailures.filter(
      (failure) => failure.phase === "inventory",
    );
    const inventoryReasons = [
      ...new Set([
        ...(latest?.inventory?.reasons ?? []),
        ...inventoryFailures.map((failure) => failure.reason),
      ]),
    ];
    const lastPass = session.passes
      .filter(
        (pass) =>
          pass.kind === "collection" && pass.sourceIds.includes(source.id),
      )
      .at(-1);
    const cancelled = lastPass?.report?.status === "cancelled";
    // An incomplete capture can also fail a count/coverage gate. Retrying its
    // transient request is permitted; the next complete capture still must pass
    // every original quality gate. A standalone quality or write failure is not retried.
    const transientRequests =
      requestFailures.length > 0 &&
      requestFailures.every(
        (failure) => failure.reason === "transient-network",
      );
    const cancelledOnly =
      cancelled &&
      inventoryReasons.includes("cancelled") &&
      inventoryReasons.every(
        (reason) => reason === "cancelled" || reason === "quality",
      );
    const inventoryRetryable =
      !latest ||
      (!latest.inventory?.accepted &&
        !latest.inventoryPageLimitReached &&
        !inventoryReasons.includes("inventory-cap") &&
        !inventoryFailures.some((failure) => failure.phase === "write") &&
        (transientRequests || cancelledOnly));
    const attempts = session.passes.filter(
      (pass) =>
        pass.kind === "collection" && pass.sourceIds.includes(source.id),
    ).length;
    const adsSeen = new Set(
      history.flatMap((metric) => metric.inventoryIds ?? []),
    );
    const observations = new Map<
      string,
      { observedAt: string; fetched: boolean }
    >();
    for (const metric of history)
      for (const observation of metric.observations ?? []) {
        const key = JSON.stringify([observation.url, observation.observedAt]);
        observations.set(key, {
          observedAt: observation.observedAt,
          fetched:
            observations.get(key)?.fetched === true ||
            observation.retrieval === "fetched",
        });
      }
    const complete =
      latest?.inventory?.accepted === true && remaining.length === 0;
    return {
      sourceId: source.id,
      source: source.name,
      configHash: inventoryConfigHash(source),
      attempts,
      latestInventory: latest?.inventory ?? null,
      lastAcceptedInventory: accepted?.inventory ?? null,
      currentInventoryAds: latest?.inventory?.accepted
        ? latest.inventory.count
        : null,
      adsSeenAcrossPasses: adsSeen.size,
      details: {
        eligible: eligible.length,
        succeeded: eligible.filter((url) => successes.has(url)).length,
        remaining: remaining.length,
        retryableNow: retryableDetails.length,
        remainingUrls: remaining,
        retryableUrls: retryableDetails,
        results: [...detailResults.values()],
      },
      observations: {
        unique: observations.size,
        fetched: [...observations.values()].filter((value) => value.fetched)
          .length,
        cacheOnly: [...observations.values()].filter((value) => !value.fetched)
          .length,
        predatesSession: [...observations.values()].filter(
          (value) => value.observedAt < session.startedAt,
        ).length,
      },
      failures: latest?.failures ?? [],
      complete,
      canContinue:
        attempts < session.maxSourceAttempts &&
        (inventoryRetryable ||
          (latest?.inventory?.accepted === true &&
            retryableDetails.length > 0)),
      continuation: inventoryRetryable
        ? ("inventory" as const)
        : ("details" as const),
      excludedReasons: [
        ...new Set(
          [
            ...inventoryReasons,
            ...remaining
              .map((url) => detailResults.get(url)?.reason)
              .filter((reason): reason is FailureReason => !!reason),
          ].filter(
            (reason) =>
              !automaticRetryReasons.has(reason) &&
              !(cancelled && reason === "cancelled") &&
              !(inventoryRetryable && reason === "quality"),
          ),
        ),
      ],
    };
  });
  const collectionPasses = session.passes.filter(
    (pass) => pass.kind === "collection",
  ).length;
  return {
    sessionId: session.sessionId,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    activeRunId: session.activeRunId,
    maxPasses: session.maxPasses,
    collectionPasses,
    canContinue:
      session.status !== "complete" &&
      collectionPasses < session.maxPasses &&
      sources.some((source) => source.canContinue),
    readyForCompleteExport: sources.every((source) => source.complete),
    sources,
    passes: session.passes.map((pass) => ({
      runId: pass.runId,
      kind: pass.kind,
      sourceIds: pass.sourceIds,
      status:
        pass.runId === session.activeRunId
          ? "running"
          : !pass.completedAt
            ? "interrupted"
            : (pass.report?.status ?? "interrupted"),
      reportPath: pass.reportPath,
      originalReportPath: pass.originalReportPath,
      startedAt: pass.startedAt,
      completedAt: pass.completedAt,
    })),
    errors: session.errors,
    reportPath: session.reportPath,
    note: "Repeated passes are reconciled by source/ad identity and URL/capture time; cache observations keep their original dates. Partial or denied coverage remains explicit. Collection passes never activate a website snapshot.",
  };
}
async function preservePass(session: RefreshSession, pass: SessionPass) {
  await atomicJson(pass.reportPath, pass.report);
  pass.evidencePaths = [pass.reportPath];
  if (!pass.report?.collection) return;
  const collectionPath = join(
    directory(),
    session.sessionId,
    "passes",
    `${pass.runId}-collection.json`,
  );
  await atomicJson(collectionPath, pass.report.collection);
  pass.evidencePaths.push(collectionPath);
  for (const source of session.sources) {
    const qualityPath = join(
      reportDirectory(),
      `${pass.runId}-${source.id}-quality.json`,
    );
    try {
      const quality = JSON.parse(await readFile(qualityPath, "utf8"));
      const path = join(
        directory(),
        session.sessionId,
        "passes",
        `${pass.runId}-${source.id}-quality.json`,
      );
      await atomicJson(path, quality);
      pass.evidencePaths.push(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
async function checkedSources(
  session: RefreshSession,
  dependencies: Dependencies,
) {
  const configured = await (dependencies.readSources ?? readSources)();
  const enabled = configured.filter((source) => source.enabled);
  if (
    new Set(enabled.map((source) => source.id)).size !== enabled.length ||
    new Set(enabled.map((source) => source.name)).size !== enabled.length
  )
    throw new Error("Enabled source IDs and names must be unique");
  for (const stored of session.sources) {
    const current = configured.find((source) => source.id === stored.id);
    if (
      !current?.enabled ||
      inventoryConfigHash(current) !== inventoryConfigHash(stored) ||
      current.followDetails !== stored.followDetails ||
      current.detailPolicy !== stored.detailPolicy ||
      current.maxDetailPages !== stored.maxDetailPages ||
      JSON.stringify(current.detailMakes ?? []) !==
        JSON.stringify(stored.detailMakes ?? []) ||
      current.detailMaxLength !== stored.detailMaxLength
    )
      throw new Error(
        `Source ${stored.id} changed or was disabled; start a new session after reviewing its scope`,
      );
  }
}
export async function startRefreshSession(
  options: {
    sessionId?: string;
    sourceIds?: string[];
    maxPasses?: number;
    maxSourceAttempts?: number;
    signal?: AbortSignal;
    cacheMaxAgeHours?: number;
    geocode?: boolean;
    target?: string;
    deferFirstPass?: boolean;
  } = {},
  dependencies: Dependencies = {},
) {
  const configured = await (dependencies.readSources ?? readSources)();
  if (
    options.sourceIds &&
    new Set(options.sourceIds).size !== options.sourceIds.length
  )
    throw new Error("Repeated source IDs are not permitted");
  const sources = configured.filter(
    (source) =>
      source.enabled &&
      (!options.sourceIds || options.sourceIds.includes(source.id)),
  );
  if (
    !sources.length ||
    (options.sourceIds && sources.length !== options.sourceIds.length)
  )
    throw new Error("Session requires known enabled sources");
  if (
    new Set(sources.map((source) => source.id)).size !== sources.length ||
    new Set(sources.map((source) => source.name)).size !== sources.length
  )
    throw new Error("Session source IDs and names must be unique");
  const sessionId = idSchema.parse(options.sessionId ?? randomUUID());
  const now = new Date().toISOString();
  const initialIngestRunIds = Object.fromEntries(
    await Promise.all(
      sources.map(async (source) => [
        source.id,
        (
          await db.ingestRun.findFirst({
            where: { source: source.name },
            orderBy: [{ startedAt: "desc" }, { id: "desc" }],
            select: { id: true },
          })
        )?.id ?? null,
      ]),
    ),
  );
  const initialSourceFingerprints = Object.fromEntries(
    await Promise.all(
      sources.map(async (source) => [
        source.id,
        await sourceWriteFingerprint(source.name),
      ]),
    ),
  );
  const session: RefreshSession = {
    version: 1,
    sessionId,
    status: "ready",
    startedAt: now,
    updatedAt: now,
    activeRunId: null,
    maxPasses: z
      .number()
      .int()
      .min(1)
      .max(10)
      .parse(options.maxPasses ?? 5),
    maxSourceAttempts: z
      .number()
      .int()
      .min(1)
      .max(10)
      .parse(options.maxSourceAttempts ?? 3),
    sources,
    options: {
      cacheMaxAgeHours: options.cacheMaxAgeHours,
      geocode: options.geocode,
      target: options.target,
    },
    passes: [],
    errors: [],
    reportPath: refreshSessionPath(sessionId),
    initialIngestRunIds,
    initialSourceFingerprints,
  };
  await mkdir(directory(), { recursive: true });
  try {
    await writeFile(
      refreshSessionPath(sessionId),
      JSON.stringify(session, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        "Session already exists; its original scope was preserved",
      );
    throw error;
  }
  await atomicJson(join(directory(), "latest-session.json"), {
    sessionId,
    updatedAt: now,
    reportPath: session.reportPath,
  });
  if (options.deferFirstPass) return sessionPreview(session);
  return continueRefreshSession(
    sessionId,
    { signal: options.signal },
    dependencies,
  );
}
async function withSessionLease<T>(
  id: string,
  signal: AbortSignal | undefined,
  action: (session: RefreshSession, signal: AbortSignal) => Promise<T>,
) {
  const key = `refresh-session-${idSchema.parse(id)}`;
  const owner = await acquireLock(key, 3600000);
  if (!owner)
    throw new Error("This refresh session already has an active operator");
  const lease = startCollectorLease(owner, { key, signal });
  try {
    await lease.checkpoint();
    const session = await readRefreshSession(id);
    session.leaseOwner = owner;
    if (session.activeRunId) {
      // A new exclusive owner may resume after a process interruption, but the
      // interrupted attempt remains in the immutable pass list for inspection.
      const old = session.passes.find(
        (pass) => pass.runId === session.activeRunId,
      );
      if (old && !old.report) {
        try {
          old.report = JSON.parse(
            await readFile(
              join(reportDirectory(), `${old.runId}-refresh.json`),
              "utf8",
            ),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        old.completedAt = old.report?.completedAt ?? null;
        if (old.report) {
          try {
            await readFile(old.reportPath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            await preservePass(session, old);
          }
        }
      }
      session.errors.push(
        `Resumed after interrupted operator ${session.activeRunId}; original reports were retained`,
      );
      session.activeRunId = null;
      session.status =
        old?.kind === "finalization" &&
        old.report?.snapshot &&
        old.report.stage === "complete" &&
        ["success", "partial"].includes(old.report.status)
          ? "complete"
          : sessionPreview(session).readyForCompleteExport
            ? "review"
            : "partial";
      await save(session);
    }
    return await action(session, lease.signal);
  } finally {
    await lease.stop();
    await releaseLock(key, owner);
  }
}
export async function continueRefreshSession(
  id: string,
  options: { signal?: AbortSignal } = {},
  dependencies: Dependencies = {},
) {
  return withSessionLease(id, options.signal, async (session, signal) => {
    if (session.status === "complete")
      throw new Error(
        "This session is already finalized; start a new session for a new observation",
      );
    await checkedSources(session, dependencies);
    const preview = sessionPreview(session);
    if (!preview.canContinue) return preview;
    const selected = preview.sources.filter((source) => source.canContinue);
    const sources = session.sources.filter((source) =>
      selected.some((candidate) => candidate.sourceId === source.id),
    );
    const detailUrlsBySource = Object.fromEntries(
      selected
        .filter((source) => source.continuation === "details")
        .map((source) => [source.sourceId, source.details.retryableUrls]),
    );
    const runId = randomUUID();
    const pass: SessionPass = {
      runId,
      kind: "collection",
      sourceIds: sources.map((source) => source.id),
      startedAt: new Date().toISOString(),
      completedAt: null,
      reportPath: join(directory(), id, "passes", `${runId}.json`),
      originalReportPath: join(reportDirectory(), `${runId}-refresh.json`),
      report: null,
    };
    session.passes.push(pass);
    session.status = "running";
    session.activeRunId = runId;
    await save(session);
    try {
      pass.report = await (dependencies.refresh ?? runRefresh)(
        {
          ...session.options,
          runId,
          sources,
          signal,
          sessionId: id,
          detailUrlsBySource,
          deferExport: true,
        },
        dependencies.pipeline,
      );
      pass.completedAt = pass.report.completedAt;
      await preservePass(session, pass);
      const after = sessionPreview(session);
      session.status =
        pass.report.status === "cancelled"
          ? "cancelled"
          : after.readyForCompleteExport
            ? "review"
            : "partial";
      if (pass.report.status === "failed" || pass.report.status === "busy")
        session.errors.push(
          `Pass ${runId} ${pass.report.status}; website preserved. ${pass.report.errors.join("; ")}`,
        );
    } catch (error) {
      session.status = signal.aborted ? "cancelled" : "failed";
      session.errors.push(
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      session.activeRunId = null;
      await save(session);
    }
    return sessionPreview(session);
  });
}
export async function finalizeRefreshSession(
  id: string,
  options: { signal?: AbortSignal; allowPartial?: boolean } = {},
  dependencies: Dependencies = {},
) {
  return withSessionLease(id, options.signal, async (session, signal) => {
    if (session.status === "complete") return sessionPreview(session);
    if (
      session.passes.filter((pass) => pass.kind === "finalization").length >= 3
    )
      throw new Error(
        "Session finalization attempt limit reached; inspect preserved reports before starting a new session",
      );
    await checkedSources(session, dependencies);
    const preview = sessionPreview(session);
    if (!preview.readyForCompleteExport && !options.allowPartial)
      throw new Error(
        "Session remains partial. Inspect its source outcomes; --allow-partial is required to export incomplete coverage",
      );
    const metrics = session.sources.flatMap((source) => {
      const latest = collectionMetrics(session, source.id).at(-1);
      const coverage = preview.sources.find(
        (candidate) => candidate.sourceId === source.id,
      )!;
      if (!latest) return [];
      return [
        {
          ...latest,
          sessionAggregate: true,
          detailPagesEligible: coverage.details.eligible,
          detailPagesSucceeded: coverage.details.succeeded,
          detailPagesAttempted: coverage.details.results.filter(
            (result) =>
              result.status === "succeeded" || result.status === "failed",
          ).length,
          detailPagesFailed: coverage.details.results.filter(
            (result) =>
              result.status === "failed" &&
              coverage.details.remainingUrls.includes(result.url),
          ).length,
          detailPagesDeferred: coverage.details.remaining,
          detailPagesSkippedLimit: coverage.details.remaining,
          detailResults: coverage.details.results,
          cacheHits: coverage.observations.cacheOnly,
          fetchedPages: coverage.observations.fetched,
        },
      ];
    });
    if (!metrics.some((metric) => metric.inventory?.accepted))
      throw new Error(
        "No accepted inventory in this session; website preserved",
      );
    const runId = randomUUID();
    const collection: CollectionReport = {
      version: 1,
      runId,
      sessionId: id,
      status: preview.readyForCompleteExport ? "success" : "partial",
      busy: false,
      startedAt: session.startedAt,
      completedAt: new Date().toISOString(),
      runs: session.sources.map((source) => ({
        id: `session-${source.id}`,
        source: source.name,
        status: preview.sources.find(
          (candidate) => candidate.sourceId === source.id,
        )!.complete
          ? "success"
          : "error",
        found:
          metrics.find((metric) => metric.sourceId === source.id)?.inventory
            ?.count ?? 0,
        new: 0,
        updated: 0,
        removed: 0,
        errors: preview.sources.find(
          (candidate) => candidate.sourceId === source.id,
        )!.failures,
      })),
      metrics,
      reconciledRuns: 0,
      errors: preview.sources
        .filter((source) => !source.complete)
        .map(
          (source) =>
            `${source.source}: inventory ${source.latestInventory?.status ?? "not observed"}; ${source.details.remaining} details remain`,
        ),
      reportPath: join(directory(), id, "passes", `${runId}-collection.json`),
    };
    await atomicJson(collection.reportPath, collection);
    const pass: SessionPass = {
      runId,
      kind: "finalization",
      sourceIds: session.sources.map((source) => source.id),
      startedAt: new Date().toISOString(),
      completedAt: null,
      reportPath: join(directory(), id, "passes", `${runId}.json`),
      originalReportPath: join(reportDirectory(), `${runId}-refresh.json`),
      report: null,
    };
    session.passes.push(pass);
    session.status = "running";
    session.activeRunId = runId;
    await save(session);
    try {
      pass.report = await (dependencies.refresh ?? runRefresh)(
        {
          ...session.options,
          runId,
          signal,
          sessionId: id,
          allowPartial: options.allowPartial,
        },
        {
          ...dependencies.pipeline,
          collect: async () => collection,
          validateCollection: async (report) => {
            // Recheck accepted observations while the export collector lease is held.
            // A later external collection must not be mislabeled as this session.
            for (const source of session.sources) {
              const latest = collectionMetrics(session, source.id).at(-1);
              const expectedIngestId =
                latest?.ingestRunId ??
                session.passes
                  .filter((candidate) => candidate.kind === "collection")
                  .flatMap(
                    (candidate) =>
                      candidate.report?.collection?.runs.filter(
                        (run) => run.source === source.name,
                      ) ?? [],
                  )
                  .at(-1)?.id ??
                session.initialIngestRunIds?.[source.id] ??
                null;
              const latestIngest = await db.ingestRun.findFirst({
                where: { source: source.name },
                orderBy: [{ startedAt: "desc" }, { id: "desc" }],
                select: { id: true },
              });
              if ((latestIngest?.id ?? null) !== expectedIngestId)
                throw new Error(
                  `Source ${source.id} was written by another ingestion after this session's pass; website preserved. Start a new session`,
                );
              const expectedFingerprint =
                latest?.writeFingerprint ??
                session.initialSourceFingerprints?.[source.id];
              if (
                !expectedFingerprint ||
                (await sourceWriteFingerprint(source.name)) !==
                  expectedFingerprint
              )
                throw new Error(
                  `Source observations for ${source.id} changed outside this session; website preserved. Start a new session`,
                );
              const accepted = collectionMetrics(session, source.id)
                .filter((metric) => metric.inventory?.accepted)
                .at(-1)?.inventory;
              if (!accepted) continue;
              const current = await readInventoryBaseline(source);
              const acceptedRun = session.passes
                .filter(
                  (candidate) =>
                    candidate.kind === "collection" &&
                    candidate.report?.collection?.metrics.some(
                      (metric) =>
                        metric.sourceId === source.id &&
                        metric.inventory === accepted,
                    ),
                )
                .at(-1)?.runId;
              if (
                !current ||
                current.runId !== acceptedRun ||
                current.configHash !== accepted.configHash ||
                current.count !== accepted.count
              )
                throw new Error(
                  `Inventory baseline for ${source.id} changed outside this session; website preserved. Start a new session`,
                );
            }
            await dependencies.pipeline?.validateCollection?.(report);
          },
        },
      );
      pass.completedAt = pass.report.completedAt;
      await preservePass(session, pass);
      session.status =
        pass.report.snapshot &&
        ["success", "partial"].includes(pass.report.status)
          ? "complete"
          : pass.report.status === "cancelled"
            ? "cancelled"
            : "failed";
      if (session.status !== "complete")
        session.errors.push(
          `Finalization ${runId} ${pass.report.status}; ${pass.report.errors.join("; ")}`,
        );
    } catch (error) {
      session.status = signal.aborted ? "cancelled" : "failed";
      session.errors.push(
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      session.activeRunId = null;
      await save(session);
    }
    return sessionPreview(session);
  });
}

/** Register inside the app's authenticated /api boundary. Operations are queued so UI polling stays responsive. */
export function registerRefreshSessionRoutes(app: FastifyInstance) {
  const recordFailure = async (id: string, error: unknown) => {
    await withSessionLease(id, undefined, async (session) => {
      if (!session.activeRunId) {
        session.errors.push(
          error instanceof Error ? error.message : String(error),
        );
        if (session.status !== "complete") session.status = "failed";
        await save(session);
      }
    });
  };
  app.get("/api/admin/refresh-sessions", listRefreshSessions);
  app.get("/api/admin/refresh-sessions/:id", async (request) =>
    summarizeSession(
      sessionPreview(
        await readRefreshSession(
          idSchema.parse((request.params as { id: unknown }).id),
        ),
      ),
    ),
  );
  app.post("/api/admin/refresh-sessions", async (request, reply) => {
    const options = z
      .object({
        sourceIds: z
          .array(z.string().regex(/^[a-z0-9-]{1,80}$/))
          .max(50)
          .optional(),
        maxPasses: z.number().int().min(1).max(10).optional(),
        maxSourceAttempts: z.number().int().min(1).max(10).optional(),
      })
      .strict()
      .parse(request.body ?? {});
    const sessionId = randomUUID();
    await startRefreshSession({ ...options, sessionId, deferFirstPass: true });
    void continueRefreshSession(sessionId).catch((error) =>
      recordFailure(sessionId, error).catch(() => {}),
    );
    return reply
      .code(202)
      .send({
        sessionId,
        message:
          "Refresh session queued; collection passes preserve the current website until finalization",
      });
  });
  app.post(
    "/api/admin/refresh-sessions/:id/continue",
    async (request, reply) => {
      const id = idSchema.parse((request.params as { id: unknown }).id);
      const session = await readRefreshSession(id);
      await checkedSources(session, {});
      if (!sessionPreview(session).canContinue)
        return reply
          .code(409)
          .send({
            error:
              "No eligible continuation now; inspect policy failures, retry backoff and pass limits",
          });
      void continueRefreshSession(id).catch((error) =>
        recordFailure(id, error).catch(() => {}),
      );
      return reply
        .code(202)
        .send({
          sessionId: id,
          message:
            "Bounded continuation queued; denied and rate-limited sources are not blindly retried",
        });
    },
  );
  app.post(
    "/api/admin/refresh-sessions/:id/finalize",
    async (request, reply) => {
      const id = idSchema.parse((request.params as { id: unknown }).id);
      const session = await readRefreshSession(id);
      await checkedSources(session, {});
      const options = z
        .object({ allowPartial: z.boolean().optional() })
        .strict()
        .parse(request.body ?? {});
      const preview = sessionPreview(session);
      if (!preview.readyForCompleteExport && !options.allowPartial)
        return reply
          .code(409)
          .send({
            error:
              "Session is partial; review coverage and explicitly select partial finalization",
          });
      if (!preview.sources.some((source) => source.latestInventory?.accepted))
        return reply
          .code(409)
          .send({
            error: "No accepted inventory in this session; website preserved",
          });
      void finalizeRefreshSession(id, options).catch((error) =>
        recordFailure(id, error).catch(() => {}),
      );
      return reply
        .code(202)
        .send({
          sessionId: id,
          message:
            "Session finalization queued; inspect the final report for activation or preserved-snapshot errors",
        });
    },
  );
}
