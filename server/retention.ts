import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { z } from "zod";
import { db } from "./db";
import { acquireLock, releaseLock } from "./repository";
import { startCollectorLease } from "./lease";
import { atomicJson } from "./refresh-report";
export { assertDiskSpace } from "./disk-space";

const day = 86400000;
export const retentionPolicySchema = z
  .object({
    cacheDays: z.number().int().min(1).max(36500).default(30),
    evidenceDays: z.number().int().min(1).max(36500).default(90),
    reportDays: z.number().int().min(1).max(36500).default(90),
    backupDays: z.number().int().min(1).max(36500).default(30),
    rotatedLogDays: z.number().int().min(1).max(36500).default(30),
    minimumVerifiedBackups: z.number().int().min(1).max(100).default(2),
    maximumManagedBytes: z
      .number()
      .int()
      .min(1048576)
      .max(Number.MAX_SAFE_INTEGER)
      .default(10 * 1024 ** 3),
    priceHistoryDays: z
      .number()
      .int()
      .min(30)
      .max(36500)
      .nullable()
      .default(null),
    maximumPlanAgeHours: z.number().int().min(1).max(168).default(24),
  })
  .strict();
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;
const roots = [
  "data/cache",
  "data/evidence",
  "data/refresh-runs",
  "data/backups",
  "logs",
] as const;
const candidateSchema = z
  .object({
    path: z.string(),
    size: z.number().int().nonnegative(),
    mtimeMs: z.number(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string(),
  })
  .strict();
const historySchema = z
  .object({
    id: z.string(),
    listingId: z.string(),
    price: z.number(),
    at: z.string().datetime(),
  })
  .strict();
const planSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    projectRoot: z.string(),
    databasePath: z.string(),
    policy: retentionPolicySchema,
    files: z.array(candidateSchema),
    priceHistory: z.array(historySchema),
    managedBytes: z.number(),
    protectedBytes: z.number(),
    candidateBytes: z.number(),
    verifiedBackupsProtected: z.array(z.string()),
    warnings: z.array(z.string()),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type RetentionPlan = z.infer<typeof planSchema>;
type Candidate = z.infer<typeof candidateSchema>;
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
export function retentionPlanHash(
  value: Omit<RetentionPlan, "sha256"> | RetentionPlan,
) {
  const { sha256: _, ...body } = value as RetentionPlan;
  return hash(JSON.stringify(stable(body)));
}
export async function readRetentionPolicy(
  projectRoot = process.cwd(),
): Promise<RetentionPolicy> {
  try {
    return retentionPolicySchema.parse(
      JSON.parse(
        await readFile(
          process.env.RETENTION_CONFIG ||
            join(projectRoot, "config/retention.json"),
          "utf8",
        ),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return retentionPolicySchema.parse({});
    throw error;
  }
}
/** No symlink is followed, including an ancestor. Only regular files inside fixed managed roots are eligible. */
async function safePath(root: string, path: string, managed = true) {
  if (
    isAbsolute(path) ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(`Unsafe retention path: ${path}`);
  if (managed && !roots.some((allowed) => path.startsWith(allowed + "/")))
    throw new Error(`Path outside retention scope: ${path}`);
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink())
      throw new Error(`Retention refuses symlink: ${path}`);
  }
  return current;
}
async function inspectFile(
  root: string,
  path: string,
): Promise<Omit<Candidate, "reason">> {
  const absolute = await safePath(root, path);
  const handle = await open(
    absolute,
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    const before = await handle.stat();
    if (!before.isFile())
      throw new Error(`Retention accepts regular files only: ${path}`);
    const digest = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false }))
      digest.update(chunk);
    const sha256 = digest.digest("hex");
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error(`File changed during retention inspection: ${path}`);
    return { path, size: after.size, mtimeMs: after.mtimeMs, sha256 };
  } finally {
    await handle.close();
  }
}
async function inventory(root: string) {
  const result: Omit<Candidate, "reason">[] = [];
  const warnings: string[] = [];
  async function walk(path: string) {
    let info;
    try {
      info = await lstat(join(root, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (info.isSymbolicLink()) {
      warnings.push(`Excluded symlink: ${path}`);
      return;
    }
    if (info.isDirectory()) {
      for (const name of (await readdir(join(root, path))).sort())
        await walk(`${path}/${name}`);
    } else if (info.isFile()) result.push(await inspectFile(root, path));
    else warnings.push(`Excluded special file: ${path}`);
  }
  // Validate ancestors before traversal so a symlinked data/ cannot expose unrelated files.
  for (const path of roots) {
    try {
      await safePath(root, path, false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (String(error).includes("symlink")) {
        warnings.push(`Excluded unsafe root: ${path}`);
        continue;
      }
      throw error;
    }
    await walk(path);
  }
  return { files: result, warnings };
}
async function databasePath() {
  const databases = await db.$queryRawUnsafe<{ name: string; file: string }[]>(
    "PRAGMA database_list",
  );
  const path = databases.find((database) => database.name === "main")?.file;
  if (!path) throw new Error("Retention requires a persistent SQLite database");
  return resolve(path);
}
function referencedValues(
  value: unknown,
  root: string,
  hashes: Set<string>,
  paths: Set<string>,
) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\b[a-f0-9]{64}\b/g))
      hashes.add(match[0]);
    if (value.startsWith("data/") || isAbsolute(value)) {
      const path = relative(root, resolve(root, value)).split(sep).join("/");
      if (!path.startsWith("../")) paths.add(path);
    }
  } else if (Array.isArray(value))
    value.forEach((item) => referencedValues(item, root, hashes, paths));
  else if (value && typeof value === "object")
    Object.values(value).forEach((item) =>
      referencedValues(item, root, hashes, paths),
    );
}
async function protectedState(
  root: string,
  files: Omit<Candidate, "reason">[],
  policy: RetentionPolicy,
  now: number,
) {
  const paths = new Set<string>(),
    hashes = new Set<string>(),
    warnings: string[] = [];
  const [listings, decisions, events, locations] = await Promise.all([
    db.listing.findMany({
      select: { data: true, rawPayload: true, confidence: true },
    }),
    db.duplicateDecision.findMany({ select: { evidence: true } }),
    db.vesselEvent.findMany(),
    db.locationOverrideEvent.findMany(),
  ]);
  for (const value of [listings, decisions, events, locations])
    referencedValues(value, root, hashes, paths);
  // Current pointers, in-flight reports, worker identities and their corresponding run artifacts are never candidates.
  const reportRoots = new Set(["data/refresh-runs"]);
  const configuredReportRoot = relative(
    root,
    resolve(process.env.REFRESH_REPORT_DIR || join(root, "data/refresh-runs")),
  )
    .split(sep)
    .join("/");
  if (
    roots.some(
      (allowed) =>
        configuredReportRoot === allowed ||
        configuredReportRoot.startsWith(allowed + "/"),
    )
  )
    reportRoots.add(configuredReportRoot);
  const protectedRunIds = new Set<string>();
  const workerOwner = await db.jobLock.findFirst({
    where: { key: "worker", expiresAt: { gt: new Date() } },
  });
  for (const file of files.filter((file) =>
    [...reportRoots].some((directory) => file.path.startsWith(directory + "/")),
  )) {
    const name = basename(file.path);
    if (!name.endsWith(".json")) continue;
    try {
      const record = JSON.parse(await readFile(join(root, file.path), "utf8"));
      if (
        name.startsWith("latest-") ||
        name === "worker.json" ||
        name === `worker-${workerOwner?.owner}.json` ||
        ["running", "queued"].includes(record.status)
      ) {
        paths.add(file.path);
        for (const id of [record.runId, record.lastRunId])
          if (typeof id === "string") protectedRunIds.add(id);
        referencedValues(record, root, hashes, paths);
      }
    } catch {
      paths.add(file.path);
      warnings.push(`Protected unreadable report: ${file.path}`);
    }
  }
  for (const file of files)
    if (
      [...protectedRunIds].some(
        (id) =>
          basename(file.path) === `${id}.json` ||
          basename(file.path).startsWith(`${id}-`),
      )
    )
      paths.add(file.path);
  // Keep all evidence referenced by current rows or retained audit decisions, and objects backing young observations.
  for (const file of files.filter((file) =>
    file.path.startsWith("data/evidence/observations/"),
  )) {
    try {
      const record = JSON.parse(await readFile(join(root, file.path), "utf8"));
      if (
        hashes.has(record.sha256) ||
        file.mtimeMs > now - policy.evidenceDays * day
      ) {
        paths.add(file.path);
        if (typeof record.sha256 === "string") hashes.add(record.sha256);
      }
    } catch {
      paths.add(file.path);
      warnings.push(`Protected unreadable evidence observation: ${file.path}`);
    }
  }
  for (const file of files)
    if (
      hashes.has(file.sha256) ||
      hashes.has(basename(file.path).split(".")[0])
    )
      paths.add(file.path);
  // Current open logs are retained; the policy only removes explicitly rotated files.
  for (const file of files.filter((file) => file.path.startsWith("logs/")))
    if (!/\.log\.(?:\d+|\d{4}-\d{2}-\d{2})(?:\.gz)?$/.test(file.path))
      paths.add(file.path);
  const backupManifests = files
    .filter(
      (file) =>
        file.path.startsWith("data/backups/") &&
        basename(file.path) === "manifest.json",
    )
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  const verifiedBackups: string[] = [],
    expiredBackups = new Set<string>();
  const { verifyBackup } = await import("./refresh");
  for (const manifest of backupManifests) {
    const directory = dirname(manifest.path).split(sep).join("/");
    try {
      const body = JSON.parse(
        await readFile(join(root, manifest.path), "utf8"),
      );
      if (!Array.isArray(body.files)) throw new Error("Missing manifest files");
      for (const entry of body.files)
        await safePath(root, `${directory}/${entry.name}`);
      await verifyBackup(join(root, directory));
      if (verifiedBackups.length < policy.minimumVerifiedBackups)
        verifiedBackups.push(directory);
      else if (manifest.mtimeMs < now - policy.backupDays * day)
        expiredBackups.add(directory);
    } catch {
      warnings.push(
        `Protected backup that could not be verified: ${directory}`,
      );
    }
  }
  for (const file of files.filter((file) =>
    file.path.startsWith("data/backups/"),
  )) {
    if (
      ![...expiredBackups].some((directory) =>
        file.path.startsWith(directory + "/"),
      )
    )
      paths.add(file.path);
  }
  if (verifiedBackups.length < policy.minimumVerifiedBackups)
    warnings.push(
      `Only ${verifiedBackups.length} verified backups found; policy protects at least ${policy.minimumVerifiedBackups} when available`,
    );
  return { paths, warnings, verifiedBackups, expiredBackups };
}
function ageLimit(path: string, policy: RetentionPolicy) {
  return path.startsWith("data/cache/")
    ? policy.cacheDays
    : path.startsWith("data/evidence/")
      ? policy.evidenceDays
      : path.startsWith("data/backups/")
        ? policy.backupDays
        : path.startsWith("logs/")
          ? policy.rotatedLogDays
          : policy.reportDays;
}
async function oldPriceHistory(policy: RetentionPolicy, now: number) {
  if (policy.priceHistoryDays === null) return [];
  const rows = await db.priceHistory.findMany({
    orderBy: [{ listingId: "asc" }, { at: "asc" }, { id: "asc" }],
  });
  const protectedIds = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    if (
      i === 0 ||
      rows[i - 1].listingId !== rows[i].listingId ||
      i === rows.length - 1 ||
      rows[i + 1].listingId !== rows[i].listingId
    )
      protectedIds.add(rows[i].id);
  }
  return rows
    .filter(
      (row) =>
        !protectedIds.has(row.id) &&
        +row.at < now - policy.priceHistoryDays! * day,
    )
    .map((row) => ({ ...row, at: row.at.toISOString() }));
}
export async function createRetentionPlan(
  options: {
    projectRoot?: string;
    policy?: Partial<RetentionPolicy>;
    now?: number;
  } = {},
): Promise<RetentionPlan> {
  const root = await realpath(options.projectRoot || process.cwd());
  const policy = retentionPolicySchema.parse({
    ...(await readRetentionPolicy(root)),
    ...options.policy,
  });
  const now = options.now ?? Date.now();
  const scanned = await inventory(root);
  const protection = await protectedState(root, scanned.files, policy, now);
  const candidates = scanned.files
    .filter(
      (file) =>
        !protection.paths.has(file.path) &&
        file.mtimeMs < now - ageLimit(file.path, policy) * day,
    )
    .map((file) => ({
      ...file,
      reason: `Unreferenced, older than ${ageLimit(file.path, policy)} days`,
    }));
  const managedBytes = scanned.files.reduce((sum, file) => sum + file.size, 0);
  const candidateBytes = candidates.reduce((sum, file) => sum + file.size, 0);
  const warnings = [...scanned.warnings, ...protection.warnings];
  if (managedBytes > policy.maximumManagedBytes)
    warnings.push(
      `Managed storage exceeds the ${policy.maximumManagedBytes}-byte budget by ${managedBytes - policy.maximumManagedBytes} bytes; age/protection rules still apply`,
    );
  if (managedBytes - candidateBytes > policy.maximumManagedBytes)
    warnings.push(
      "Protected or young files exceed the budget; review storage capacity or policy. No protected file will be removed automatically.",
    );
  const plan = {
    version: 1 as const,
    id: randomUUID(),
    createdAt: new Date(now).toISOString(),
    projectRoot: root,
    databasePath: await databasePath(),
    policy,
    files: candidates,
    priceHistory: await oldPriceHistory(policy, now),
    managedBytes,
    protectedBytes: scanned.files
      .filter((file) => protection.paths.has(file.path))
      .reduce((sum, file) => sum + file.size, 0),
    candidateBytes,
    verifiedBackupsProtected: protection.verifiedBackups,
    warnings,
  };
  return { ...plan, sha256: retentionPlanHash(plan) };
}
export async function applyRetentionPlan(
  input: unknown,
  expectedHash: string,
  options: { projectRoot?: string } = {},
) {
  const plan = planSchema.parse(input);
  if (plan.sha256 !== expectedHash || retentionPlanHash(plan) !== expectedHash)
    throw new Error(
      "Retention plan hash mismatch; inspect and approve the exact plan",
    );
  const root = await realpath(options.projectRoot || process.cwd());
  if (root !== plan.projectRoot || (await databasePath()) !== plan.databasePath)
    throw new Error("Retention plan belongs to another project/database");
  const age = Date.now() - Date.parse(plan.createdAt);
  if (age < -60000 || age > plan.policy.maximumPlanAgeHours * 3600000)
    throw new Error("Retention plan expired; create and review a fresh plan");
  if (
    new Set(plan.files.map((file) => file.path)).size !== plan.files.length ||
    new Set(plan.priceHistory.map((row) => row.id)).size !==
      plan.priceHistory.length
  )
    throw new Error("Duplicate retention targets");
  const owners: {
    key: string;
    owner: string;
    lease: ReturnType<typeof startCollectorLease>;
  }[] = [];
  const receipt = {
    version: 1,
    planId: plan.id,
    planHash: plan.sha256,
    startedAt: new Date().toISOString(),
    completedAt: null as string | null,
    status: "running",
    filesDeleted: [] as string[],
    priceHistoryDeleted: 0,
    backupDirectory: null as string | null,
    error: null as string | null,
  };
  const receiptPath = join(root, "data/retention/receipts", `${plan.id}.json`);
  try {
    for (const key of [
      "retention",
      "refresh-pipeline",
      "collector",
      "alerts",
    ]) {
      const owner = await acquireLock(key, 600000);
      if (!owner)
        throw new Error(
          `Retention busy: active ${key} owner; no pruning started`,
        );
      owners.push({
        key,
        owner,
        lease: startCollectorLease(owner, { key, ttlMs: 600000 }),
      });
    }
    // Recalculate protections and compare every selected file before the first deletion.
    const current = await createRetentionPlan({
      projectRoot: root,
      policy: plan.policy,
    });
    const eligible = new Map(current.files.map((file) => [file.path, file]));
    for (const file of plan.files) {
      const fresh = eligible.get(file.path);
      if (
        !fresh ||
        fresh.sha256 !== file.sha256 ||
        fresh.size !== file.size ||
        fresh.mtimeMs !== file.mtimeMs
      )
        throw new Error(
          `Retention target changed or became protected: ${file.path}; review a fresh plan`,
        );
    }
    const eligiblePrices = new Map(
      current.priceHistory.map((row) => [row.id, row]),
    );
    for (const row of plan.priceHistory)
      if (
        JSON.stringify(stable(eligiblePrices.get(row.id))) !==
        JSON.stringify(stable(row))
      )
        throw new Error(`Price history changed or became protected: ${row.id}`);
    await safeReceiptDirectory(root);
    await atomicJson(receiptPath, receipt);
    if (plan.priceHistory.length) {
      const { backupBeforeRefresh } = await import("./refresh");
      receipt.backupDirectory = join(
        root,
        "data/backups",
        `retention-${plan.id}`,
      );
      await backupBeforeRefresh(
        receipt.backupDirectory,
        join(root, "public/snapshot.json"),
        { publicDirectory: join(root, "public") },
      );
      const collector = owners.find((item) => item.key === "collector")!;
      receipt.priceHistoryDeleted = await db.$transaction(async (tx) => {
        if (
          !(await tx.jobLock.findFirst({
            where: {
              key: "collector",
              owner: collector.owner,
              expiresAt: { gt: new Date() },
            },
          }))
        )
          throw new Error("Retention collector lease lost");
        const selectedIds = new Set(plan.priceHistory.map((row) => row.id));
        const rows = await tx.priceHistory.findMany({
          where: {
            listingId: {
              in: [...new Set(plan.priceHistory.map((row) => row.listingId))],
            },
          },
          orderBy: [{ listingId: "asc" }, { at: "asc" }, { id: "asc" }],
        });
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!selectedIds.has(row.id)) continue;
          if (
            i === 0 ||
            rows[i - 1].listingId !== row.listingId ||
            i === rows.length - 1 ||
            rows[i + 1].listingId !== row.listingId
          )
            throw new Error(
              "Price history became a protected first/latest point",
            );
          const approved = plan.priceHistory.find(
            (entry) => entry.id === row.id,
          )!;
          if (
            approved.price !== row.price ||
            approved.at !== row.at.toISOString()
          )
            throw new Error("Price history changed before pruning");
        }
        if (
          rows.filter((row) => selectedIds.has(row.id)).length !==
          selectedIds.size
        )
          throw new Error("Price history disappeared before pruning");
        let deleted = 0;
        for (let offset = 0; offset < plan.priceHistory.length; offset += 400)
          deleted += (
            await tx.priceHistory.deleteMany({
              where: {
                id: {
                  in: plan.priceHistory
                    .slice(offset, offset + 400)
                    .map((row) => row.id),
                },
              },
            })
          ).count;
        return deleted;
      });
    }
    for (const file of plan.files) {
      for (const owner of owners) await owner.lease.checkpoint();
      const fresh = await inspectFile(root, file.path);
      if (
        fresh.sha256 !== file.sha256 ||
        fresh.size !== file.size ||
        fresh.mtimeMs !== file.mtimeMs
      )
        throw new Error(
          `File changed during pruning: ${file.path}; remaining files retained`,
        );
      await unlink(await safePath(root, file.path));
      receipt.filesDeleted.push(file.path);
    }
    receipt.status = "success";
    receipt.completedAt = new Date().toISOString();
    return { ...receipt, receiptPath };
  } catch (error) {
    receipt.status =
      receipt.filesDeleted.length || receipt.priceHistoryDeleted
        ? "partial"
        : "failed";
    receipt.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    receipt.completedAt = new Date().toISOString();
    // Do not follow a tampered data/retention path even while reporting a rejected plan.
    try {
      await safeReceiptDirectory(root);
      await atomicJson(receiptPath, receipt);
    } catch {
      /* Original error takes precedence; no unsafe fallback write. */
    }
    for (const owner of owners.reverse()) {
      await owner.lease.stop();
      await releaseLock(owner.key, owner.owner);
    }
  }
}
async function safeReceiptDirectory(root: string) {
  for (const path of ["data", "data/retention", "data/retention/receipts"]) {
    try {
      await safePath(root, path, false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
