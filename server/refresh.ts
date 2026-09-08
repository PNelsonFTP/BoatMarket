import { chmod, copyFile, mkdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { SourceConfig } from "./adapters/types";
import { collect } from "./collector";
import { db } from "./db";
import { acquireLock, releaseLock } from "./repository";
import { startCollectorLease } from "./lease";
import {
  atomicJson,
  reportDirectory,
  type CollectionReport,
  type CollectionStatus,
} from "./refresh-report";
import { exportSnapshot } from "../scripts/export-snapshot";

export type RefreshOptions = {
  runId?: string;
  sources?: SourceConfig[];
  signal?: AbortSignal;
  cacheMaxAgeHours?: number;
  geocode?: boolean;
  allowPartial?: boolean;
  target?: string;
};
export type RefreshReport = {
  version: 1;
  runId: string;
  status: CollectionStatus | "running";
  startedAt: string;
  completedAt: string | null;
  stage: "backup" | "collection" | "geocode" | "export" | "complete";
  allowPartial: boolean;
  backupDirectory: string | null;
  collection: CollectionReport | null;
  geocode: "not-requested" | "pending" | "success" | "failed";
  snapshot: Awaited<ReturnType<typeof exportSnapshot>> | null;
  errors: string[];
  reportPath: string;
};

export async function readLatestRefreshReport(): Promise<RefreshReport | null> {
  try {
    return JSON.parse(
      await readFile(join(reportDirectory(), "latest-refresh.json"), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function shouldExportCollection(
  status: CollectionStatus,
  allowPartial = false,
) {
  return status === "success" || (status === "partial" && allowPartial);
}

/** SQLite creates a consistent database backup while other connections remain open. */
export async function backupBeforeRefresh(
  directory: string,
  target: string,
  options: { database?: Pick<PrismaClient, "$executeRawUnsafe"> } = {},
) {
  for (const publicDirectory of ["public", "out", ".git"]) {
    const forbidden = resolve(publicDirectory);
    if (
      resolve(directory) === forbidden ||
      resolve(directory).startsWith(forbidden + "/")
    )
      throw new Error(
        "Backups contain private workspace data and must stay outside public/, out/ and .git/",
      );
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const backup = resolve(directory, "boatscout.db");
  // The destination is generated locally, with SQL quoting retained for spaces/apostrophes in cwd.
  await (options.database ?? db).$executeRawUnsafe(
    `VACUUM INTO '${backup.replaceAll("'", "''")}'`,
  );
  await chmod(backup, 0o600);
  const restored = new PrismaClient({
    datasources: { db: { url: `file:${backup}` } },
  });
  try {
    const check =
      await restored.$queryRawUnsafe<{ quick_check: string }[]>(
        "PRAGMA quick_check",
      );
    if (check.length !== 1 || check[0]?.quick_check !== "ok")
      throw new Error("Backup integrity validation failed");
  } finally {
    await restored.$disconnect();
  }
  const files = ["boatscout.db"];
  for (const [source, filename] of [
    [target, "snapshot.json"],
    [process.env.SOURCE_CONFIG || "config/sources.json", "sources.json"],
    [process.env.LOCATION_CONFIG || "config/locations.json", "locations.json"],
    [
      process.env.LOCATION_REVIEW_FILE || "data/location-review.json",
      "location-review.json",
    ],
    ["config/source-access.json", "source-access.json"],
    ["public/data-mode.json", "data-mode.json"],
  ]) {
    try {
      await copyFile(source, join(directory, filename));
      files.push(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    databaseIntegrity: "ok",
    files: await Promise.all(
      files.map(async (name) => ({
        name,
        sha256: createHash("sha256")
          .update(await readFile(join(directory, name)))
          .digest("hex"),
      })),
    ),
    note: "Local backup contains private workspace data. Keep outside public/ and Git. Environment secrets are intentionally excluded.",
  };
  await atomicJson(join(directory, "manifest.json"), manifest);
  return { directory: resolve(directory), database: backup, ...manifest };
}

export async function verifyBackup(directory: string) {
  const manifest = z
    .object({
      version: z.literal(1),
      files: z
        .array(
          z.object({
            name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          }),
        )
        .min(1)
        .max(30),
    })
    .parse(
      JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
    );
  if (!manifest.files.some((file) => file.name === "boatscout.db"))
    throw new Error("Backup manifest is missing boatscout.db");
  for (const file of manifest.files) {
    if (
      createHash("sha256")
        .update(await readFile(join(directory, file.name)))
        .digest("hex") !== file.sha256
    )
      throw new Error(`Backup hash mismatch: ${file.name}`);
  }
  const restored = new PrismaClient({
    datasources: { db: { url: `file:${resolve(directory, "boatscout.db")}` } },
  });
  try {
    const check =
      await restored.$queryRawUnsafe<{ quick_check: string }[]>(
        "PRAGMA quick_check",
      );
    if (check.length !== 1 || check[0]?.quick_check !== "ok")
      throw new Error("Backup integrity validation failed");
    const tableNames = await restored.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const tables: Record<string, number> = {};
    for (const { name } of tableNames) {
      const count = await restored.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`,
      );
      tables[name] = Number(count[0].count);
    }
    return {
      directory: resolve(directory),
      databaseIntegrity: "ok",
      hashesVerified: manifest.files.length,
      tables,
    };
  } finally {
    await restored.$disconnect();
  }
}

function runGeocode(signal?: AbortSignal, owner?: string) {
  return new Promise<void>((resolveJob, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/geocode-collected.ts"],
      {
        stdio: "inherit",
        signal,
        env: { ...process.env, GEOCODE_COLLECTOR_OWNER: owner ?? "" },
      },
    );
    child.once("error", reject);
    child.once("exit", (code, exitSignal) =>
      code === 0
        ? resolveJob()
        : reject(new Error(`Geocoding exited ${code ?? exitSignal}`)),
    );
  });
}

export async function runRefresh(
  options: RefreshOptions = {},
  dependencies: {
    collect?: typeof collect;
    backup?: typeof backupBeforeRefresh;
    geocode?: typeof runGeocode;
    export?: typeof exportSnapshot;
  } = {},
): Promise<RefreshReport> {
  const runId = options.runId ?? randomUUID();
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(runId))
    throw new Error("Invalid refresh run ID");
  const report: RefreshReport = {
    version: 1,
    runId,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    stage: "backup",
    allowPartial: options.allowPartial ?? false,
    backupDirectory: null,
    collection: null,
    geocode: options.geocode ? "pending" : "not-requested",
    snapshot: null,
    errors: [],
    reportPath: join(reportDirectory(), `${runId}-refresh.json`),
  };
  const save = async () => {
    await atomicJson(report.reportPath, report);
    await atomicJson(join(reportDirectory(), "latest-refresh.json"), report);
  };
  const owner = await acquireLock("refresh-pipeline", 3600000);
  if (!owner) {
    report.status = "busy";
    report.completedAt = new Date().toISOString();
    report.errors.push(
      "Another complete refresh is running; snapshot unchanged",
    );
    await save();
    return report;
  }
  const lease = startCollectorLease(owner, {
    key: "refresh-pipeline",
    signal: options.signal,
  });
  let exportOwner: string | null = null;
  let exportLease: ReturnType<typeof startCollectorLease> | null = null;
  try {
    await save();
    await lease.checkpoint();
    report.backupDirectory = join(
      process.env.REFRESH_BACKUP_DIR || "data/backups/refresh",
      runId,
    );
    await (dependencies.backup ?? backupBeforeRefresh)(
      report.backupDirectory,
      options.target ?? "public/snapshot.json",
    );
    await lease.checkpoint();
    report.stage = "collection";
    await save();
    report.collection = await (dependencies.collect ?? collect)(
      options.sources,
      {
        signal: lease.signal,
        cacheMaxAgeHours: options.cacheMaxAgeHours,
        runId,
      },
    );
    report.status = report.collection.status;
    if (
      !shouldExportCollection(report.collection.status, options.allowPartial)
    ) {
      report.errors.push(
        `Collection ${report.collection.status}; existing website snapshot preserved${report.collection.status === "partial" ? ". Inspect source errors before using --allow-partial" : ""}`,
      );
      return report;
    }
    await lease.checkpoint();
    // Reserve collection ownership through optional enrichment and export, preventing a concurrent collector changing this outcome.
    exportOwner = await acquireLock("collector", 3600000);
    if (!exportOwner) {
      report.status = "busy";
      report.errors.push(
        "Another collection started before export; existing website snapshot preserved",
      );
      return report;
    }
    exportLease = startCollectorLease(exportOwner, { signal: lease.signal });
    await exportLease.checkpoint();
    if (options.geocode) {
      report.stage = "geocode";
      await save();
      try {
        await (dependencies.geocode ?? runGeocode)(
          exportLease.signal,
          exportOwner,
        );
        report.geocode = "success";
      } catch (error) {
        report.geocode = "failed";
        throw error;
      }
    }
    await exportLease.checkpoint();
    report.stage = "export";
    await save();
    report.snapshot = await (dependencies.export ?? exportSnapshot)({
      target: options.target,
      signal: exportLease.signal,
      beforeCommit: () => exportLease!.checkpoint(),
      backupDirectory: report.backupDirectory,
      provenance: {
        runId,
        status: report.collection.status,
        partial: report.collection.status === "partial",
        collectionStartedAt: report.collection.startedAt,
        collectionCompletedAt: report.collection.completedAt,
      },
    });
    report.stage = "complete";
    return report;
  } catch (error) {
    report.status = options.signal?.aborted ? "cancelled" : "failed";
    report.errors.push(error instanceof Error ? error.message : String(error));
    return report;
  } finally {
    report.completedAt = new Date().toISOString();
    await exportLease?.stop();
    if (exportOwner) await releaseLock("collector", exportOwner);
    await lease.stop();
    await releaseLock("refresh-pipeline", owner);
    await save();
  }
}
