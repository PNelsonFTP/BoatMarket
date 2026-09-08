import { expect, it, vi, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  stat,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const lifecycleDirectory = await mkdtemp(
  join(tmpdir(), "boatscout-backup-lifecycle-"),
);
process.env.DATABASE_URL = `file:${join(lifecycleDirectory, "test.db")}`;
const { db } = await import("../server/db");
const { backupBeforeRefresh, verifyBackup } = await import("../server/refresh");
beforeAll(async () => {
  await writeFile(join(lifecycleDirectory, "test.db"), "");
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, encoding: "utf8" },
  );
  if (result.status) throw new Error(result.stdout + result.stderr);
  const attached = await db.$queryRawUnsafe<{ file: string; name: string }[]>(
    "PRAGMA database_list",
  );
  expect(
    await realpath(attached.find((entry) => entry.name === "main")!.file),
  ).toBe(await realpath(join(lifecycleDirectory, "test.db")));
});
afterAll(async () => {
  await db.$disconnect();
  await rm(lifecycleDirectory, { recursive: true, force: true });
});
it("rejects public, built-output and Git backup destinations before any SQL", async () => {
  const query = vi.fn(() => {
    throw new Error("SQL must not run for a forbidden backup destination");
  });
  const execute = vi.fn(() => {
    throw new Error("SQL must not run for a forbidden backup destination");
  });
  const database = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
  for (const root of ["public", "out", ".git"])
    for (const destination of [
      root,
      join(root, "private-backup"),
      resolve(root, "nested", "private-backup"),
    ])
      await expect(
        backupBeforeRefresh(destination, "unused-snapshot.json", {
          database,
        }),
      ).rejects.toThrow("outside public/");
  expect(query).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
it("restores a consistent SQLite backup with readable data and verified hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boatscout-backup-"));
  const database = new PrismaClient({
    datasources: { db: { url: `file:${join(directory, "source.db")}` } },
  });
  let restored: PrismaClient | undefined;
  try {
    await database.$executeRawUnsafe(
      "CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT)",
    );
    await database.$executeRawUnsafe(
      "INSERT INTO probe VALUES (1, 'preserved')",
    );
    const snapshot = join(directory, "snapshot.json");
    await writeFile(snapshot, '{"listings":[]}');
    const result = await backupBeforeRefresh(
      join(directory, "backup"),
      snapshot,
      { database },
    );
    expect(result.databaseIntegrity).toBe("ok");
    expect(await verifyBackup(result.directory)).toMatchObject({
      databaseIntegrity: "ok",
      tables: { probe: 1 },
    });
    restored = new PrismaClient({
      datasources: { db: { url: `file:${result.database}` } },
    });
    expect(
      await restored.$queryRawUnsafe("SELECT value FROM probe WHERE id=1"),
    ).toEqual([{ value: "preserved" }]);
    expect(await restored.$queryRawUnsafe("PRAGMA quick_check")).toEqual([
      { quick_check: "ok" },
    ]);
    for (const file of result.files)
      expect(
        createHash("sha256")
          .update(await readFile(join(result.directory, file.name)))
          .digest("hex"),
      ).toBe(file.sha256);
    await expect(
      backupBeforeRefresh("public/private-backup", snapshot, { database }),
    ).rejects.toThrow("outside public/");
    await writeFile(
      join(result.directory, "snapshot.json"),
      "modified after backup",
    );
    await expect(verifyBackup(result.directory)).rejects.toThrow(
      "Backup hash mismatch: snapshot.json",
    );
  } finally {
    await restored?.$disconnect();
    await database.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});

