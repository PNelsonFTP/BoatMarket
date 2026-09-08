import { readFile, writeFile, mkdir, stat, rename } from "node:fs/promises";
import { join } from "node:path";
import { assertDiskSpace } from "./disk-space";
import { archiveEvidence, archiveExistingCache } from "./evidence";
import { recordFieldProvenance } from "../lib/provenance";
import { restoreSourceLocation } from "../lib/boat-location";
import { inspectSourceQuality } from "../lib/source-quality";
import {
  readEnrichmentState,
  saveEnrichmentState,
  selectDetailWork,
  recordDetailAttempt,
} from "./enrichment-state";
import { watchJobCancellation } from "./job-control";
import { reconcileAbandonedReports } from "./operations";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import robotsParser from "robots-parser";
import { z } from "zod";
import { requestPublic, publicUrl } from "./network";
import { sourceConfigSchema, type SourceConfig } from "./adapters/types";
import { adapters } from "./adapters";
import { db } from "./db";
import { acquireLock, releaseLock, upsertListing } from "./repository";
import { logger } from "./logger";
import { locateListing, readLocations } from "./locations";
import { listingSchema, type Listing } from "../lib/types";
import { startCollectorLease, isCollectionAbort } from "./lease";
import {
  persistCollectionReport,
  atomicJson,
  reportDirectory,
  type CollectionReport,
  type SourceMetrics,
} from "./refresh-report";
import {
  inventoryPages,
  verifiedEmptyRegionalPage,
} from "./adapters/pagination";
const configPath = () => process.env.SOURCE_CONFIG || "config/sources.json";
export async function readSources() {
  return z
    .array(sourceConfigSchema)
    .max(50)
    .parse(JSON.parse(await readFile(configPath(), "utf8")));
}
export async function writeSources(input: unknown) {
  const sources = z.array(sourceConfigSchema).max(50).parse(input);
  if (new Set(sources.map((s) => s.id)).size !== sources.length)
    throw new Error("Source IDs must be unique");
  for (const s of sources) for (const u of s.urls) await publicUrl(u);
  await writeFile(
    configPath() + ".tmp",
    JSON.stringify(sources, null, 2) + "\n",
  );
  await rename(configPath() + ".tmp", configPath());
  return sources;
}
const lastRequest = new Map<string, number>();
const cacheFile = (url: string) =>
  `${process.env.COLLECTION_CACHE_DIR || "data/cache"}/${createHash("sha256").update(url).digest("hex")}.html`;
