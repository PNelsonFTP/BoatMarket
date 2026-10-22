import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
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

const digest = (body: string | Buffer) =>
  createHash("sha256").update(body).digest("hex");
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
const hash = (value: unknown) => digest(JSON.stringify(stable(value)));
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const fileSchema = z
  .object({
    path: z.string(),
    size: z.number().int().nonnegative(),
    sha256: sha,
    mtimeMs: z.number(),
    mode: z.number().int(),
  })
  .strict();
const referenceSchema = z
  .object({
    path: z.string(),
    sha256: sha,
    targets: z.array(z.string()),
    basis: z.enum(["path", "hash", "filename"]),
  })
  .strict();
const inventorySchema = z
  .object({
    version: z.literal(1),
    filesScanned: z.number().int().nonnegative(),
    references: z.array(referenceSchema),
    warnings: z.array(z.string()),
    sha256: sha,
  })
  .strict();
const publicRetirementSchema = z.enum([
  "keep-direct-links",
  "allow-broken-direct-links",
]);
export type PublicRetirementPolicy = z.infer<typeof publicRetirementSchema>;
const planSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string().datetime(),
    projectRoot: z.string(),
    maximumAgeHours: z.number().int().min(1).max(168),
    publicRetirement: publicRetirementSchema,
    origin: z
      .object({
        revision: z.string().nullable(),
        runId: z.string(),
        purpose: z.string(),
      })
      .strict(),
    selectedPaths: z.array(z.string()).min(1),
    files: z.array(fileSchema).min(1),
    bytes: z.number().int().nonnegative(),
    references: inventorySchema,
    blockers: z.array(z.string()),
    sha256: sha,
  })
  .strict();
export type ArchivePlan = z.infer<typeof planSchema>;
type ArchiveFile = z.infer<typeof fileSchema>;
const manifestSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string().datetime(),
    plan: planSchema,
    sha256: sha,
  })
  .strict();
