import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  archivePlanHash,
  createArchivePlan,
  packArchive,
  retireArchiveOriginals,
  restoreArchive,
  verifyArchive,
} from "../server/archive";
const databaseRows = vi.hoisted(() => ({ listings: [] as unknown[] }));
vi.mock("../server/db", () => ({
  db: {
    listing: { findMany: async () => databaseRows.listings },
    duplicateDecision: { findMany: async () => [] },
    vesselEvent: { findMany: async () => [] },
    locationOverrideEvent: { findMany: async () => [] },
  },
}));
vi.mock("../server/repository", () => ({
  acquireLock: vi.fn(async () => randomUUID()),
  releaseLock: vi.fn(async () => {}),
}));
vi.mock("../server/lease", () => ({
  startCollectorLease: () => ({
    checkpoint: async () => {},
    stop: async () => {},
  }),
}));
const directory = await mkdtemp(join(tmpdir(), "boatscout-archive-test-"));
let root: string;
beforeEach(async () => {
  databaseRows.listings = [];
  root = await mkdtemp(join(directory, "project-"));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function file(path: string, body = "captured historical fixture\n") {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
  return target;
}
const preview = (paths = ["data/refresh-2026-09-01/baseline.json"]) =>
  createArchivePlan({
    projectRoot: root,
    paths,
    runId: "old-refresh-123",
    purpose: "Reproduce the September audit",
  });
it("archives exact bytes with content-addressed objects and restores a reproducible audit without deleting originals", async () => {
  const original = await file(
    "data/refresh-2026-09-01/baseline.json",
    '{"listings":[{"id":"old"}]}\n',
  );
  await file(
    "data/refresh-2026-09-01/identical.json",
    await readFile(original, "utf8"),
  );
  const plan = await preview(["data/refresh-2026-09-01"]);
  expect(plan.origin).toEqual({
    revision: null,
    runId: "old-refresh-123",
    purpose: "Reproduce the September audit",
  });
  expect(plan.blockers).toEqual([]);
  const packed = await packArchive(plan, plan.sha256, { projectRoot: root });
  expect(packed).toMatchObject({
    copiedFiles: 2,
    uniqueObjects: 1,
    originalFilesRemoved: 0,
  });
  expect(await readFile(original, "utf8")).toContain("old");
  const destination = join(directory, `restore-${randomUUID()}`);
  const result = await restoreArchive(packed.directory, destination);
  expect(result).toMatchObject({
    files: 2,
    verified: true,
    originatingRunId: "old-refresh-123",
  });
  expect(await readFile(join(destination, plan.files[0].path))).toEqual(
    await readFile(original),
  );
  expect((await verifyArchive(packed.directory, destination)).plan.sha256).toBe(
    plan.sha256,
  );
  await expect(
    restoreArchive(packed.directory, destination),
  ).rejects.toMatchObject({ code: "EEXIST" });
});
it("includes ignored dated helpers and release/publication/backup references, refusing retirement while allowing a verified archive copy", async () => {
  const original = await file(
    "data/refresh-2026-09-01/baseline.json",
    '{"old":true}\n',
  );
  await file(
    "data/refresh-2026-10-01/reproduce.ts",
    'readFile("data/refresh-2026-09-01/baseline.json");',
  );
  const plan = await preview();
  expect(
    plan.references.references.some((reference) =>
      reference.path.endsWith("reproduce.ts"),
    ),
  ).toBe(true);
  expect(plan.blockers.join("\n")).toContain("Referenced by");
  const packed = await packArchive(plan, plan.sha256, { projectRoot: root });
  await expect(
    retireArchiveOriginals(packed.directory, plan.sha256, {
      projectRoot: root,
    }),
  ).rejects.toThrow("retirement blocked");
  expect(await readFile(original, "utf8")).toBe('{"old":true}\n');
});
it("fails closed for changed/forged/expired plans and corrupt objects, preserving originals", async () => {
  const original = await file("data/refresh-2026-09-01/baseline.json");
  const plan = await preview();
  await expect(
    packArchive(plan, "0".repeat(64), { projectRoot: root }),
  ).rejects.toThrow("hash mismatch");
  const expired = { ...plan, createdAt: "2020-01-01T00:00:00.000Z" };
  expired.sha256 = archivePlanHash(expired);
  await expect(
    packArchive(expired, expired.sha256, { projectRoot: root }),
  ).rejects.toThrow("expired");
  await writeFile(original, "changed");
  await expect(
    packArchive(plan, plan.sha256, { projectRoot: root }),
  ).rejects.toThrow("source changed");
  const fresh = await preview();
  const packed = await packArchive(fresh, fresh.sha256, { projectRoot: root });
  await writeFile(
    join(packed.directory, "objects", fresh.files[0].sha256),
    "corrupt",
  );
  await expect(verifyArchive(packed.directory)).rejects.toThrow(
    "Corrupt archive object",
  );
  await expect(
    retireArchiveOriginals(packed.directory, fresh.sha256, {
      projectRoot: root,
    }),
  ).rejects.toThrow("Corrupt archive object");
  expect(await readFile(original, "utf8")).toBe("changed");
});
it("rechecks references immediately before explicit retirement and never retires backup members or public generations", async () => {
  const original = await file("data/refresh-2026-09-01/baseline.json");
  const plan = await preview();
  const packed = await packArchive(plan, plan.sha256, { projectRoot: root });
  await file(
    "data/releases/older/review.json",
    JSON.stringify({ baseline: plan.files[0].path }),
  );
  await expect(
    retireArchiveOriginals(packed.directory, plan.sha256, {
      projectRoot: root,
    }),
  ).rejects.toThrow("Referenced by data/releases");
  expect(await stat(original)).toBeTruthy();
  await file("data/backups/old/manifest.json", '{"files":[]}');
  const backup = await preview(["data/backups/old"]);
  expect(backup.blockers.join("\n")).toContain("Backup bundle member");
  const backupCopy = await packArchive(backup, backup.sha256, {
    projectRoot: root,
  });
  await expect(
    retireArchiveOriginals(backupCopy.directory, backup.sha256, {
      projectRoot: root,
    }),
  ).rejects.toThrow("Backup bundle member");
  const generationHash = createHash("sha256").update("[]").digest("hex");
  const generation = `${generationHash}.json`;
  await file(`public/snapshots/${generation}`, "[]");
  await file(
    "public/data-mode.json",
    JSON.stringify({
      snapshot: true,
      path: `snapshots/${generation}`,
      sha256: generationHash,
    }),
  );
  await file(
    "data/publication/latest.json",
    JSON.stringify({ previous: { path: `snapshots/${generation}` } }),
  );
  const publicPlan = await preview([`public/snapshots/${generation}`]);
  expect(publicPlan.blockers.join("\n")).toContain("Active public pointer");
  expect(publicPlan.blockers.join("\n")).toContain(
    "data/publication/latest.json",
  );
  expect(publicPlan.blockers.join("\n")).toContain("direct-link retirement");
});
it("rejects symlinks, traversal, live data and mutated manifests", async () => {
  const outside = join(directory, "outside.txt");
  await writeFile(outside, "protected");
  await mkdir(join(root, "data/refresh-2026-09-01"), { recursive: true });
  await symlink(outside, join(root, "data/refresh-2026-09-01/linked.txt"));
  await expect(preview(["data/refresh-2026-09-01"])).rejects.toThrow("symlink");
  await expect(preview(["data/../outside.txt"])).rejects.toThrow(
    "Unsafe archive path",
  );
  await expect(preview(["data/boatscout.db"])).rejects.toThrow(
    "outside historical archive scope",
  );
  expect(await readFile(outside, "utf8")).toBe("protected");
});
it("requires explicit exact hash retirement and keeps an independently verified restore package and receipt", async () => {
  const original = await file("data/refresh-2026-09-01/baseline.json");
  const plan = await preview();
  const packed = await packArchive(plan, plan.sha256, { projectRoot: root });
  await expect(
    retireArchiveOriginals(packed.directory, "0".repeat(64), {
      projectRoot: root,
    }),
  ).rejects.toThrow("hash mismatch");
  expect(await stat(original)).toBeTruthy();
  const result = await retireArchiveOriginals(packed.directory, plan.sha256, {
    projectRoot: root,
  });
  expect(result.status).toBe("success");
  expect(result.removed).toEqual([plan.files[0].path]);
  await expect(stat(original)).rejects.toMatchObject({ code: "ENOENT" });
  expect(JSON.parse(await readFile(result.receiptPath, "utf8")).status).toBe(
    "success",
  );
  const restored = await restoreArchive(
    packed.directory,
    join(directory, `retired-restore-${randomUUID()}`),
  );
  expect(restored.verified).toBe(true);
});

it("checks database evidence under retirement leases and refuses newly referenced originals", async () => {
  const original = await file("data/refresh-2026-09-01/baseline.json");
  const plan = await preview();
  const packed = await packArchive(plan, plan.sha256, { projectRoot: root });
  databaseRows.listings = [{ data: { evidencePath: plan.files[0].path } }];
  await expect(
    retireArchiveOriginals(packed.directory, plan.sha256, {
      projectRoot: root,
    }),
  ).rejects.toThrow("Current database listing evidence references");
  expect(await readFile(original, "utf8")).toContain("captured historical");
});

it("detects manifest tampering, refuses newly unresolved symlink consumers and keeps private restore data out of public output", async () => {
  await file("data/refresh-2026-09-01/baseline.json");
  const outside = join(directory, `outside-${randomUUID()}.txt`);
  await writeFile(outside, "external consumer");
  await symlink(outside, join(root, "unknown-consumer.txt"));
  const plan = await preview();
  expect(plan.blockers.join("\n")).toContain("Reference scan refused symlink");
  const packed = await packArchive(plan, plan.sha256, { projectRoot: root });
  await expect(
    retireArchiveOriginals(packed.directory, plan.sha256, {
      projectRoot: root,
    }),
  ).rejects.toThrow("Reference scan refused symlink");
  await mkdir(join(root, "public"));
  await expect(
    restoreArchive(packed.directory, join(root, "public/private-restore")),
  ).rejects.toThrow("private historical material");
  const manifestPath = join(packed.directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.plan.origin.runId = "changed-run";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await expect(verifyArchive(packed.directory)).rejects.toThrow(
    "plan hash mismatch",
  );
});

it("requires an exact reviewed broken-direct-link policy for genuinely unreferenced public retirement, preserving active/previous and bundled references", async () => {
  const currentBody = '{"current":true}';
  const currentHash = createHash("sha256").update(currentBody).digest("hex");
  const oldBody = '{"historical":true}';
  const oldHash = createHash("sha256").update(oldBody).digest("hex");
  const currentPath = `public/snapshots/${currentHash}.json`,
    oldPath = `public/snapshots/${oldHash}.json`;
  await file(currentPath, currentBody);
  await file(oldPath, oldBody);
  await file(
    "public/data-mode.json",
    JSON.stringify({
      snapshot: true,
      path: currentPath.slice(7),
      sha256: currentHash,
    }),
  );
  const options = {
    projectRoot: root,
    paths: [oldPath],
    runId: "historical-review",
    purpose: "Explicit direct-link retirement policy",
  };
  const keep = await createArchivePlan(options);
  expect(keep.publicRetirement).toBe("keep-direct-links");
  expect(keep.blockers.join("\n")).toContain("Public direct-link retirement");
  const allowed = await createArchivePlan({
    ...options,
    publicRetirement: "allow-broken-direct-links",
  });
  expect(allowed.blockers).toEqual([]);
  const packed = await packArchive(allowed, allowed.sha256, {
    projectRoot: root,
  });
  await expect(
    retireArchiveOriginals(packed.directory, keep.sha256, {
      projectRoot: root,
    }),
  ).rejects.toThrow("hash mismatch");
  const result = await retireArchiveOriginals(
    packed.directory,
    allowed.sha256,
    { projectRoot: root },
  );
  expect(result.removed).toEqual([oldPath]);
  expect(await readFile(join(root, currentPath), "utf8")).toBe(currentBody);
  await file(oldPath, oldBody);
  await file(
    "data/publication/latest.json",
    JSON.stringify({ previous: { path: oldPath.slice(7), sha256: oldHash } }),
  );
  const previous = await createArchivePlan({
    ...options,
    publicRetirement: "allow-broken-direct-links",
  });
  expect(previous.blockers.join("\n")).toContain(
    "data/publication/latest.json",
  );
  const active = await createArchivePlan({
    ...options,
    paths: [currentPath],
    publicRetirement: "allow-broken-direct-links",
  });
  expect(active.blockers.join("\n")).toContain("Active public pointer");
  await file(
    "data/releases/old/review.json",
    JSON.stringify({ generation: oldPath }),
  );
  const bundled = await createArchivePlan({
    ...options,
    paths: [oldPath, "data/releases/old/review.json"],
    publicRetirement: "allow-broken-direct-links",
  });
  expect(bundled.blockers.join("\n")).toContain(
    "data/releases/old/review.json",
  );
});
