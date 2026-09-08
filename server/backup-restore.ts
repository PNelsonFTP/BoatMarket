import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, chmod } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { verifyBackup } from "./refresh";
import { assertDiskSpace } from "./disk-space";
import { atomicJson } from "./refresh-report";
const hash = (body: string | Buffer) =>
  createHash("sha256").update(body).digest("hex");
function restoredPath(name: string) {
  const fixed: Record<string, string> = {
    "boatscout.db": "data/boatscout.db",
    "snapshot.json": "public/snapshot.json",
    "sources.json": "config/sources.json",
    "locations.json": "config/locations.json",
    "source-access.json": "config/source-access.json",
    "data-mode.json": "public/data-mode.json",
    "location-review.json": "data/location-review.json",
    "image-evidence.json": "data/image-evidence.json",
  };
  if (fixed[name]) return fixed[name];
  if (/^enrichment\/[a-z0-9-]+\.json$/.test(name)) return `data/${name}`;
  if (/^publication\/[a-f0-9-]{36}\.json$/.test(name)) return `data/${name}`;
  if (/^public\/snapshots\/[a-f0-9]{64}\.json$/.test(name)) return name;
  throw new Error(`No reviewed restore mapping for ${name}`);
}
async function noSymlinkAncestors(path: string) {
  let current = resolve(path);
  while (true) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Restore refuses symlink ancestor: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export async function previewBackupRestore(source: string, target: string) {
  const sourceDirectory = resolve(source),
    targetDirectory = resolve(target);
  for (const directory of ["public", "out", ".git"])
    if (
      targetDirectory === resolve(directory) ||
      targetDirectory.startsWith(resolve(directory) + sep)
    )
      throw new Error(
        "Private restore must stay outside public/, out/ and .git/",
      );
  if (
    targetDirectory === sourceDirectory ||
    targetDirectory.startsWith(sourceDirectory + sep)
  )
    throw new Error("Restore destination must be separate from the backup");
  await noSymlinkAncestors(sourceDirectory);
  await noSymlinkAncestors(targetDirectory);
  try {
    await lstat(targetDirectory);
    throw new Error(
      "Restore destination already exists; choose a new empty path to avoid overwriting live data",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const manifestBody = await readFile(
    join(sourceDirectory, "manifest.json"),
    "utf8",
  );
  const verified = await verifyBackup(sourceDirectory);
  if (
    (await readFile(join(sourceDirectory, "manifest.json"), "utf8")) !==
    manifestBody
  )
    throw new Error("Backup manifest changed during restore review");
  const manifest = JSON.parse(manifestBody) as {
    files: { name: string; sha256: string }[];
  };
  const files = await Promise.all(
    manifest.files.map(async (entry) => ({
      source: entry.name,
      target: restoredPath(entry.name),
      sha256: entry.sha256,
      bytes: (await lstat(join(sourceDirectory, entry.name))).size,
    })),
  );
  return {
    version: 1,
    dryRun: true,
    sourceDirectory,
    targetDirectory,
    manifestHash: hash(manifestBody),
    files,
    verified,
    note: "Restores into a new directory only, using default data/config/public paths. The database includes private workspace data. This does not replace a running database, install dependencies, restore .env secrets, or start services. Review path overrides before using this restored data.",
  };
}
export async function restoreBackupToDirectory(
  source: string,
  target: string,
  expectedManifestHash: string,
) {
  const plan = await previewBackupRestore(source, target);
  if (plan.manifestHash !== expectedManifestHash)
    throw new Error("Backup manifest hash changed; review restore again");
  await assertDiskSpace(plan.targetDirectory, {
    requiredBytes: plan.files.reduce((sum, file) => sum + file.bytes, 0),
  });
  await mkdir(dirname(plan.targetDirectory), { recursive: true });
  await noSymlinkAncestors(plan.targetDirectory);
  await mkdir(plan.targetDirectory, { mode: 0o700 });
  // The exclusive new root prevents accidental replacement. Incomplete copies remain clearly marked for inspection.
  const receipt = {
    ...plan,
    dryRun: false,
    status: "copying",
    completedAt: null as string | null,
  };
  await atomicJson(
    join(plan.targetDirectory, "restore-manifest.json"),
    receipt,
  );
  for (const file of plan.files) {
    const from = join(plan.sourceDirectory, file.source),
      destination = join(plan.targetDirectory, file.target);
    await noSymlinkAncestors(from);
    await noSymlinkAncestors(destination);
    if (hash(await readFile(from)) !== file.sha256)
      throw new Error(
        `Backup file changed: ${file.source}; incomplete restore left for inspection`,
      );
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(from, destination, constants.COPYFILE_EXCL);
    await chmod(destination, 0o600);
    if (hash(await readFile(destination)) !== file.sha256)
      throw new Error(`Restored file failed its hash check: ${file.target}`);
  }
  receipt.status = "restored";
  receipt.completedAt = new Date().toISOString();
  await atomicJson(
    join(plan.targetDirectory, "restore-manifest.json"),
    receipt,
  );
  return receipt;
}