it("backs up and restores the active immutable generation, marker and private enrichment evidence", async () => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "boatscout-restore-")),
  );
  const { activateSnapshot, readSnapshotActivation } =
    await import("../server/publication");
  const { previewBackupRestore, restoreBackupToDirectory } =
    await import("../server/backup-restore");
  const database = new PrismaClient({
    datasources: { db: { url: `file:${join(directory, "source.db")}` } },
  });
  let restored: PrismaClient | undefined;
  try {
    await database.$executeRawUnsafe(
      "CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT)",
    );
    await database.$executeRawUnsafe(
      "INSERT INTO probe VALUES (1, 'restored safely')",
    );
    vi.stubEnv("PUBLICATION_DIR", join(directory, "publication"));
    vi.stubEnv("IMAGE_EVIDENCE_FILE", join(directory, "image-evidence.json"));
    vi.stubEnv("ENRICHMENT_STATE_DIR", join(directory, "enrichment"));
    await writeFile(process.env.IMAGE_EVIDENCE_FILE!, "[]");
    await mkdir(process.env.ENRICHMENT_STATE_DIR!);
    await writeFile(
      join(process.env.ENRICHMENT_STATE_DIR!, "fixture.json"),
      '{"version":1,"entries":{}}',
    );
    const activation = await activateSnapshot('{"listings":[]}', {
      publicDirectory: join(directory, "public"),
      runId: "fixture",
      listings: 0,
    });
    const backup = await backupBeforeRefresh(
      join(directory, "backup"),
      join(directory, "absent.json"),
      { database, publicDirectory: join(directory, "public") },
    );
    expect(backup.files.map((file) => file.name)).toEqual(
      expect.arrayContaining([
        "image-evidence.json",
        "enrichment/fixture.json",
        `public/${activation.path}`,
        `publication/${activation.id}.json`,
        "data-mode.json",
      ]),
    );
    const preview = await previewBackupRestore(
      backup.directory,
      join(directory, "restored"),
    );
    await expect(stat(join(directory, "restored"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      restoreBackupToDirectory(
        backup.directory,
        join(directory, "restored"),
        "wrong",
      ),
    ).rejects.toThrow("hash changed");
    const result = await restoreBackupToDirectory(
      backup.directory,
      join(directory, "restored"),
      preview.manifestHash,
    );
    expect(result.status).toBe("restored");
    restored = new PrismaClient({
      datasources: {
        db: { url: `file:${join(directory, "restored/data/boatscout.db")}` },
      },
    });
    expect(await restored.$queryRawUnsafe("SELECT value FROM probe")).toEqual([
      { value: "restored safely" },
    ]);
    expect(await restored.$queryRawUnsafe("PRAGMA quick_check")).toEqual([
      { quick_check: "ok" },
    ]);
    vi.stubEnv("PUBLICATION_DIR", join(directory, "restored/data/publication"));
    expect(
      await readSnapshotActivation(
        "fixture",
        join(directory, "restored/public"),
      ),
    ).toMatchObject({ sha256: activation.sha256, state: "committed" });
    expect(
      await readFile(
        join(directory, "restored/data/enrichment/fixture.json"),
        "utf8",
      ),
    ).toContain('"version":1');
    await expect(
      restoreBackupToDirectory(
        backup.directory,
        join(directory, "restored"),
        preview.manifestHash,
      ),
    ).rejects.toThrow("already exists");
  } finally {
    vi.unstubAllEnvs();
    await restored?.$disconnect();
    await database.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});

it("backs up and restores a cloned public generation without requiring or inventing a private journal", async () => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "boatscout-imported-backup-")),
  );
  const { readSnapshotActivation } = await import("../server/publication");
  const { previewBackupRestore, restoreBackupToDirectory } =
    await import("../server/backup-restore");
  const database = new PrismaClient({
    datasources: { db: { url: `file:${join(directory, "source.db")}` } },
  });
  try {
    await database.$executeRawUnsafe(
      "CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT)",
    );
    await database.$executeRawUnsafe(
      "INSERT INTO probe VALUES (1, 'cloned checkout')",
    );
    vi.stubEnv("PUBLICATION_DIR", join(directory, "missing-journal"));
    const publicDirectory = join(directory, "public");
    const body = '{"listings":[]}',
      sha256 = createHash("sha256").update(body).digest("hex"),
      path = `snapshots/${sha256}.json`;
    const activationId = "5bb6f8fa-65df-46a9-9520-23188f02c53a";
    await mkdir(join(publicDirectory, "snapshots"), { recursive: true });
    await writeFile(join(publicDirectory, path), body);
    await writeFile(join(publicDirectory, "snapshot.json"), body);
    await writeFile(
      join(publicDirectory, "data-mode.json"),
      JSON.stringify({ snapshot: true, path, sha256, activationId }),
    );
    const backup = await backupBeforeRefresh(
      join(directory, "backup"),
      join(publicDirectory, "snapshot.json"),
      { database, publicDirectory },
    );
    expect(backup.files.map((file) => file.name)).toEqual(
      expect.arrayContaining(["data-mode.json", `public/${path}`]),
    );
    expect(
      backup.files.some((file) => file.name.startsWith("publication/")),
    ).toBe(false);
    expect((await verifyBackup(backup.directory)).tables.probe).toBe(1);
    expect(
      JSON.parse(
        await readFile(join(backup.directory, "data-mode.json"), "utf8"),
      ),
    ).toEqual({ snapshot: true, path, sha256, activationId });
    const destination = join(directory, "restored"),
      preview = await previewBackupRestore(backup.directory, destination);
    await restoreBackupToDirectory(
      backup.directory,
      destination,
      preview.manifestHash,
    );
    vi.stubEnv("PUBLICATION_DIR", join(destination, "data/publication"));
    expect(
      await readSnapshotActivation(undefined, join(destination, "public")),
    ).toMatchObject({
      state: "imported",
      sha256,
      runId: null,
      committedAt: null,
    });
    expect(
      await readSnapshotActivation(
        "unproven-local-run",
        join(destination, "public"),
      ),
    ).toBeNull();
    await expect(
      stat(join(destination, "data/publication")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    vi.unstubAllEnvs();
    await database.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
