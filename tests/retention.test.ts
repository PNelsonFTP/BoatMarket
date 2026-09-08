import { realpath } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  utimes,
  symlink,
  stat,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { makeSeed } from "../lib/seed";
const directory = await mkdtemp(join(tmpdir(), "boatscout-retention-"));
process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
const { db } = await import("../server/db");
const { createRetentionPlan, applyRetentionPlan, retentionPlanHash } =
  await import("../server/retention");
const { backupBeforeRefresh, verifyBackup } = await import("../server/refresh");
const { assertDiskSpace } = await import("../server/disk-space");
const { upsertListing } = await import("../server/repository");
const hash = (body: string) => createHash("sha256").update(body).digest("hex");
let root: string;
const old = new Date(Date.now() - 500 * 86400000);
async function file(path: string, body = "fixture", modified = old) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
  await utimes(target, modified, modified);
  return target;
}
beforeAll(async () => {
  await writeFile(join(directory, "test.db"), "");
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
  ).toBe(await realpath(join(directory, "test.db")));
});
beforeEach(async () => {
  await db.jobLock.deleteMany();
  await db.listing.deleteMany();
  await db.vesselEvent.deleteMany();
  root = await mkdtemp(join(directory, "project-"));
  for (const [key, path] of Object.entries({
    SOURCE_CONFIG: "config/sources.json",
    LOCATION_CONFIG: "config/locations.json",
    LOCATION_REVIEW_FILE: "data/location-review.json",
    IMAGE_EVIDENCE_FILE: "data/image-evidence.json",
    ENRICHMENT_STATE_DIR: "data/enrichment",
    PUBLICATION_DIR: "data/publication",
    REFRESH_REPORT_DIR: "data/refresh-runs",
    RETENTION_CONFIG: "config/retention.json",
  }))
    vi.stubEnv(key, join(root, path));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
it("dry-run protects database evidence, current reports, publication and active logs", async () => {
  const body = "current evidence",
    sha256 = hash(body);
  await file("data/cache/current.html", body);
  await file("data/cache/expired.html", "unreferenced old page");
  await file(`data/evidence/objects/${sha256}.html`, body);
  await file(
    "data/evidence/observations/current.json",
    JSON.stringify({ sha256 }),
  );
  await file(
    "data/refresh-runs/latest-collection.json",
    JSON.stringify({ runId: "current", status: "success" }),
  );
  await file(
    "data/refresh-runs/current.json",
    JSON.stringify({ runId: "current", status: "success" }),
  );
  await file(
    "data/refresh-runs/old.json",
    JSON.stringify({ runId: "old", status: "success" }),
  );
  await file("logs/boatscout.log", "current log");
  await file("logs/boatscout.log.1", "rotated old log");
  await file("data/publication/old.json", "protected publication");
  await file("public/snapshots/old.json", "protected generation");
  await upsertListing({
    ...makeSeed()[0],
    id: "protected",
    sourceListingId: "protected",
    isSample: false,
    rawPayload: {
      summaryEvidenceHash: sha256,
      cachedPage: "data/cache/current.html",
    },
  });
  const plan = await createRetentionPlan({ projectRoot: root });
  expect(plan.files.map((file) => file.path).sort()).toEqual([
    "data/cache/expired.html",
    "data/refresh-runs/old.json",
    "logs/boatscout.log.1",
  ]);
  expect(retentionPlanHash(plan)).toBe(plan.sha256);
  expect(await readFile(join(root, "data/cache/expired.html"), "utf8")).toBe(
    "unreferenced old page",
  );
  const result = await applyRetentionPlan(plan, plan.sha256, {
    projectRoot: root,
  });
  expect(result.status).toBe("success");
  expect(result.completedAt).toBeTruthy();
  await expect(
    stat(join(root, "data/cache/expired.html")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(
    await readFile(join(root, `data/evidence/objects/${sha256}.html`), "utf8"),
  ).toBe(body);
  expect(await readFile(join(root, "data/publication/old.json"), "utf8")).toBe(
    "protected publication",
  );
});
it("refuses changed hashes and newly referenced evidence before deleting anything", async () => {
  await file("data/cache/a.html", "a");
  await file("data/cache/b.html", "b");
  const plan = await createRetentionPlan({ projectRoot: root });
  await expect(
    applyRetentionPlan(plan, "0".repeat(64), { projectRoot: root }),
  ).rejects.toThrow("hash mismatch");
  await upsertListing({
    ...makeSeed()[0],
    id: "protected",
    sourceListingId: "protected",
    rawPayload: { cachedPage: "data/cache/b.html" },
  });
  await expect(
    applyRetentionPlan(plan, plan.sha256, { projectRoot: root }),
  ).rejects.toThrow("became protected");
  expect(await readFile(join(root, "data/cache/a.html"), "utf8")).toBe("a");
  const fresh = await createRetentionPlan({ projectRoot: root });
  await file("data/cache/a.html", "changed");
  await expect(
    applyRetentionPlan(fresh, fresh.sha256, { projectRoot: root }),
  ).rejects.toThrow("changed");
});
it("never follows symlinked files or swapped ancestors", async () => {
  const outside = join(directory, "outside.txt");
  await writeFile(outside, "never delete");
  await file("data/cache/a.html", "a");
  await symlink(outside, join(root, "data/cache/link.html"));
  const plan = await createRetentionPlan({ projectRoot: root });
  expect(plan.files.map((file) => file.path)).toEqual(["data/cache/a.html"]);
  expect(plan.warnings.join(" ")).toContain("Excluded symlink");
  await rename(join(root, "data/cache"), join(root, "data/moved"));
  await symlink(join(root, "data/moved"), join(root, "data/cache"));
  await expect(
    applyRetentionPlan(plan, plan.sha256, { projectRoot: root }),
  ).rejects.toThrow("became protected");
  expect(await readFile(outside, "utf8")).toBe("never delete");
  expect(await readFile(join(root, "data/moved/a.html"), "utf8")).toBe("a");
});
it("cannot approve a forged out-of-scope path, expired plan or active collection", async () => {
  await file("data/cache/a.html", "a");
  const plan = await createRetentionPlan({ projectRoot: root });
  const forged = {
    ...plan,
    files: [{ ...plan.files[0], path: "public/snapshot.json" }],
  };
  forged.sha256 = retentionPlanHash(forged);
  await expect(
    applyRetentionPlan(forged, forged.sha256, { projectRoot: root }),
  ).rejects.toThrow("became protected");
  const stale = { ...plan, createdAt: old.toISOString() };
  stale.sha256 = retentionPlanHash(stale);
  await expect(
    applyRetentionPlan(stale, stale.sha256, { projectRoot: root }),
  ).rejects.toThrow("expired");
  await db.jobLock.create({
    data: {
      key: "collector",
      owner: "live",
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  await expect(
    applyRetentionPlan(plan, plan.sha256, { projectRoot: root }),
  ).rejects.toThrow("Retention busy");
  expect(await db.jobLock.count()).toBe(1);
  expect(await readFile(join(root, "data/cache/a.html"), "utf8")).toBe("a");
});
it("keeps the newest verified backups and protects corrupt/unknown backup folders", async () => {
  for (let i = 0; i < 3; i++) {
    const backup = await backupBeforeRefresh(
      join(root, `data/backups/b${i}`),
      join(root, "absent.json"),
      { publicDirectory: join(root, "public") },
    );
    for (const name of [
      ...backup.files.map((file) => file.name),
      "manifest.json",
    ])
      await utimes(
        join(backup.directory, name),
        new Date(+old + i * 10000),
        new Date(+old + i * 10000),
      );
  }
  await file("data/backups/corrupt/manifest.json", "{}");
  await file(
    "data/backups/corrupt/boatscout.db",
    "corrupt but preserve evidence",
  );
  const plan = await createRetentionPlan({ projectRoot: root });
  expect(plan.verifiedBackupsProtected).toEqual([
    "data/backups/b2",
    "data/backups/b1",
  ]);
  expect(plan.files.length).toBeGreaterThan(0);
  expect(
    plan.files.every((file) => file.path.startsWith("data/backups/b0/")),
  ).toBe(true);
  await applyRetentionPlan(plan, plan.sha256, { projectRoot: root });
  expect(
    (await verifyBackup(join(root, "data/backups/b2"))).databaseIntegrity,
  ).toBe("ok");
  expect(
    await readFile(join(root, "data/backups/corrupt/boatscout.db"), "utf8"),
  ).toContain("preserve");
});
it("only prunes explicitly selected intermediate prices after a readable backup", async () => {
  await upsertListing({
    ...makeSeed()[0],
    id: "prices",
    sourceListingId: "prices",
    isSample: false,
  });
  await db.priceHistory.deleteMany();
  await db.priceHistory.createMany({
    data: [0, 1, 2, 3].map((i) => ({
      id: `price-${i}`,
      listingId: "prices",
      price: 30000 - i * 1000,
      at: new Date(+old + i * 1000),
    })),
  });
  expect(
    (await createRetentionPlan({ projectRoot: root })).priceHistory,
  ).toEqual([]);
  const plan = await createRetentionPlan({
    projectRoot: root,
    policy: { priceHistoryDays: 365 },
  });
  expect(plan.priceHistory.map((row) => row.id)).toEqual([
    "price-1",
    "price-2",
  ]);
  const result = await applyRetentionPlan(plan, plan.sha256, {
    projectRoot: root,
  });
  expect(result.priceHistoryDeleted).toBe(2);
  expect(
    (await db.priceHistory.findMany({ orderBy: { at: "asc" } })).map(
      (row) => row.id,
    ),
  ).toEqual(["price-0", "price-3"]);
  expect(
    (await verifyBackup(result.backupDirectory!)).tables.PriceHistory,
  ).toBe(4);
});
it("reports storage budgets without making protected files eligible", async () => {
  await file("logs/boatscout.log", "x".repeat(1048577));
  const plan = await createRetentionPlan({
    projectRoot: root,
    policy: { maximumManagedBytes: 1048576 },
  });
  expect(plan.files).toEqual([]);
  expect(plan.warnings.join(" ")).toContain("Protected or young files exceed");
});
it("checks nearest existing volume and rejects insufficient disk space before writes", async () => {
  const inspect = vi.fn(async () => ({
    bavail: 2,
    bsize: 100,
  })) as unknown as typeof import("node:fs/promises").statfs;
  await expect(
    assertDiskSpace(
      join(root, "not-created/file"),
      { minimumFreeBytes: 150, requiredBytes: 100 },
      inspect,
    ),
  ).rejects.toThrow("Insufficient free disk space");
  expect(
    await assertDiskSpace(
      root,
      { minimumFreeBytes: 100, requiredBytes: 50 },
      inspect,
    ),
  ).toMatchObject({ freeBytes: 200 });
  await expect(stat(join(root, "not-created"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