async function observedAt(url: string, rendered = false) {
  return (
    await stat(
      rendered
        ? cacheFile(url).replace(/\.html$/, ".rendered.html")
        : cacheFile(url),
    )
  ).mtime.toISOString();
}
export function cacheAgeHours(
  value: unknown = process.env.COLLECTION_CACHE_HOURS ?? 24,
) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 1 || hours > 720)
    throw new Error(
      "Cache age must be between 1 and 720 hours; crawl restrictions always apply",
    );
  return hours;
}
type FetchOptions = {
  signal?: AbortSignal;
  cacheMaxAgeHours?: number;
  metrics?: SourceMetrics;
};
export async function politeFetch(url: string, options: FetchOptions = {}) {
  options.signal?.throwIfAborted();
  const cacheHours = cacheAgeHours(options.cacheMaxAgeHours);
  const sleep = (ms: number) =>
    delay(ms, undefined, { signal: options.signal });
  const file = cacheFile(url);
  try {
    const meta = await stat(file);
    if (Date.now() - meta.mtimeMs < cacheHours * 3600000) {
      const cached = await readFile(file, "utf8");
      if (options.metrics) options.metrics.cacheHits++;
      return cached;
    }
  } catch {
    /* cache miss: verify robots rules before making a new page request */
  }
  await assertDiskSpace(file);
  const origin = new URL(url).origin;
  const wait = Math.max(
    0,
    (lastRequest.get(origin) ?? 0) + 2500 + Math.random() * 1500 - Date.now(),
  );
  await sleep(wait);
  lastRequest.set(origin, Date.now());
  options.signal?.throwIfAborted();
  const robots = await requestPublic(`${origin}/robots.txt`, {
    signal: options.signal,
  });
  if (robots.status !== 404 && robots.status !== 410 && robots.status !== 200)
    throw new Error(`Could not verify robots.txt (HTTP ${robots.status})`);
  if (robots.status === 200) {
    const parser = robotsParser(`${origin}/robots.txt`, robots.body);
    if (parser.isAllowed(url, "BoatScout") === false)
      throw new Error("Collection disallowed by robots.txt");
    const delay = parser.getCrawlDelay("BoatScout");
    if (delay && delay > 60)
      throw new Error(
        "Source requests a crawl delay above 60 seconds; use manual import",
      );
    if (delay)
      await sleep(
        Math.max(
          0,
          delay * 1000 - (Date.now() - (lastRequest.get(origin) ?? 0)),
        ),
      );
  }
  await mkdir(process.env.COLLECTION_CACHE_DIR || "data/cache", {
    recursive: true,
  });
  await sleep(2000);
  const response = await requestPublic(url, { signal: options.signal });
  options.signal?.throwIfAborted();
  lastRequest.set(origin, Date.now());
  if (response.status !== 200)
    throw new Error(`Source returned HTTP ${response.status}`);
  if (
    /captcha|verify you are human|access denied|cf-chl-|automated access prohibited/i.test(
      response.body,
    ) &&
    response.body.length < 100000
  )
    throw new Error("Source returned an access challenge; use manual import");
  await archiveExistingCache(url, file);
  await archiveEvidence(url, response.body, new Date().toISOString());
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, response.body);
  await rename(temporary, file);
  if (options.metrics) options.metrics.fetchedPages++;
  return response.body;
}
async function renderAllowed(
  url: string,
  html: string,
  options: FetchOptions = {},
) {
  options.signal?.throwIfAborted();
  const cachedFile = cacheFile(url).replace(/\.html$/, ".rendered.html");
  try {
    const info = await stat(cachedFile);
    if (
      Date.now() - info.mtimeMs <
      cacheAgeHours(options.cacheMaxAgeHours) * 3600000
    )
      return await readFile(cachedFile, "utf8");
  } catch {
    /* first render */
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const abortRender = () => {
    void browser.close().catch(() => {});
  };
  options.signal?.addEventListener("abort", abortRender, { once: true });
  try {
    const context = await browser.newContext({
      userAgent: "BoatScout/1.0",
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      try {
        const req = route.request();
        if (
          ["image", "media", "font"].includes(req.resourceType()) ||
          new URL(req.url()).origin !== new URL(url).origin ||
          req.method() !== "GET"
        )
          return await route.abort();
        if (req.isNavigationRequest() && req.url() === url) {
          await route.fulfill({
            status: 200,
            contentType: "text/html",
            body: html,
          });
        } else {
          // Fulfill via the DNS-pinned HTTP client, never direct browser networking.
          const response = await requestPublic(req.url(), {
            signal: options.signal,
          });
          await route.fulfill({
            status: response.status,
            contentType: String(
              response.headers["content-type"] || "text/plain",
            ),
            body: response.body,
          });
        }
      } catch {
        await route.abort();
      }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    const result = await page.content();
    options.signal?.throwIfAborted();
    await archiveExistingCache(url, cachedFile, "rendered");
    await archiveEvidence(url, result, new Date().toISOString(), "rendered");
    const temporary = `${cachedFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, result);
    await rename(temporary, cachedFile);
    return result;
  } finally {
    options.signal?.removeEventListener("abort", abortRender);
    await browser.close();
  }
}

/** Preserve a last successful detail observation until detail enrichment succeeds again. */
export function preserveEnrichedDetail(
  summary: Listing,
  previous: Listing | null,
  reason: string,
  attemptedAt: string | null = null,
): Listing {
  if (!previous?.specs.detailsCheckedAt)
    return {
      ...summary,
      specs: {
        ...summary.specs,
        detailEnrichmentStatus: reason,
        ...(attemptedAt ? { detailAttemptedAt: attemptedAt } : {}),
      },
    };
  const retained = [
    "description",
    "make",
    "model",
    "year",
    "length",
    "horsepower",
    "engineHours",
    "category",
    "propulsion",
    "engines",
    "photos",
  ] as const;
  const result = { ...summary };
  const kept: string[] = [];
  for (const field of retained) {
    const value = previous[field];
    if (
      value != null &&
      value !== "" &&
      (!Array.isArray(value) || value.length)
    ) {
      Object.assign(result, { [field]: value });
      kept.push(field);
    }
  }
  // Price, availability and location remain the newly observed summary values.
  result.specs = {
    ...previous.specs,
    ...summary.specs,
    detailsCheckedAt: previous.specs.detailsCheckedAt,
    detailEnrichmentStatus: reason,
    retainedDetailFields: kept.join(", "),
    retainedDetailObservedAt: previous.specs.detailsCheckedAt,
    ...(attemptedAt ? { detailAttemptedAt: attemptedAt } : {}),
  };
  result.confidence = { ...previous.confidence, ...summary.confidence };
  for (const field of kept)
    if (previous.confidence[field] != null)
      result.confidence[field] = previous.confidence[field];
  return result;
}

function recordObservation(metrics: SourceMetrics, at: string) {
  if (!metrics.oldestObservationAt || at < metrics.oldestObservationAt)
    metrics.oldestObservationAt = at;
  if (!metrics.newestObservationAt || at > metrics.newestObservationAt)
    metrics.newestObservationAt = at;
}

export function mergeDetailObservation(
  summary: Listing,
  detail: Listing,
  summaryObservedAt: string,
  detailObservedAt: string,
): Listing {
  const useDetailPrice =
    detailObservedAt >= summaryObservedAt && detail.price != null;
  const terminalSummary =
    summary.status === "sold" || summary.status === "removed";
  const useDetailStatus =
    detailObservedAt > summaryObservedAt ||
    (detailObservedAt === summaryObservedAt && !terminalSummary);
  const result: Listing = {
    ...summary,
    ...Object.fromEntries(
      Object.entries(detail).filter(
        ([, value]) => value !== null && value !== undefined && value !== "",
      ),
    ),
    // A cached detail must never resurrect a freshly sold summary or restore an older asking price.
    price: useDetailPrice ? detail.price : summary.price,
    status: useDetailStatus ? detail.status : summary.status,
    removedAt: useDetailStatus ? detail.removedAt : summary.removedAt,
    photos: detail.photos.length
      ? [...new Set([...summary.photos, ...detail.photos])].slice(0, 100)
      : summary.photos,
    specs: {
      ...summary.specs,
      ...detail.specs,
      summaryCheckedAt: summaryObservedAt,
      detailsCheckedAt: detailObservedAt,
      priceObservedAt: useDetailPrice ? detailObservedAt : summaryObservedAt,
      availabilityObservedAt: useDetailStatus
        ? detailObservedAt
        : summaryObservedAt,
      detailEnrichmentStatus: "success",
    },
    rawPayload: { summary: summary.rawPayload, detail: detail.rawPayload },
  };
  // Pending/reserved text is also time-sensitive even when both records normalize to active.
  if (!useDetailStatus) {
    for (const key of ["availability", "salePending"]) {
      if (summary.specs[key] != null) result.specs[key] = summary.specs[key];
      else delete result.specs[key];
    }
  }
  return result;
}

export function listingContentFingerprint(listing: Listing) {
  const {
    id,
    rawPayload,
    firstSeenAt,
    lastSeenAt,
    groupId,
    vesselId,
    fieldProvenance,
    locationOverride,
    sourceLocation,
    routeEstimate,
    priceHistory,
    confidence,
    ...content
  } = listing;
  content.specs = Object.fromEntries(
    Object.entries(content.specs).filter(
      ([key]) =>
        !/^(?:summaryCheckedAt|detailsCheckedAt|priceObservedAt|availabilityObservedAt|detailAttemptedAt|detailEnrichmentStatus|detailEnrichmentError|retainedDetailFields|retainedDetailObservedAt)$/.test(
          key,
        ),
    ),
  );
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, sorted(item)]),
          )
        : value;
  return JSON.stringify(sorted(content));
}

export async function collect(
  sources?: SourceConfig[],
  options: {
    signal?: AbortSignal;
    cacheMaxAgeHours?: number;
    runId?: string;
  } = {},
): Promise<CollectionReport> {
  const report: CollectionReport = {
    version: 1,
    runId: options.runId ?? randomUUID(),
    status: "failed",
    busy: false,
    startedAt: new Date().toISOString(),
    completedAt: "",
    runs: [],
    metrics: [],
    reconciledRuns: 0,
    errors: [],
    reportPath: "",
  };
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(report.runId))
    throw new Error("Invalid collection run ID");
  const finish = async () => {
    report.completedAt = new Date().toISOString();
    return persistCollectionReport(report);
  };
  const control = watchJobCancellation(report.runId, options.signal);
  const owner = await acquireLock("collector", 3600000);
  if (!owner) {
    control.stop();
    report.busy = true;
    report.status = "busy";
    report.errors.push(
      "Another collector holds the lease; no sources were refreshed",
    );
    return finish();
  }
  const lease = startCollectorLease(owner, { signal: control.signal });
  let currentRun: string | null = null;
  try {
    await control.check();
    await lease.checkpoint();
    await reconcileAbandonedReports({
      key: "collector",
      owner,
      excludeRunId: report.runId,
    });
    const abandoned = await db.ingestRun.updateMany({
      where: { status: "running", completedAt: null },
      data: {
        status: "interrupted",
        completedAt: new Date(),
        errors: [
          "Previous collection ended without completion; reconciled after acquiring the collector lease",
        ],
      },
    });
    report.reconciledRuns = abandoned.count;
    const locations = await readLocations();
    const selected = (sources ?? (await readSources())).filter(
      (config) => config.enabled,
    );
    if (!selected.length)
      throw new Error("No enabled sources; collection did not run");
    for (const config of selected) {
      await lease.checkpoint();
      const run = await db.ingestRun.create({
        data: { source: config.name, area: config.area },
      });
      currentRun = run.id;
      const stats = { found: 0, new: 0, updated: 0, removed: 0 },
        errors: string[] = [];
      const policy = config.detailPolicy ?? "complete";
      const metrics: SourceMetrics = {
        sourceId: config.id,
        source: config.name,
        inventoryPagesConfigured: new Set(config.urls).size,
        inventoryPagesDiscovered: 0,
        inventoryPagesAttempted: 0,
        inventoryPagesSucceeded: 0,
        inventoryPageLimitReached: false,
        detailPagesEligible: 0,
        detailPagesAttempted: 0,
        detailPagesSucceeded: 0,
        detailPagesFailed: 0,
        detailPagesSkippedLimit: 0,
        detailPolicy: policy,
        detailPagesDeferred: 0,
        detailPagesBackoff: 0,
        duplicateAdsSkipped: 0,
        contentChanged: 0,
        metadataOnlyUpdated: 0,
        priceChanges: 0,
        priceDrops: 0,
        cacheHits: 0,
        fetchedPages: 0,
        cacheMaxAgeHours: cacheAgeHours(
          options.cacheMaxAgeHours ?? config.cacheMaxAgeHours,
        ),
        oldestObservationAt: null,
        newestObservationAt: null,
      };
      report.metrics.push(metrics);
      const fetchOptions = {
        signal: lease.signal,
        cacheMaxAgeHours: metrics.cacheMaxAgeHours,
        metrics,
      };
      try {
        if (!config.urls.length)
          throw new Error("Add one or more inventory URLs");
        const oldRows = await db.listing.findMany({
          where: { source: config.name, isSample: false },
        });
        const previousBySourceId = new Map(
          oldRows.map((row) => [
            row.sourceListingId,
            restoreSourceLocation(
              listingSchema.parse({
                ...(row.data as object),
                status: row.status,
                vesselId: row.vesselId,
                groupId: row.groupId,
              }),
            ),
          ]),
        );
        const pages = [...new Set(config.urls)].slice(
          0,
          config.maxInventoryPages,
        );
        if (new Set(config.urls).size > pages.length)
          metrics.inventoryPageLimitReached = true;
        const summaries: {
            listing: Listing;
            url: string;
            observedAt: string;
            evidenceHash: string;
          }[] = [],
          seen = new Set<string>();
        // Discover the inventory before choosing detail work, so each run can resume where earlier runs stopped.
        for (const url of pages) {
          try {
            await lease.checkpoint();
            metrics.inventoryPagesAttempted++;
            let html = await politeFetch(url, fetchOptions);
            if (config.render)
              html = await renderAllowed(url, html, fetchOptions);
            await lease.checkpoint();
            if (config.autoPaginate)
              for (const next of inventoryPages(html, url)) {
                if (pages.includes(next)) continue;
                if (pages.length >= config.maxInventoryPages) {
                  metrics.inventoryPageLimitReached = true;
                  break;
                }
                pages.push(next);
                metrics.inventoryPagesDiscovered++;
              }
            const parsed = adapters[config.adapter].parse(html, url, config);
            if (!parsed.length && !verifiedEmptyRegionalPage(html, url))
              throw new Error(
                "No listing records parsed. Check source markup or selectors; existing records are preserved.",
              );
            metrics.inventoryPagesSucceeded++;
            const at = await observedAt(url, config.render);
            recordObservation(metrics, at);
            const evidence = await archiveEvidence(
              url,
              html,
              at,
              config.render ? "rendered" : "html",
            );
            for (const input of parsed) {
              if (seen.has(input.sourceListingId)) {
                metrics.duplicateAdsSkipped++;
                continue;
              }
              seen.add(input.sourceListingId);
              summaries.push({
                listing: input,
                url,
                observedAt: at,
                evidenceHash: evidence.sha256,
              });
            }
          } catch (error) {
            if (isCollectionAbort(error, lease.signal)) throw error;
            errors.push(
              `${url}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        stats.found = summaries.length;
        const eligible = (listing: Listing, url: string) =>
          config.followDetails &&
          listing.sourceUrl !== url &&
          (!config.detailMakes?.length ||
            config.detailMakes.some(
              (m) => m.toLowerCase() === listing.make?.toLowerCase(),
            )) &&
          (config.detailMaxLength == null ||
            listing.length == null ||
            listing.length <= config.detailMaxLength);
        const eligibleUrls = [
          ...new Set(
            summaries
              .filter((s) => eligible(s.listing, s.url))
              .map((s) => s.listing.sourceUrl),
          ),
        ];
        metrics.detailPagesEligible = eligibleUrls.length;
        const state = await readEnrichmentState(config.id);
        const work = selectDetailWork(
          eligibleUrls,
          state,
          policy === "summary-only" ? 0 : config.maxDetailPages,
        );
        metrics.detailPagesBackoff =
          policy === "summary-only" ? 0 : work.backoff;
        metrics.detailPagesDeferred =
          policy === "summary-only" ? eligibleUrls.length : work.deferred;
        if (policy === "complete")
          metrics.detailPagesSkippedLimit = work.deferred + work.backoff;
        const detailed = new Set<string>(),
          staged: { listing: Listing; previous: Listing | null }[] = [];
        for (const summary of summaries) {
          await lease.checkpoint();
          const { url, observedAt: summaryAt } = summary;
          const previous =
            previousBySourceId.get(summary.listing.sourceListingId) || null;
          let listing = recordFieldProvenance(
            {
              ...summary.listing,
              specs: { ...summary.listing.specs, summaryCheckedAt: summaryAt },
            },
            previous,
            { method: "source", sourceUrl: url, observedAt: summaryAt },
          );
          let seenAt = summaryAt,
            detailHash: string | undefined;
          const selectedDetail =
            policy !== "summary-only" &&
            eligible(listing, url) &&
            work.selected.has(listing.sourceUrl) &&
            !detailed.has(listing.sourceUrl);
          if (selectedDetail) {
            detailed.add(listing.sourceUrl);
            metrics.detailPagesAttempted++;
            const attempted = new Date();
            let success = false;
            try {
              if (new URL(listing.sourceUrl).origin !== new URL(url).origin)
                throw new Error("Detail URL must stay on the inventory origin");
              const html = await politeFetch(listing.sourceUrl, fetchOptions);
              await lease.checkpoint();
              const detail = adapters[config.adapter]
                .parse(html, listing.sourceUrl, config)
                .find((l) => l.sourceUrl === listing.sourceUrl);
              if (!detail) throw new Error("No matching detail record parsed");
              const at = await observedAt(listing.sourceUrl);
              recordObservation(metrics, at);
              seenAt = at > seenAt ? at : seenAt;
              detailHash = (await archiveEvidence(listing.sourceUrl, html, at))
                .sha256;
              listing = mergeDetailObservation(
                listing,
                recordFieldProvenance(detail, listing, {
                  method: "detail",
                  sourceUrl: listing.sourceUrl,
                  observedAt: at,
                }),
                summaryAt,
                at,
              );
              metrics.detailPagesSucceeded++;
              success = true;
            } catch (error) {
              if (isCollectionAbort(error, lease.signal)) throw error;
              metrics.detailPagesFailed++;
              const message =
                error instanceof Error ? error.message : String(error);
              errors.push(`${listing.sourceUrl}: ${message}`);
              listing = preserveEnrichedDetail(
                listing,
                previous,
                "failed; previous detail fields retained when available",
                attempted.toISOString(),
              );
              listing.specs.detailEnrichmentError = message;
            }
            recordDetailAttempt(state, listing.sourceUrl, success, attempted);
            await lease.checkpoint();
            await saveEnrichmentState(state);
          } else {
            listing = preserveEnrichedDetail(
              listing,
              previous,
              policy === "summary-only"
                ? "summary-only policy; no detail refresh requested"
                : eligible(listing, url)
                  ? "deferred by detail budget or retry backoff"
                  : "not selected for detail enrichment",
            );
          }
          listing = recordFieldProvenance(listing, previous);
          listing = locateListing(
            { ...listing, firstSeenAt: seenAt, lastSeenAt: seenAt },
            locations,
          );
          listing.rawPayload = {
            url,
            cachedPage: cacheFile(url),
            summaryEvidenceHash: summary.evidenceHash,
            ...(detailHash
              ? {
                  detailPage: cacheFile(listing.sourceUrl),
                  detailEvidenceHash: detailHash,
                }
              : {}),
            normalized: listing.rawPayload,
          };
          staged.push({ listing, previous });
        }
        const quality = inspectSourceQuality(
          staged.map((s) => s.listing),
          [...previousBySourceId.values()],
          config.quality,
        );
        const qualityPath = join(
          reportDirectory(),
          `${report.runId}-${config.id}-quality.json`,
        );
        await atomicJson(qualityPath, {
          ...quality,
          sourceId: config.id,
          runId: report.runId,
          generatedAt: new Date().toISOString(),
        });
        metrics.quality = {
          status: quality.status,
          issues: quality.issues,
          reportPath: qualityPath,
        };
        if (quality.status === "failed")
          errors.push(
            ...quality.issues.map((issue) => `Quality gate: ${issue}`),
          );
        else
          for (const { listing, previous } of staged) {
            await lease.checkpoint();
            const result = await upsertListing(listing, {
              dedupe: true,
              collectorLease: { owner },
            });
            if (result.isNew) stats.new++;
            else if (result.updated) {
              stats.updated++;
              if (
                !previous ||
                listingContentFingerprint(previous) !==
                  listingContentFingerprint(listing)
              )
                metrics.contentChanged++;
              else metrics.metadataOnlyUpdated++;
              if (
                previous?.price != null &&
                listing.price != null &&
                previous.price !== listing.price
              ) {
                metrics.priceChanges++;
                if (listing.price < previous.price) metrics.priceDrops++;
              }
            }
            if (listing.status === "removed") stats.removed++;
          }
      } catch (error) {
        if (isCollectionAbort(error, lease.signal)) throw error;
        errors.push(error instanceof Error ? error.message : String(error));
      }
      if (metrics.inventoryPageLimitReached)
        errors.push(
          "Inventory page limit reached; source coverage is incomplete.",
        );
      if (metrics.detailPagesSkippedLimit)
        errors.push(
          `Detail page limit reached or retry deferred; ${metrics.detailPagesSkippedLimit} eligible ads were not enriched.`,
        );
      await lease.checkpoint();
      const result = await db.ingestRun.update({
        where: { id: run.id },
        data: {
          ...stats,
          errors,
          status: errors.length ? "error" : "success",
          completedAt: new Date(),
        },
      });
      currentRun = null;
      logger.info(
        { source: config.name, ...stats, errors, metrics },
        "Ingestion completed",
      );
      report.runs.push(result);
    }
    await lease.checkpoint();
    await db.$transaction(async (tx) => {
      const held = await tx.jobLock.findFirst({
        where: { key: "collector", owner, expiresAt: { gt: new Date() } },
      });
      if (!held)
        throw Object.assign(
          new Error("Collector lease lost before stale status update"),
          { code: "COLLECTOR_LEASE_LOST" },
        );
      await tx.listing.updateMany({
        where: {
          isSample: false,
          status: "active",
          lastSeenAt: { lt: new Date(Date.now() - 14 * 86400000) },
        },
        data: { status: "stale" },
      });
    });
    report.status = report.runs.every((run) => run.status === "success")
      ? "success"
      : report.metrics.some((m) => m.inventoryPagesSucceeded > 0)
        ? "partial"
        : "failed";
  } catch (error) {
    report.status = control.signal.aborted ? "cancelled" : "failed";
    report.errors.push(error instanceof Error ? error.message : String(error));
    if (currentRun && !isCollectionAbort(error, lease.signal)) {
      report.runs.push(
        await db.ingestRun.update({
          where: { id: currentRun },
          data: {
            status: "error",
            completedAt: new Date(),
            errors: report.errors,
          },
        }),
      );
    }
  } finally {
    control.stop();
    await lease.stop();
    await releaseLock("collector", owner);
  }
  return finish();
}
