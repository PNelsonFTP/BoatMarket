import { expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { backupBeforeRefresh, verifyBackup } from "../server/refresh";
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
