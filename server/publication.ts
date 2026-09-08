import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { atomicJson } from "./refresh-report";
import { acquireLock, releaseLock } from "./repository";
import { startCollectorLease } from "./lease";
import { assertDiskSpace } from "./disk-space";

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
export async function readSnapshotActivation(
  runId?: string,
  publicDirectory = "public",
) {
  const modePath = join(resolve(publicDirectory), "data-mode.json");
  let mode: { path?: string; sha256?: string; activationId?: string };
  try {
    mode = JSON.parse(await readFile(modePath, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  if (
    !mode.activationId ||
    !/^[a-f0-9-]{36}$/.test(mode.activationId) ||
    !/^snapshots\/[a-f0-9]{64}\.json$/.test(mode.path || "") ||
    !/^([a-f0-9]{64})$/.test(mode.sha256 || "")
  )
    return null;
  const record = JSON.parse(
    await readFile(
      join(publicationDirectory(), `${mode.activationId}.json`),
      "utf8",
    ),
  ) as SnapshotActivation;
  if (runId && record.runId !== runId) return null;
  if (
    record.id !== mode.activationId ||
    record.version !== 1 ||
    record.sha256 !== mode.sha256 ||
    record.path !== mode.path ||
    snapshotHash(await readFile(join(publicDirectory, mode.path!))) !==
      mode.sha256
  )
    throw new Error(
      "Snapshot activation evidence does not match its generation",
    );
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
