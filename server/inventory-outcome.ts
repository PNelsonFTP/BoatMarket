import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { SourceConfig } from "./adapters/types";
import { atomicJson, reportDirectory } from "./refresh-report";
import { db } from "./db";

export const failureReasonSchema = z.enum([
  "access-denied",
  "robots-policy",
  "rate-limited",
  "challenge",
  "transient-network",
  "parse",
  "quality",
  "inventory-cap",
  "detail-budget",
  "retry-backoff",
  "cancelled",
  "other",
]);
export type FailureReason = z.infer<typeof failureReasonSchema>;
export type SourceFailure = {
  phase: "inventory" | "detail" | "quality" | "write";
  reason: FailureReason;
  message: string;
  url?: string;
};
export function failureReason(error: unknown): FailureReason {
  const message = error instanceof Error ? error.message : String(error);
  if (/robots|crawl delay/i.test(message)) return "robots-policy";
  if (/HTTP\s+(?:401|403)\b|access denied|forbidden/i.test(message))
    return "access-denied";
  if (/HTTP\s+429\b|too many requests|rate.?limit/i.test(message))
    return "rate-limited";
  if (/captcha|challenge|verify you are human/i.test(message))
    return "challenge";
  if (
    /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|timed? ?out|timeout|fetch failed|socket hang up|HTTP\s+5\d\d\b/i.test(
      message,
    )
  )
    return "transient-network";
  if (/pars|markup|selector|empty (?:body|response)/i.test(message))
    return "parse";
  if (/cancel|abort/i.test(message)) return "cancelled";
  return "other";
}
export const automaticRetryReasons = new Set<FailureReason>([
  "transient-network",
  "detail-budget",
]);
/** Collection ownership does not prevent private imports between passes. Fence
 * observed source rows as well as run identity before assigning session provenance.
 * Derived group/vessel assignments may legitimately change as other sources join.
 */
export async function sourceWriteFingerprint(source: string) {
  const rows = await db.listing.findMany({
    where: { source, isSample: false },
    orderBy: { id: "asc" },
  });
  const stable = (value: unknown): unknown =>
    value instanceof Date
      ? value.toISOString()
      : Array.isArray(value)
        ? value.map(stable)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, stable(item)]),
            )
          : value;
  const content = rows
    .map((row) => {
      const { groupId, vesselId, ...observation } = row;
      const {
        groupId: dataGroup,
        vesselId: dataVessel,
        grouping,
        ...data
      } = (row.data ?? {}) as Record<string, unknown>;
      return { ...observation, data };
    })
    .sort((a, b) =>
      String(a.id ?? a.sourceListingId).localeCompare(
        String(b.id ?? b.sourceListingId),
      ),
    );
  return createHash("sha256")
    .update(JSON.stringify(stable(content)))
    .digest("hex");
}

/** Detail budgets and cache age do not change which inventory is being compared. */
export function inventoryConfigHash(source: SourceConfig) {
  const identity = {
    id: source.id,
    name: source.name,
    area: source.area,
    adapter: source.adapter,
    urls: [...new Set(source.urls)].sort(),
    render: source.render,
    autoPaginate: source.autoPaginate,
    maxInventoryPages: source.maxInventoryPages,
    selectors: source.selectors ?? null,
    quality: source.quality ?? null,
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}
const baselineSchema = z.object({
  version: z.literal(1),
  sourceId: z.string(),
  source: z.string(),
  configHash: z.string().regex(/^[a-f0-9]{64}$/),
  runId: z.string(),
  ingestRunId: z.string(),
  count: z.number().int().nonnegative(),
  capturedAt: z.string().datetime(),
  acceptedAt: z.string().datetime(),
  oldestObservationAt: z.string().datetime().nullable(),
  newestObservationAt: z.string().datetime().nullable(),
  verifiedEmpty: z.boolean(),
  qualityReportPath: z.string(),
  collectionReportPath: z.string(),
  quality: z.literal("passed"),
});
export type InventoryBaseline = z.infer<typeof baselineSchema>;
export type InventoryOutcome = {
  status: "accepted" | "verified-empty" | "rejected" | "incomplete";
  accepted: boolean;
  count: number;
  configHash: string;
  capturedAt: string | null;
  reasons: FailureReason[];
  baseline: {
    kind: "accepted-inventory" | "successful-ingestion" | "retained-ads";
    count: number;
    runId?: string;
    capturedAt?: string;
    configHash?: string;
  };
  observationPath?: string;
};
export function inventoryBaselinePath(source: SourceConfig) {
  if (!/^[a-z0-9-]{1,80}$/.test(source.id))
    throw new Error("Invalid source ID");
  return join(
    reportDirectory(),
    "inventory-baselines",
    `${source.id}-${inventoryConfigHash(source)}.json`,
  );
}
export async function readInventoryBaseline(
  source: SourceConfig,
): Promise<InventoryBaseline | null> {
  try {
    const baseline = baselineSchema.parse(
      JSON.parse(await readFile(inventoryBaselinePath(source), "utf8")),
    );
    if (
      baseline.sourceId !== source.id ||
      baseline.configHash !== inventoryConfigHash(source)
    )
      throw new Error(
        "Inventory baseline identity does not match source configuration",
      );
    return baseline;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function acceptInventoryBaseline(
  source: SourceConfig,
  input: Omit<
    InventoryBaseline,
    "version" | "sourceId" | "source" | "configHash" | "quality"
  >,
) {
  const baseline = baselineSchema.parse({
    ...input,
    version: 1,
    sourceId: source.id,
    source: source.name,
    configHash: inventoryConfigHash(source),
    quality: "passed",
  });
  await atomicJson(inventoryBaselinePath(source), baseline);
  return baseline;
}
