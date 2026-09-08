import {
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  expect,
  it,
  vi,
} from "vitest";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const faults = vi.hoisted(() => ({ audit: false }));
vi.mock("../server/refresh-report", async (loadOriginal) => {
  const actual =
    await loadOriginal<typeof import("../server/refresh-report")>();
  return {
    ...actual,
    atomicJson: async (target: string, value: unknown) => {
      if (faults.audit && (value as { state?: string })?.state === "committed")
        throw new Error("Fixture audit disk failure after commit");
      return actual.atomicJson(target, value);
    },
  };
});
const databaseDirectory = await mkdtemp(
  join(tmpdir(), "boatscout-publication-db-"),
);
process.env.DATABASE_URL = `file:${join(databaseDirectory, "test.db")}`;
const { db } = await import("../server/db");
const {
  activateSnapshot,
  readSnapshotActivation,
  readPublicSnapshotGeneration,
  rollbackSnapshot,
  withPublicationLease,
} = await import("../server/publication");
const { exportSnapshot, prepareSnapshot } =
  await import("../scripts/export-snapshot");
beforeAll(async () => {
  await writeFile(join(databaseDirectory, "test.db"), "");
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
  ).toBe(await realpath(join(databaseDirectory, "test.db")));
});
afterAll(async () => {
  await db.$disconnect();
  await rm(databaseDirectory, { recursive: true, force: true });
});
import { listingSchema } from "../lib/types";
let root = "";
beforeEach(async () => {
  faults.audit = false;
  await db.jobLock.deleteMany();
  root = await mkdtemp(join(tmpdir(), "boatscout-activation-"));
  vi.stubEnv("PUBLICATION_DIR", join(root, "markers"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
it("activates one verified generation and preserves it if a later activation fails before commit", async () => {
  const first = await activateSnapshot('{"listings":[]}', {
    publicDirectory: root,
    listings: 0,
    runId: "first",
  });
  await expect(
    activateSnapshot("second", {
      publicDirectory: root,
      listings: 1,
      beforeCommit: async () => {
        throw new Error("lost lease");
      },
    }),
  ).rejects.toThrow("lost lease");
  expect((await readSnapshotActivation("first", root))?.sha256).toBe(
    first.sha256,
  );
});
it("recovers a committed pointer even if its audit marker was still prepared and supports reviewed rollback", async () => {
  const first = await activateSnapshot("first", {
    publicDirectory: root,
    listings: 1,
    runId: "run",
  });
  await writeFile(
    join(root, "markers", first.id + ".json"),
    JSON.stringify({ ...first, state: "prepared", committedAt: null }),
  );
  expect(
    (await readSnapshotActivation("run", root))?.reconciledFromPointer,
  ).toBe(true);
  const second = await activateSnapshot("second", {
    publicDirectory: root,
    listings: 2,
  });
  await expect(
    rollbackSnapshot(first.id, {
      publicDirectory: root,
      expectedCurrentHash: first.sha256,
    }),
  ).rejects.toThrow("changed");
  await rollbackSnapshot(first.id, {
    publicDirectory: root,
    expectedCurrentHash: second.sha256,
  });
  expect((await readSnapshotActivation(undefined, root))?.sha256).toBe(
    first.sha256,
  );
});
it("strips private correction evidence and routing origins while restoring public source location", () => {
  const at = new Date().toISOString();
  const listing = listingSchema.parse({
    id: "one",
    source: "Dealer",
    sourceListingId: "one",
    sourceUrl: "https://dealer.example/one",
    title: "Boat",
    lat: 42,
    lng: -88,
    firstSeenAt: at,
    lastSeenAt: at,
    sourceLocation: {
      lat: 41,
      lng: -89,
      sellerLat: null,
      sellerLng: null,
      city: "Ottawa",
      state: "IL",
      observedAt: at,
    },
    locationOverride: {
      lat: 42,
      lng: -88,
      label: "Private storage",
      evidence: "Seller private driveway",
      reviewedAt: at,
      revision: 1,
    },
    routeEstimate: {
      status: "ready",
      provider: "private",
      providerUrl: "http://127.0.0.1:5000",
      origin: { lat: 40, lng: -87 },
      destination: { lat: 42, lng: -88 },
      computedAt: at,
      expiresAt: at,
      durationMinutes: 90,
    },
    fieldProvenance: {
      length: [
        {
          value: 20,
          source: "review",
          sourceUrl: "https://example.com",
          method: "review",
          observedAt: at,
          evidence: "private",
        },
      ],
    },
  });
  const output = prepareSnapshot([listing]);
  expect(output.listings[0].lat).toBe(41);
  expect(JSON.stringify(output)).not.toMatch(
    /Private storage|driveway|routeEstimate|locationOverride|sourceLocation|"review"/,
  );
});

it("serializes publishers and refuses a lost lease immediately before pointer commit", async () => {
  const first = await activateSnapshot("first", {
    publicDirectory: root,
    listings: 1,
  });
  await withPublicationLease(async () => {
    await expect(
      activateSnapshot("competing", { publicDirectory: root, listings: 1 }),
    ).rejects.toThrow("publication busy");
    await expect(
      rollbackSnapshot(first.id, {
        publicDirectory: root,
        expectedCurrentHash: first.sha256,
      }),
    ).rejects.toThrow("publication busy");
  });
  await expect(
    activateSnapshot("obsolete", {
      publicDirectory: root,
      listings: 1,
      beforeCommit: async () => {
        await db.jobLock.update({
          where: { key: "publication" },
          data: {
            owner: "successor",
            expiresAt: new Date(Date.now() + 600000),
          },
        });
      },
    }),
  ).rejects.toThrow("lease lost");
  expect((await readSnapshotActivation(undefined, root))?.sha256).toBe(
    first.sha256,
  );
  expect(
    (await db.jobLock.findUniqueOrThrow({ where: { key: "publication" } }))
      .owner,
  ).toBe("successor");
});
it("keeps the legacy website untouched if the first atomic activation cannot commit", async () => {
  const target = join(root, "snapshot.json");
  await writeFile(target, "original legacy snapshot");
  let checks = 0;
  await expect(
    exportSnapshot({
      publicDirectory: root,
      loadListings: async () => [
        listingSchema.parse({
          id: "one",
          source: "Fixture",
          sourceListingId: "one",
          sourceUrl: "https://example.com/one",
          title: "Boat",
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        }),
      ],
      beforeCommit: async () => {
        if (++checks === 2) throw new Error("Failed activation gate");
      },
    }),
  ).rejects.toThrow("Failed activation gate");
  expect(await readFile(target, "utf8")).toBe("original legacy snapshot");
  expect(await readSnapshotActivation(undefined, root)).toBeNull();
});
it("activates the reviewed in-memory candidate even if the compatibility alias is changed", async () => {
  const target = join(root, "snapshot.json");
  const result = await exportSnapshot({
    publicDirectory: root,
    loadListings: async () => [
      listingSchema.parse({
        id: "one",
        source: "Fixture",
        sourceListingId: "one",
        sourceUrl: "https://example.com/one",
        title: "Reviewed boat",
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      }),
    ],
    beforeCommit: async () => {
      await writeFile(target, "unrelated concurrent alias bytes");
    },
  });
  const activation = await readSnapshotActivation(undefined, root);
  expect(activation?.sha256).toBe(result.activation?.sha256);
  expect(
    JSON.parse(await readFile(join(root, activation!.path), "utf8")).listings[0]
      .title,
  ).toBe("Reviewed boat");
});

it("reports an already committed snapshot truthfully when its later audit write fails", async () => {
  faults.audit = true;
  const result = await activateSnapshot("committed bytes", {
    publicDirectory: root,
    listings: 1,
    runId: "audit-failure",
  });
  expect(result.state).toBe("committed");
  expect(result.auditError).toMatch(/after commit/);
  expect(await readSnapshotActivation("audit-failure", root)).toMatchObject({
    sha256: result.sha256,
    state: "committed",
    reconciledFromPointer: true,
  });
  expect(await db.jobLock.count()).toBe(0);
});

it("recognizes an imported checkout without fabricating local activation evidence", async () => {
  const original = await activateSnapshot('{"listings":[]}', {
    publicDirectory: root,
    listings: 0,
    runId: "original-local-run",
  });
  await rm(join(root, "markers"), { recursive: true });
  expect(await readPublicSnapshotGeneration(root)).toMatchObject({
    path: original.path,
    sha256: original.sha256,
    activationId: original.id,
  });
  expect(await readSnapshotActivation(undefined, root)).toMatchObject({
    state: "imported",
    id: original.id,
    runId: null,
    committedAt: null,
    createdAt: null,
    reconciledFromPointer: false,
  });
  expect(await readSnapshotActivation("original-local-run", root)).toBeNull();
  expect(await readSnapshotActivation("another-run", root)).toBeNull();
  await expect(
    readFile(join(root, "markers", `${original.id}.json`)),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(await db.jobLock.count()).toBe(0);
});

it("verifies imported public bytes and rejects malformed or mismatched public pointers", async () => {
  const original = await activateSnapshot("original public bytes", {
    publicDirectory: root,
    listings: 1,
  });
  await rm(join(root, "markers"), { recursive: true });
  await writeFile(join(root, original.path), "tampered public bytes");
  await expect(readSnapshotActivation(undefined, root)).rejects.toThrow(
    "generation hash mismatch",
  );
  await expect(readSnapshotActivation("unrelated-run", root)).rejects.toThrow(
    "generation hash mismatch",
  );
  await writeFile(
    join(root, "data-mode.json"),
    JSON.stringify({
      snapshot: true,
      path: "../private.json",
      sha256: original.sha256,
      activationId: original.id,
    }),
  );
  await expect(readSnapshotActivation(undefined, root)).rejects.toThrow(
    "Invalid public snapshot pointer",
  );
});

it("never treats a corrupt existing private marker as an imported snapshot", async () => {
  const original = await activateSnapshot("public bytes", {
    publicDirectory: root,
    listings: 1,
    runId: "known-run",
  });
  const marker = join(root, "markers", `${original.id}.json`);
  await writeFile(marker, "{broken JSON");
  await expect(readSnapshotActivation(undefined, root)).rejects.toThrow();
  await writeFile(
    marker,
    JSON.stringify({ ...original, sha256: "0".repeat(64) }),
  );
  await expect(readSnapshotActivation("unrelated-run", root)).rejects.toThrow(
    "does not match",
  );
  await writeFile(marker, JSON.stringify({ ...original, state: "imported" }));
  await expect(readSnapshotActivation(undefined, root)).rejects.toThrow();
});
