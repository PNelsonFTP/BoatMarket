import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

export type CollectionStatus =
  "success" | "partial" | "failed" | "busy" | "cancelled";
export type SourceMetrics = {
  sourceId: string;
  source: string;
  inventoryPagesConfigured: number;
  inventoryPagesDiscovered: number;
  inventoryPagesAttempted: number;
  inventoryPagesSucceeded: number;
  inventoryPageLimitReached: boolean;
  detailPagesEligible: number;
  detailPagesAttempted: number;
  detailPagesSucceeded: number;
  detailPagesFailed: number;
  detailPagesSkippedLimit: number;
  detailPolicy?: "complete" | "rotating" | "summary-only";
  detailPagesDeferred?: number;
  detailPagesBackoff?: number;
  quality?: {
    status: "passed" | "failed";
    issues: string[];
    reportPath: string;
  };
  duplicateAdsSkipped: number;
  contentChanged: number;
  metadataOnlyUpdated: number;
  priceChanges: number;
  priceDrops: number;
  cacheHits: number;
  fetchedPages: number;
  cacheMaxAgeHours: number;
  oldestObservationAt: string | null;
  newestObservationAt: string | null;
};
export type CollectionReport = {
  version: 1;
  runId: string;
  status: CollectionStatus;
  busy: boolean;
  startedAt: string;
  completedAt: string;
  runs: {
    id: string;
    source: string;
    status: string;
    found: number;
    new: number;
    updated: number;
    removed: number;
    errors: unknown;
  }[];
  metrics: SourceMetrics[];
  reconciledRuns: number;
  errors: string[];
  reportPath: string;
};
export const reportDirectory = () =>
  process.env.REFRESH_REPORT_DIR || "data/refresh-runs";

export async function atomicJson(target: string, data: unknown) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(temporary, target);
}

export async function persistCollectionReport(report: CollectionReport) {
  report.reportPath = join(reportDirectory(), `${report.runId}.json`);
  await atomicJson(report.reportPath, report);
  await atomicJson(join(reportDirectory(), "latest-collection.json"), report);
  return report;
}

export async function readLatestCollectionReport(): Promise<CollectionReport | null> {
  try {
    return JSON.parse(
      await readFile(join(reportDirectory(), "latest-collection.json"), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function collectionExitCode(status: CollectionStatus, skipBusy = false) {
  return status === "success" || (status === "busy" && skipBusy)
    ? 0
    : status === "partial"
      ? 2
      : status === "busy"
        ? 3
        : status === "cancelled"
          ? 130
          : 1;
}