export type ArchiveManifest = z.infer<typeof manifestSchema>;
export function archivePlanHash(
  value: Omit<ArchivePlan, "sha256"> | ArchivePlan,
) {
  const { sha256: _, ...body } = value as ArchivePlan;
  return hash(body);
}
export function archiveManifestHash(
  value: Omit<ArchiveManifest, "sha256"> | ArchiveManifest,
) {
  const { sha256: _, ...body } = value as ArchiveManifest;
  return hash(body);
}
function relativePath(path: string) {
  if (
    isAbsolute(path) ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(`Unsafe archive path: ${path}`);
  return path;
}
async function safePath(root: string, path: string, allowMissing = false) {
  relativePath(path);
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Archive refuses symlink: ${path}`);
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT")
        continue;
      throw error;
    }
  }
  return current;
}
function inArchiveScope(path: string) {
  return /^(?:data\/(?:refresh-\d{4}-\d{2}-\d{2}|pages-\d{4}-\d{2}-\d{2}|p1p2|validation|releases|backups)(?:\/|$)|public\/(?:snapshots|catalogs|catalog-details)\/[^/]+\.json$)/.test(
    path,
  );
}
async function inspect(root: string, path: string): Promise<ArchiveFile> {
  const handle = await open(
    await safePath(root, path),
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    const before = await handle.stat();
    if (!before.isFile())
      throw new Error(`Archive accepts regular files only: ${path}`);
    const hasher = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false }))
      hasher.update(chunk);
    const after = await handle.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ino !== after.ino
    )
      throw new Error(`Archive file changed during hashing: ${path}`);
    return {
      path,
      size: after.size,
      sha256: hasher.digest("hex"),
      mtimeMs: after.mtimeMs,
      mode: after.mode & 0o777,
    };
  } finally {
    await handle.close();
  }
}
async function selectedFiles(root: string, paths: string[]) {
  const files: ArchiveFile[] = [];
  async function walk(path: string) {
    const target = await safePath(root, path),
      info = await lstat(target);
    if (info.isDirectory())
      for (const name of (await readdir(target)).sort())
        await walk(`${path}/${name}`);
    else files.push(await inspect(root, path));
  }
  for (const path of [...new Set(paths)].sort()) {
    if (!inArchiveScope(relativePath(path)))
      throw new Error(
        `Path outside historical archive scope: ${path}. Live database, evidence, baselines, sessions and current reports are never archive-retirement targets.`,
      );
    await walk(path);
  }
  return [...new Map(files.map((file) => [file.path, file])).values()].sort(
    (a, b) => a.path.localeCompare(b.path),
  );
}
const textExtension =
  /\.(?:md|json|jsonl|ndjson|ts|tsx|js|jsx|mjs|cjs|html|txt|log|yaml|yml|bat|command|sh|csv|prisma|toml|sql)$/i;
/** Conservative references include ignored dated helpers and all rollback/release/backup manifests. */
async function referenceInventory(root: string, files: ArchiveFile[]) {
  const selected = new Set(files.map((file) => file.path));
  const publicFiles = files.filter((file) => file.path.startsWith("public/"));
  const references: z.infer<typeof referenceSchema>[] = [],
    warnings: string[] = [];
  let filesScanned = 0;
  const excluded = new Set([
    ".git",
    "node_modules",
    ".next",
    ".next-dev",
    "out",
  ]);
  async function walk(path = "") {
    for (const name of (await readdir(join(root, path))).sort()) {
      const child = path ? `${path}/${name}` : name;
      if ((!path && excluded.has(name)) || child === "data/archives") continue;
      const absolute = join(root, child),
        info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        warnings.push(
          `Reference scan refused symlink: ${child}; inspect its consumer before retirement`,
        );
        continue;
      }
      if (info.isDirectory()) {
        await walk(child);
        continue;
      }
      if (!info.isFile() || !textExtension.test(name)) continue;
      // A public generation stays protected even when its referring helper/manifest
      // is selected in the same package; bundle selection cannot bypass rollback links.
      const targets = selected.has(child)
        ? publicFiles.filter((file) => file.path !== child)
        : files;
      if (!targets.length) continue;
      if (info.size > 64 * 1024 ** 2) {
        warnings.push(`Reference text exceeds 64 MiB scan bound: ${child}`);
        continue;
      }
      const body = await readFile(absolute, "utf8");
      filesScanned++;
      const byPath: string[] = [],
        byHash: string[] = [],
        byName: string[] = [];
      for (const file of targets) {
        const short = file.path.startsWith("public/")
          ? file.path.slice(7)
          : file.path;
        if (
          body.includes(file.path) ||
          body.includes(join(root, file.path)) ||
          body.includes(short)
        )
          byPath.push(file.path);
        else if (
          body.includes(file.sha256) ||
          (/^[a-f0-9]{64}\.json$/.test(basename(file.path)) &&
            body.includes(basename(file.path).slice(0, 64)))
        )
          byHash.push(file.path);
        else if (body.includes(basename(file.path))) byName.push(file.path);
      }
      const sha256 = digest(body);
      for (const [basis, targets] of [
        ["path", byPath],
        ["hash", byHash],
        ["filename", byName],
      ] as const)
        if (targets.length)
          references.push({ path: child, sha256, targets, basis });
    }
  }
  await walk();
  const body = { version: 1 as const, filesScanned, references, warnings };
  return { ...body, sha256: hash(body) };
}
async function blockers(
  root: string,
  files: ArchiveFile[],
  inventory: z.infer<typeof inventorySchema>,
  publicRetirement: PublicRetirementPolicy,
) {
  const result = [...inventory.warnings];
  for (const reference of inventory.references)
    result.push(
      `Referenced by ${reference.path} (${reference.basis}): ${reference.targets.join(", ")}`,
    );
  for (const file of files) {
    if (/\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm))?$/.test(file.path))
      result.push(
        `Database files and sidecars require verified database/backup retention, not archive retirement: ${file.path}`,
      );
    if (file.path.startsWith("data/backups/") || /\/backups\//.test(file.path))
      result.push(
        `Backup bundle member cannot be retired individually or by archive: ${file.path}; use verified backup retention instead`,
      );
    if (file.path.startsWith("public/")) {
      try {
        const pointer = await readFile(
          await safePath(root, "public/data-mode.json"),
          "utf8",
        );
        const mode = z
          .object({
            snapshot: z.literal(true),
            path: z.string().regex(/^snapshots\/[a-f0-9]{64}\.json$/),
            sha256: sha,
          })
          .passthrough()
          .parse(JSON.parse(pointer));
        const active = await safePath(root, `public/${mode.path}`);
        if (
          digest(await readFile(active)) !== mode.sha256 ||
          basename(mode.path) !== `${mode.sha256}.json`
        )
          throw new Error(
            "The active public generation does not verify against data-mode.json",
          );
        if (
          pointer.includes(file.sha256) ||
          pointer.includes(file.path.slice(7)) ||
          pointer.includes(basename(file.path).slice(0, -5))
        )
          result.push(`Active public pointer protects ${file.path}`);
      } catch (error) {
        result.push(
          `Public generation requires an inspectable, verified public/data-mode.json pointer: ${file.path} (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      // The reference inventory covers previous pointers, journals, releases, helpers, backup manifests and detail manifests.
      if (publicRetirement === "keep-direct-links")
        result.push(
          `Public direct-link retirement requires an exact reviewed --public-retirement=allow-broken-direct-links preview; default keeps direct links: ${file.path}`,
        );
    }
  }
  return [...new Set(result)].sort();
}
export async function createArchivePlan(options: {
  projectRoot?: string;
  paths: string[];
  runId: string;
  purpose: string;
  maximumAgeHours?: number;
  publicRetirement?: PublicRetirementPolicy;
}) {
  const root = await realpath(options.projectRoot || process.cwd());
  if (!options.runId.trim() || !options.purpose.trim())
    throw new Error("Archive origin requires a run ID and purpose");
  const files = await selectedFiles(root, options.paths);
  if (!files.length)
    throw new Error("Archive selection contains no regular files");
  let revision: string | null = null;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* Non-checkout fixtures retain an explicit null revision. */
  }
  const references = await referenceInventory(root, files);
  const publicRetirement = publicRetirementSchema.parse(
    options.publicRetirement ?? "keep-direct-links",
  );
  const body = {
    version: 1 as const,
    createdAt: new Date().toISOString(),
    projectRoot: root,
    maximumAgeHours: options.maximumAgeHours ?? 24,
    publicRetirement,
    origin: { revision, runId: options.runId, purpose: options.purpose },
    selectedPaths: [...new Set(options.paths)].sort(),
    files,
    bytes: files.reduce((sum, file) => sum + file.size, 0),
    references,
    blockers: await blockers(root, files, references, publicRetirement),
  };
  return planSchema.parse({ ...body, sha256: archivePlanHash(body) });
}
function validatePlan(input: unknown, expectedHash: string) {
  const plan = planSchema.parse(input);
  if (plan.sha256 !== expectedHash || archivePlanHash(plan) !== expectedHash)
    throw new Error("Archive plan hash mismatch; review the exact manifest");
  if (
    new Set(plan.files.map((file) => file.path)).size !== plan.files.length ||
    plan.bytes !== plan.files.reduce((sum, file) => sum + file.size, 0)
  )
    throw new Error(
      "Archive plan contains duplicate files or inconsistent totals",
    );
  for (const file of plan.files)
    if (!inArchiveScope(relativePath(file.path)))
      throw new Error(`Archive plan target outside scope: ${file.path}`);
  const { sha256: _, ...inventory } = plan.references;
  if (hash(inventory) !== plan.references.sha256)
    throw new Error("Archive reference inventory hash mismatch");
  return plan;
}
async function currentPlan(plan: ArchivePlan, root: string) {
  if (root !== plan.projectRoot)
    throw new Error("Archive plan belongs to another project");
  const age = Date.now() - Date.parse(plan.createdAt);
  if (age < -60000 || age > plan.maximumAgeHours * 3600000)
    throw new Error("Archive plan expired; create a fresh preview");
  const files = await selectedFiles(root, plan.selectedPaths);
  if (hash(files) !== hash(plan.files))
    throw new Error("Archive source changed; review a fresh preview");
  const references = await referenceInventory(root, files);
  return {
    files,
    references,
    blockers: await blockers(root, files, references, plan.publicRetirement),
  };
}
async function archiveRoot(root: string) {
  const target = await safePath(root, "data/archives", true);
  await mkdir(target, { recursive: true, mode: 0o700 });
  return target;
}
async function exclusive(root: string) {
  const directory = await archiveRoot(root),
    lock = join(directory, "operation.lock");
  try {
    const handle = await open(lock, "wx", 0o600);
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
    );
    return async () => {
      await handle.close();
      await unlink(lock);
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        "Archive operation busy; inspect data/archives/operation.lock if a previous process crashed",
      );
    throw error;
  }
}
export async function packArchive(
  input: unknown,
  expectedHash: string,
  options: { projectRoot?: string } = {},
) {
  const plan = validatePlan(input, expectedHash),
    root = await realpath(options.projectRoot || process.cwd());
  const release = await exclusive(root);
  try {
    const current = await currentPlan(plan, root);
    if (current.references.sha256 !== plan.references.sha256)
      throw new Error("Archive references changed; review a fresh preview");
    const base = await archiveRoot(root),
      directory = join(base, "packages", plan.sha256);
    await safePath(root, `data/archives/packages/${plan.sha256}/objects`, true);
    try {
      await mkdir(directory, { recursive: false, mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
        await mkdir(directory, { mode: 0o700 });
      } else if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        const existing = await verifyArchive(directory);
        if (existing.plan.sha256 !== plan.sha256)
          throw new Error(
            "Existing archive package belongs to another reviewed plan",
          );
        return {
          directory,
          planHash: plan.sha256,
          copiedFiles: plan.files.length,
          originalFilesRemoved: 0,
        };
      } else throw error;
    }
    await mkdir(join(directory, "objects"), { mode: 0o700 });
    const copied = new Set<string>();
    for (const file of plan.files) {
      if (hash(await inspect(root, file.path)) !== hash(file))
        throw new Error(`Archive source changed before copy: ${file.path}`);
      if (!copied.has(file.sha256)) {
        const object = join(directory, "objects", file.sha256);
        await copyFile(
          await safePath(root, file.path),
          object,
          constants.COPYFILE_EXCL,
        );
        if (digest(await readFile(object)) !== file.sha256)
          throw new Error(`Archive copy hash mismatch: ${file.path}`);
        copied.add(file.sha256);
      }
      if (hash(await inspect(root, file.path)) !== hash(file))
        throw new Error(`Archive source changed after copy: ${file.path}`);
    }
    const body = {
      version: 1 as const,
      createdAt: new Date().toISOString(),
      plan,
    };
    const manifest = { ...body, sha256: archiveManifestHash(body) };
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    await verifyArchive(directory);
    return {
      directory,
      planHash: plan.sha256,
      manifestHash: manifest.sha256,
      copiedFiles: plan.files.length,
      uniqueObjects: copied.size,
      originalFilesRemoved: 0,
    };
  } finally {
    await release();
  }
}
export async function verifyArchive(
  directory: string,
  restoredDirectory?: string,
): Promise<ArchiveManifest> {
  const actual = resolve(directory),
    parent = await realpath(dirname(actual));
  if (parent !== dirname(actual) || (await lstat(actual)).isSymbolicLink())
    throw new Error("Archive package/ancestor must not be a symlink");
  const manifestPath = await safePath(actual, "manifest.json");
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  validatePlan(manifest.plan, manifest.plan.sha256);
  if (manifest.sha256 !== archiveManifestHash(manifest))
    throw new Error("Archive manifest hash mismatch");
  for (const file of manifest.plan.files) {
    const object = await safePath(actual, `objects/${file.sha256}`),
      info = await lstat(object);
    if (
      !info.isFile() ||
      info.size !== file.size ||
      digest(await readFile(object)) !== file.sha256
    )
      throw new Error(`Corrupt archive object for ${file.path}`);
    if (restoredDirectory) {
      const restored = await inspect(
        await realpath(restoredDirectory),
        file.path,
      );
      if (restored.sha256 !== file.sha256 || restored.size !== file.size)
        throw new Error(`Restored audit differs from archive: ${file.path}`);
    }
  }
  return manifest;
}
export async function restoreArchive(directory: string, destination: string) {
  const manifest = await verifyArchive(directory),
    root = resolve(destination);
  const withinProject = relative(manifest.plan.projectRoot, root)
    .split(sep)
    .join("/");
  if (
    !withinProject.startsWith("../") &&
    /^(?:public|out|\.git)(?:\/|$)/.test(withinProject)
  )
    throw new Error(
      "Restore contains private historical material; choose a destination outside public/, out/ and .git/",
    );
  // Never overlay an existing directory, even an empty one, or restore into live data/public paths.
  const parent = await realpath(dirname(root));
  if (parent !== dirname(root))
    throw new Error("Restore parent must not be a symlink");
  await mkdir(root, { mode: 0o700 });
  for (const file of manifest.plan.files) {
    const target = await safePath(root, file.path, true);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(
      await safePath(resolve(directory), `objects/${file.sha256}`),
      target,
      constants.COPYFILE_EXCL,
    );
    await utimes(target, new Date(file.mtimeMs), new Date(file.mtimeMs));
  }
  await verifyArchive(directory, root);
  return {
    directory: root,
    files: manifest.plan.files.length,
    bytes: manifest.plan.bytes,
    verified: true,
    originatingRevision: manifest.plan.origin.revision,
    originatingRunId: manifest.plan.origin.runId,
  };
}
/** Explicit, hash-reviewed retirement only. Callers must hold application writer leases. */
async function databaseBlockers(root: string, files: ArchiveFile[]) {
  const { db } = await import("./db");
  const groups = await Promise.all([
    db.listing.findMany({
      select: { data: true, rawPayload: true, confidence: true },
    }),
    db.duplicateDecision.findMany({ select: { evidence: true } }),
    db.vesselEvent.findMany(),
    db.locationOverrideEvent.findMany(),
  ]);
  const result: string[] = [];
  for (let index = 0; index < groups.length; index++) {
    const body = JSON.stringify(groups[index]);
    for (const file of files)
      if (
        body.includes(file.path) ||
        body.includes(join(root, file.path)) ||
        body.includes(file.sha256)
      )
        result.push(
          `Current database ${["listing evidence", "duplicate decisions", "vessel events", "location overrides"][index]} references ${file.path}`,
        );
  }
  return result;
}
async function retireWithLeases(
  directory: string,
  expectedHash: string,
  root: string,
) {
  const { acquireLock, releaseLock } = await import("./repository");
  const { startCollectorLease } = await import("./lease");
  const owners: {
    key: string;
    owner: string;
    lease: ReturnType<typeof startCollectorLease>;
  }[] = [];
  try {
    for (const key of [
      "retention",
      "refresh-pipeline",
      "collector",
      "publication",
      "alerts",
    ]) {
      const owner = await acquireLock(key, 600000);
      if (!owner)
        throw new Error(`Archive retirement busy: active ${key} owner`);
      owners.push({
        key,
        owner,
        lease: startCollectorLease(owner, { key, ttlMs: 600000 }),
      });
    }
    const manifest = await verifyArchive(directory),
      plan = validatePlan(manifest.plan, expectedHash);
    const current = await currentPlan(plan, root);
    current.blockers.push(...(await databaseBlockers(root, plan.files)));
    if (current.blockers.length)
      throw new Error(
        `Archive retirement blocked; originals retained:\n${current.blockers.join("\n")}`,
      );
    if (current.references.sha256 !== plan.references.sha256)
      throw new Error(
        "Archive reference inventory changed; originals retained; create and review a new preview",
      );
    const receipt = {
      version: 1,
      planHash: expectedHash,
      archive: relative(root, directory).split(sep).join("/"),
      at: new Date().toISOString(),
      removed: [] as string[],
      status: "running",
    };
    const receiptPath = join(
      await archiveRoot(root),
      "receipts",
      `${expectedHash}-${randomUUID()}.json`,
    );
    await mkdir(dirname(receiptPath), { recursive: true, mode: 0o700 });
    async function persist() {
      const temp = `${receiptPath}.tmp`;
      await writeFile(temp, JSON.stringify(receipt, null, 2) + "\n", {
        mode: 0o600,
      });
      await rename(temp, receiptPath);
    }
    await persist();
    try {
      for (const file of plan.files) {
        for (const owner of owners) await owner.lease.checkpoint();
        if (hash(await inspect(root, file.path)) !== hash(file))
          throw new Error(
            `Archive retirement source changed: ${file.path}; remaining originals retained`,
          );
        await unlink(await safePath(root, file.path));
        receipt.removed.push(file.path);
        await persist();
      }
      receipt.status = "success";
      await persist();
      return { ...receipt, receiptPath };
    } catch (error) {
      receipt.status = "partial-failure";
      await persist();
      throw error;
    }
  } finally {
    for (const owner of owners.reverse()) {
      await owner.lease.stop();
      await releaseLock(owner.key, owner.owner);
    }
  }
}
export async function retireArchiveOriginals(
  directory: string,
  expectedHash: string,
  options: { projectRoot?: string } = {},
) {
  const root = await realpath(options.projectRoot || process.cwd());
  const absolute = resolve(directory);
  if (!absolute.startsWith(join(root, "data/archives/packages") + sep))
    throw new Error(
      "Retirement requires a verified package inside this project's data/archives/packages",
    );
  const release = await exclusive(root);
  try {
    return await retireWithLeases(absolute, expectedHash, root);
  } finally {
    await release();
  }
}
export async function writeArchivePlan(plan: ArchivePlan, destination: string) {
  const absolute = resolve(destination),
    root = plan.projectRoot;
  if (!absolute.startsWith(join(root, "data/archives/plans") + sep))
    throw new Error(
      "Archive plans contain private paths; write them under data/archives/plans",
    );
  await safePath(root, relative(root, absolute).split(sep).join("/"), true);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  await writeFile(absolute, JSON.stringify(plan, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return absolute;
}
