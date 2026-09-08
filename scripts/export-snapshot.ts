import "dotenv/config";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { allListings } from "../server/repository";
import { db } from "../server/db";
import { listingSchema } from "../lib/types";
import type { CollectionStatus } from "../server/refresh-report";

const publicListingSchema = listingSchema.omit({ rawPayload: true });
export type SnapshotProvenance = {
  runId: string;
  status: CollectionStatus;
  collectionStartedAt: string;
  collectionCompletedAt: string;
  partial: boolean;
};

export function prepareSnapshot(
  input: unknown[],
  options: {
    allowEmpty?: boolean;
    provenance?: SnapshotProvenance;
    generatedAt?: string;
  } = {},
) {
  // Whitelist canonical listing fields; private workspace records and raw captures cannot survive.
  const listings = input
    .map((value) => publicListingSchema.parse(value))
    .filter((listing) => !listing.isSample);
  if (!listings.length && !options.allowEmpty)
    throw new Error(
      "Refusing to replace the website with an empty real-data snapshot (use --allow-empty only intentionally)",
    );
  if (new Set(listings.map((listing) => listing.id)).size !== listings.length)
    throw new Error("Snapshot validation failed: duplicate listing IDs");
  for (const listing of listings) {
    for (const value of [
      listing.sourceUrl,
      ...listing.photos.filter((url) => /^https?:/.test(url)),
    ]) {
      const url = new URL(value);
      if (url.username || url.password)
        throw new Error(
          "Snapshot validation failed: listing URL contains credentials",
        );
    }
    listing.specs = Object.fromEntries(
      Object.entries(listing.specs).filter(
        ([key]) =>
          !/^(?:rawPayload|notes?|favorites?|savedSearches|password|token|api[-_]?key|authorization|credentials?|webhookUrl)$/i.test(
            key,
          ),
      ),
    );
  }
  const observations = listings
    .flatMap((listing) => [
      listing.specs.summaryCheckedAt,
      listing.specs.detailsCheckedAt,
    ])
    .filter(
      (value): value is string =>
        typeof value === "string" && Number.isFinite(Date.parse(value)),
    )
    .sort();
  return {
    version: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    observationRange: {
      oldest: observations.at(0) ?? null,
      newest: observations.at(-1) ?? null,
    },
    ...(options.provenance ? { refresh: options.provenance } : {}),
    listings,
  };
}

export async function exportSnapshot(
  options: {
    target?: string;
    allowEmpty?: boolean;
    provenance?: SnapshotProvenance;
    loadListings?: () => Promise<unknown[]>;
    backupDirectory?: string;
    updateMode?: boolean;
    beforeCommit?: () => Promise<void>;
    signal?: AbortSignal;
  } = {},
) {
  const target = resolve(options.target ?? "public/snapshot.json");
  const snapshot = prepareSnapshot(
    await (options.loadListings ?? (() => allListings(false)))(),
    options,
  );
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  let backup: string | null = null;
  try {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n");
    const written = JSON.parse(await readFile(temporary, "utf8"));
    prepareSnapshot(written.listings, { allowEmpty: options.allowEmpty });
    if (options.backupDirectory) {
      await mkdir(options.backupDirectory, { recursive: true });
      const backupTarget = resolve(
        options.backupDirectory,
        `snapshot-${Date.now()}-${randomUUID()}.json`,
      );
      try {
        await copyFile(target, backupTarget);
        backup = backupTarget;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    options.signal?.throwIfAborted();
    await options.beforeCommit?.();
    if (
      options.updateMode !== false &&
      target === resolve("public/snapshot.json")
    ) {
      const mode = resolve("public/data-mode.json");
      const modeTemporary = `${mode}.${randomUUID()}.tmp`;
      await writeFile(modeTemporary, JSON.stringify({ snapshot: true }) + "\n");
      await rename(modeTemporary, mode);
    }
    options.signal?.throwIfAborted();
    await rename(temporary, target);
    return {
      target,
      listings: snapshot.listings.length,
      generatedAt: snapshot.generatedAt,
      observationRange: snapshot.observationRange,
      backup,
    };
  } finally {
    await rm(temporary, { force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg.startsWith("--") && arg !== "--allow-empty"))
      throw new Error(
        "Usage: npm run export:snapshot -- [target] [--allow-empty]",
      );
    const result = await exportSnapshot({
      target: args.find((arg) => !arg.startsWith("--")),
      allowEmpty: args.includes("--allow-empty"),
      backupDirectory: "data/backups/snapshots",
    });
    console.log(
      JSON.stringify(
        {
          ...result,
          message:
            "Snapshot validated and atomically replaced. Workspace and raw captures excluded; review public listing content before publishing.",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
