import { afterAll, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { makeSeed } from "../lib/seed";
import { prepareSnapshot } from "../scripts/export-snapshot";
import {
  writeSearchCatalog,
  buildSearchCatalog,
} from "../server/snapshot-catalog";
import { verifyBackup } from "../server/refresh";
import {
  previewBackupRestore,
  restoreBackupToDirectory,
} from "../server/backup-restore";
import { readPublicSnapshotGeneration } from "../server/publication";

const directory = await mkdtemp(join(tmpdir(), "boatscout-backup-catalog-"));
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(directory, "backup-"));
  const database = new PrismaClient({
    datasources: { db: { url: `file:${join(root, "boatscout.db")}` } },
  });
  try {
    await database.$executeRawUnsafe(
      "CREATE TABLE probe (id INTEGER PRIMARY KEY)",
    );
    await database.$executeRawUnsafe("INSERT INTO probe VALUES (1)");
  } finally {
    await database.$disconnect();
  }
  const at = "2026-10-19T12:00:00.000Z";
  const snapshot = prepareSnapshot(
    [
      {
        ...makeSeed()[0],
        id: "catalog-ad",
        sourceListingId: "catalog-ad",
        isSample: false,
        fieldProvenance: {
          length: [
            {
              value: 19,
              source: "Dealer",
              sourceUrl: "https://example.com/boat",
              observedAt: at,
              method: "source",
            },
          ],
        },
      },
    ],
    { generatedAt: at },
  );
  const canonical = JSON.stringify(snapshot),
    sha256 = digest(canonical),
    generation = `snapshots/${sha256}.json`;
  const catalog = await writeSearchCatalog(join(root, "public"), canonical);
  await mkdir(dirname(join(root, "public", generation)), { recursive: true });
  await writeFile(join(root, "public", generation), canonical);
  await writeFile(join(root, "snapshot.json"), canonical);
  const pointer = { snapshot: true, path: generation, sha256, catalog };
  await writeFile(join(root, "data-mode.json"), JSON.stringify(pointer));
  const built = buildSearchCatalog(canonical);
  const names = [
    "boatscout.db",
    "snapshot.json",
    "data-mode.json",
    `public/${generation}`,
    ...built.files.map((file) => `public/${file.path}`),
  ];
  const manifest = {
    version: 1,
    files: await Promise.all(
      names.map(async (name) => ({
        name,
        sha256: digest(await readFile(join(root, name))),
      })),
    ),
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  return { root, canonical, pointer, manifest, built };
}
it("verifies and restores the complete catalog graph with its canonical binding", async () => {
  const input = await fixture();
  expect(await verifyBackup(input.root)).toMatchObject({
    databaseIntegrity: "ok",
    tables: { probe: 1 },
  });
  const destination = join(directory, `restored-${randomUUID()}`);
  const preview = await previewBackupRestore(input.root, destination);
  const result = await restoreBackupToDirectory(
    input.root,
    destination,
    preview.manifestHash,
  );
  expect(result.status).toBe("restored");
  expect(
    await readPublicSnapshotGeneration(join(destination, "public")),
  ).toMatchObject({
    sha256: input.pointer.sha256,
    catalog: input.pointer.catalog,
  });
});
it("rejects an omitted detail shard in a rehashed manifest before creating a restore directory", async () => {
  const input = await fixture();
  const missing = `public/${input.built.files.find((file) => file.path.startsWith("catalog-details/"))!.path}`;
  input.manifest.files = input.manifest.files.filter(
    (file) => file.name !== missing,
  );
  await writeFile(
    join(input.root, "manifest.json"),
    JSON.stringify(input.manifest),
  );
  // Bytes still exist beside the manifest, so merely reading/hash-checking the graph is insufficient.
  expect(await stat(join(input.root, missing))).toBeTruthy();
  await expect(verifyBackup(input.root)).rejects.toThrow(
    `graph member missing from manifest: ${missing}`,
  );
  const destination = join(directory, `omitted-${randomUUID()}`);
  await expect(previewBackupRestore(input.root, destination)).rejects.toThrow(
    "graph member missing from manifest",
  );
  await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
});
it("requires the declared canonical generation and rejects a catalog belonging to another snapshot", async () => {
  const missingCanonical = await fixture();
  missingCanonical.manifest.files = missingCanonical.manifest.files.filter(
    (file) => file.name !== `public/${missingCanonical.pointer.path}`,
  );
  await writeFile(
    join(missingCanonical.root, "manifest.json"),
    JSON.stringify(missingCanonical.manifest),
  );
  await expect(verifyBackup(missingCanonical.root)).rejects.toThrow(
    "graph member missing from manifest: public/snapshots/",
  );
  const wrongBinding = await fixture();
  wrongBinding.pointer.catalog.snapshotHash = "a".repeat(64);
  const body = JSON.stringify(wrongBinding.pointer);
  await writeFile(join(wrongBinding.root, "data-mode.json"), body);
  wrongBinding.manifest.files.find(
    (file) => file.name === "data-mode.json",
  )!.sha256 = digest(body);
  await writeFile(
    join(wrongBinding.root, "manifest.json"),
    JSON.stringify(wrongBinding.manifest),
  );
  await expect(verifyBackup(wrongBinding.root)).rejects.toThrow(
    "Catalog does not match the reviewed snapshot",
  );
});
