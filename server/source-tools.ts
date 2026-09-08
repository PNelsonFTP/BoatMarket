import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adapters } from "./adapters";
import { readSources, politeFetch } from "./collector";
import { listingSchema, type Listing } from "../lib/types";
import { inspectSourceQuality } from "../lib/source-quality";
import { recordFieldProvenance } from "../lib/provenance";
import { restoreSourceLocation } from "../lib/boat-location";
import { db } from "./db";
import {
  acquireLock,
  releaseLock,
  upsertListing,
  sourceRecordFingerprint,
} from "./repository";
import { startCollectorLease } from "./lease";
import { archiveEvidence, contentHash, writeRedactedFixture } from "./evidence";
import { atomicJson } from "./refresh-report";
import { backupBeforeRefresh } from "./refresh";
const directory = () => process.env.SOURCE_REVIEW_DIR || "data/source-reviews";
const reviewSchema = z.object({
  sourceId: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(80),
  url: z
    .string()
    .url()
    .refine((s) => /^https?:\/\//.test(s)),
  html: z
    .string()
    .min(1)
    .max(10 * 1024 * 1024),
  observedAt: z.string().datetime(),
});
export async function parserHash(options: { read?: typeof readFile } = {}) {
  const adapterFiles = (await readdir("server/adapters"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join("server/adapters", name));
  const libraryFiles = (await readdir("lib"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join("lib", name));
  const files = [
    ...adapterFiles,
    ...libraryFiles,
    "server/source-tools.ts",
    "server/repository.ts",
    "package-lock.json",
  ].sort();
  const chunks = await Promise.all(
    files.map(async (name) => [
      name.replaceAll("\\", "/"),
      contentHash(await (options.read ?? readFile)(name)),
    ]),
  );
  return contentHash(JSON.stringify(chunks));
}
async function configured(id: string, url: string) {
  const source = (await readSources()).find((s) => s.id === id);
  if (!source) throw new Error("Unknown source");
  if (!source.urls.some((u) => new URL(u).origin === new URL(url).origin))
    throw new Error("Capture URL must use a configured source origin");
  return source;
}
export async function captureSourceFixture(options: {
  sourceId: string;
  url: string;
  target: string;
  inputFile?: string;
}) {
  const source = await configured(options.sourceId, options.url);
  if (!options.inputFile && !source.enabled)
    throw new Error(
      "Remote fixture capture requires an enabled source; supply an existing permitted --input file for a disabled source",
    );
  const owner = options.inputFile
    ? null
    : await acquireLock("collector", 600000);
  if (!options.inputFile && !owner)
    throw new Error("Collector busy; capture after the active job finishes");
  const lease = owner ? startCollectorLease(owner, { ttlMs: 600000 }) : null;
  try {
    await lease?.checkpoint();
    const inputPath =
      options.inputFile ||
      join(
        process.env.COLLECTION_CACHE_DIR || "data/cache",
        contentHash(options.url) + ".html",
      );
    const body = options.inputFile
      ? await readFile(options.inputFile, "utf8")
      : await politeFetch(options.url, {
          signal: lease?.signal,
          cacheMaxAgeHours: source.cacheMaxAgeHours,
        });
    const observedAt = (await stat(inputPath)).mtime.toISOString();
    if (contentHash(await readFile(inputPath)) !== contentHash(body))
      throw new Error(
        "Capture evidence changed during observation; retry capture",
      );
    await lease?.checkpoint();
    const archived = await archiveEvidence(options.url, body, observedAt);
    return writeRedactedFixture(body, options.target, {
      sourceId: options.sourceId,
      url: options.url,
      observedAt,
      evidenceHash: archived.sha256,
      method: options.inputFile ? "local-capture" : "permitted-HTTP-cache",
    });
  } finally {
    await lease?.stop();
    if (owner) await releaseLock("collector", owner);
  }
}
export async function previewSourceParse(input: unknown) {
  const request = reviewSchema.parse(input);
  if (Date.parse(request.observedAt) > Date.now() + 60000)
    throw new Error("Observation time cannot be in the future");
  const source = await configured(request.sourceId, request.url);
  const raw = adapters[source.adapter].parse(request.html, request.url, source);
  if (raw.length > 1000)
    throw new Error(
      "A reviewed reparse is limited to 1,000 records; capture smaller source pages",
    );
  const rows = await db.listing.findMany({
      where: { source: source.name, isSample: false },
    }),
    previous = rows.map((row) =>
      restoreSourceLocation(
        listingSchema.parse({
          ...(row.data as object),
          status: row.status,
          lastSeenAt: row.lastSeenAt.toISOString(),
        }),
      ),
    );
  const bySource = new Map(rows.map((row) => [row.sourceListingId, row]));
  const listings = raw.map((input) =>
    recordFieldProvenance(
      {
        ...input,
        firstSeenAt: request.observedAt,
        lastSeenAt: request.observedAt,
        specs: { ...input.specs, summaryCheckedAt: request.observedAt },
      },
      null,
      {
        method: "source",
        sourceUrl: request.url,
        observedAt: request.observedAt,
      },
    ),
  );
  const quality = inspectSourceQuality(listings, previous, source.quality);
  if (!listings.length) {
    quality.issues.push("Empty parser results cannot be applied");
    quality.status = "failed";
  }
  const stale = listings.filter((l) => {
    const old = bySource.get(l.sourceListingId);
    return old && +old.lastSeenAt > Date.parse(request.observedAt);
  });
  if (stale.length) {
    quality.issues.push(
      `${stale.length} records have newer observations in the database; historical captures are preview-only`,
    );
    quality.status = "failed";
  }
  const evidence = await archiveEvidence(
    request.url,
    request.html,
    request.observedAt,
  );
  const payload = {
    version: 1 as const,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
    sourceId: source.id,
    url: request.url,
    observedAt: request.observedAt,
    parserHash: await parserHash(),
    configHash: contentHash(JSON.stringify(source)),
    evidenceHash: evidence.sha256,
    quality,
    listings,
    baseline: Object.fromEntries(
      listings.map((l) => [
        l.sourceListingId,
        sourceRecordFingerprint(bySource.get(l.sourceListingId) || null),
      ]),
    ),
  };
  const reviewHash = contentHash(JSON.stringify(payload));
  await atomicJson(join(directory(), `${reviewHash}.json`), payload);
  return {
    reviewHash,
    ...payload,
    listings: undefined,
    preview: listings.map(({ rawPayload, ...l }) => l),
    applyAllowed: quality.status === "passed",
    message:
      "Review field differences and source evidence. Applying requires this exact review hash; no ads are removed because they are absent from a capture.",
  };
}
export async function applySourceParse(reviewHash: string) {
  if (!/^[a-f0-9]{64}$/.test(reviewHash))
    throw new Error("Invalid review hash");
  const payload = JSON.parse(
    await readFile(join(directory(), `${reviewHash}.json`), "utf8"),
  ) as {
    version: 1;
    sourceId: string;
    url: string;
    observedAt: string;
    expiresAt: string;
    parserHash: string;
    configHash: string;
    evidenceHash: string;
    quality: { status: string };
    listings: Listing[];
    baseline: Record<string, string | null>;
  };
  if (contentHash(JSON.stringify(payload)) !== reviewHash)
    throw new Error("Review contents changed; preview again");
  if (Date.parse(payload.expiresAt) < Date.now())
    throw new Error("Review expired; preview again");
  if (payload.quality.status !== "passed")
    throw new Error("Quality gate failed; review cannot be applied");
  const config = await configured(payload.sourceId, payload.url);
  if (
    contentHash(JSON.stringify(config)) !== payload.configHash ||
    (await parserHash()) !== payload.parserHash
  )
    throw new Error("Parser or configuration changed; preview again");
  const owner = await acquireLock("collector", 3600000);
  if (!owner)
    throw Object.assign(new Error("Collector busy; retry after it finishes"), {
      statusCode: 409,
    });
  const lease = startCollectorLease(owner);
  const applied: string[] = [];
  let backup: unknown;
  try {
    for (const l of payload.listings) {
      const current = await db.listing.findUnique({
        where: {
          source_sourceListingId: {
            source: l.source,
            sourceListingId: l.sourceListingId,
          },
        },
      });
      if (
        sourceRecordFingerprint(current) !== payload.baseline[l.sourceListingId]
      )
        throw Object.assign(
          new Error("Source records changed; preview again before applying"),
          { statusCode: 409 },
        );
    }
    backup = await backupBeforeRefresh(
      join(
        process.env.REFRESH_BACKUP_DIR || "data/backups/refresh",
        `reparse-${reviewHash}-${Date.now()}`,
      ),
      "public/snapshot.json",
    );
    await atomicJson(join(directory(), `${reviewHash}-apply.json`), {
      reviewHash,
      status: "running",
      startedAt: new Date().toISOString(),
      backup,
      applied,
    });
    for (const input of payload.listings) {
      await lease.checkpoint();
      const l = listingSchema.parse(input);
      const result = await upsertListing(
        {
          ...l,
          rawPayload: {
            url: payload.url,
            summaryEvidenceHash: payload.evidenceHash,
            reparseReviewHash: reviewHash,
            normalized: l.rawPayload,
          },
        },
        {
          dedupe: true,
          collectorLease: { owner },
          expectedFingerprint: payload.baseline[l.sourceListingId],
        },
      );
      applied.push(result.id);
      await atomicJson(join(directory(), `${reviewHash}-apply.json`), {
        reviewHash,
        status: "running",
        backup,
        applied,
      });
    }
    const result = {
      reviewHash,
      status: "success",
      completedAt: new Date().toISOString(),
      backup,
      applied,
    };
    await atomicJson(join(directory(), `${reviewHash}-apply.json`), result);
    return result;
  } catch (error) {
    await atomicJson(join(directory(), `${reviewHash}-apply.json`), {
      reviewHash,
      status: applied.length ? "partial" : "failed",
      backup,
      applied,
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    await lease.stop();
    await releaseLock("collector", owner);
  }
}
export function registerSourceToolsRoutes(app: FastifyInstance) {
  app.post("/api/admin/source-tools/preview", async (req) =>
    previewSourceParse(req.body),
  );
  app.post("/api/admin/source-tools/apply", async (req) =>
    applySourceParse(
      z
        .object({ reviewHash: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(req.body).reviewHash,
    ),
  );
}
