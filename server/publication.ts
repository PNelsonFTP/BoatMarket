import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { atomicJson } from "./refresh-report";
import { acquireLock, releaseLock } from "./repository";
import { startCollectorLease } from "./lease";
import { assertDiskSpace } from "./disk-space";
import { z } from "zod";

export type PublicationLease = ReturnType<typeof startCollectorLease> & {
  owner: string;
};
export async function withPublicationLease<T>(
  action: (lease: PublicationLease) => Promise<T>,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const owner = await acquireLock("publication", 600000);
  if (!owner)
    throw Object.assign(
      new Error(
        "Snapshot publication busy; another writer owns the publication lease",
      ),
      { statusCode: 409 },
    );
  const lease = {
    ...startCollectorLease(owner, {
      key: "publication",
      ttlMs: 600000,
      signal: options.signal,
    }),
    owner,
  };
  try {
    await lease.checkpoint();
    return await action(lease);
  } finally {
    await lease.stop();
    await releaseLock("publication", owner);
  }
}
export const publicationDirectory = () =>
  process.env.PUBLICATION_DIR || "data/publication";
export const snapshotHash = (body: string | Buffer) =>
  createHash("sha256").update(body).digest("hex");
export type SnapshotActivation = {
  version: 1;
  id: string;
  runId: string | null;
  state: "prepared" | "committed";
  createdAt: string;
  committedAt: string | null;
  sha256: string;
  path: string;
  previous: { snapshot?: boolean; path?: string; sha256?: string } | null;
  listings: number;
};
const activationSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  runId: z.string().nullable(),
  state: z.enum(["prepared", "committed"]),
  createdAt: z.string().datetime(),
  committedAt: z.string().datetime().nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  path: z.string().regex(/^snapshots\/[a-f0-9]{64}\.json$/),
  previous: z
    .object({
      snapshot: z.boolean().optional(),
      path: z.string().optional(),
      sha256: z.string().optional(),
    })
    .nullable(),
  listings: z.number().int().nonnegative(),
});
/** A single atomic pointer switches readers only after an immutable, verified generation exists. */
export async function activateSnapshot(
  body: string,
  options: {
    publicDirectory?: string;
    runId?: string;
    listings: number;
    beforeCommit?: () => Promise<void>;
    signal?: AbortSignal;
    publicationLease?: PublicationLease;
  },
): Promise<SnapshotActivation & { auditError?: string }> {
  if (!options.publicationLease)
    return withPublicationLease(
      (publicationLease) =>
        activateSnapshot(body, {
          ...options,
          publicationLease,
          signal: publicationLease.signal,
        }),
      { signal: options.signal },
    );
  const lease = options.publicationLease;
  await lease.checkpoint();
  const publicDirectory = resolve(options.publicDirectory || "public");
  const sha256 = snapshotHash(body),
    path = `snapshots/${sha256}.json`,
    destination = join(publicDirectory, path),
    modePath = join(publicDirectory, "data-mode.json");
  await assertDiskSpace(destination, {
    requiredBytes: Buffer.byteLength(body),
  });
  await mkdir(join(publicDirectory, "snapshots"), { recursive: true });
  try {
    await writeFile(destination, body, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  if (snapshotHash(await readFile(destination)) !== sha256)
    throw new Error("Immutable snapshot hash mismatch; activation refused");
  let previous: SnapshotActivation["previous"] = null;
  try {
    previous = JSON.parse(await readFile(modePath, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const record: SnapshotActivation = {
    version: 1,
    id: randomUUID(),
    runId: options.runId || null,
    state: "prepared",
    createdAt: new Date().toISOString(),
    committedAt: null,
    sha256,
    path,
    previous,
    listings: options.listings,
  };
  const marker = join(publicationDirectory(), `${record.id}.json`);
  await atomicJson(marker, record);
  options.signal?.throwIfAborted();
  await options.beforeCommit?.();
  await lease.checkpoint();
  options.signal?.throwIfAborted();
  await atomicJson(modePath, {
    snapshot: true,
    path,
    sha256,
    activationId: record.id,
  });
  // Readers already have a coherent generation if a crash occurs before this audit marker is updated.
  record.state = "committed";
  record.committedAt = new Date().toISOString();
  try {
    await lease.checkpoint();
    await atomicJson(marker, record);
    await atomicJson(join(publicationDirectory(), "latest.json"), record);
    return record;
  } catch (error) {
    // The pointer already committed. Preserve a truthful outcome even if the audit flush/lease fails now.
    return {
      ...record,
      auditError: error instanceof Error ? error.message : String(error),
    };
  }
}
/** A checkout can contain a valid public generation without any private local activation journal. */
export async function readPublicSnapshotGeneration(publicDirectory = "public") {
  const modePath = join(resolve(publicDirectory), "data-mode.json");
  let mode: {
    snapshot?: boolean;
    path?: string;
    sha256?: string;
    activationId?: string;
  };
  try {
    mode = JSON.parse(await readFile(modePath, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  if (mode.snapshot === false) return null;
  // Legacy snapshot.json mode has no immutable pointer to validate.
  if (mode.path == null && mode.sha256 == null && mode.activationId == null)
    return null;
  if (
    mode.snapshot !== true ||
    !/^snapshots\/[a-f0-9]{64}\.json$/.test(mode.path || "") ||
    !/^[a-f0-9]{64}$/.test(mode.sha256 || "") ||
    mode.path !== `snapshots/${mode.sha256}.json` ||
    (mode.activationId != null &&
      !z.string().uuid().safeParse(mode.activationId).success)
  )
    throw new Error("Invalid public snapshot pointer");
  if (
    snapshotHash(await readFile(join(publicDirectory, mode.path!))) !==
    mode.sha256
  )
    throw new Error("Public snapshot generation hash mismatch");
  return {
    snapshot: true as const,
    path: mode.path!,
    sha256: mode.sha256!,
    activationId: mode.activationId ?? null,
  };
}
export async function readSnapshotActivation(
  runId?: string,
  publicDirectory = "public",
) {
  const mode = await readPublicSnapshotGeneration(publicDirectory);
  if (!mode) return null;
  let record: SnapshotActivation | null = null;
  if (mode.activationId) {
    try {
      record = activationSchema.parse(
        JSON.parse(
          await readFile(
            join(publicationDirectory(), `${mode.activationId}.json`),
            "utf8",
          ),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!record) {
    // Public bytes prove integrity, not a local job's completion or its original commit time.
    if (runId !== undefined) return null;
    return {
      version: 1 as const,
      id: mode.activationId,
      runId: null,
      state: "imported" as const,
      createdAt: null,
      committedAt: null,
      sha256: mode.sha256,
      path: mode.path,
      previous: null,
      listings: null,
      reconciledFromPointer: false,
    };
  }
  if (
    record.id !== mode.activationId ||
    record.version !== 1 ||
    record.sha256 !== mode.sha256 ||
    record.path !== mode.path
  )
    throw new Error(
      "Snapshot activation evidence does not match its generation",
    );
  if (runId !== undefined && record.runId !== runId) return null;
  return {
    ...record,
    state: "committed" as const,
    reconciledFromPointer: record.state !== "committed",
  };
}
export async function rollbackSnapshot(
  activationId: string,
  options: { publicDirectory?: string; expectedCurrentHash: string },
) {
  return withPublicationLease(async (lease) => {
    if (!/^[a-f0-9-]{36}$/.test(activationId))
      throw new Error("Invalid activation ID");
    const publicDirectory = options.publicDirectory || "public",
      current = await readSnapshotActivation(undefined, publicDirectory);
    if (!current || current.sha256 !== options.expectedCurrentHash)
      throw new Error("Active snapshot changed; review rollback again");
    const record = JSON.parse(
      await readFile(
        join(publicationDirectory(), `${activationId}.json`),
        "utf8",
      ),
    ) as SnapshotActivation;
    if (!/^snapshots\/[a-f0-9]{64}\.json$/.test(record.path))
      throw new Error("Invalid snapshot generation path");
    const body = await readFile(join(publicDirectory, record.path), "utf8");
    if (snapshotHash(body) !== record.sha256)
      throw new Error("Rollback generation failed its hash check");
    return activateSnapshot(body, {
      publicDirectory,
      listings: record.listings,
      runId: `rollback-${activationId}`,
      publicationLease: lease,
      signal: lease.signal,
    });
  });
}
