import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listingSchema } from "../lib/types";
import { exportSnapshot, prepareSnapshot } from "../scripts/export-snapshot";
let directory = "";
const listing = (extra: object = {}) =>
  listingSchema.parse({
    id: "real",
    source: "Dealer",
    sourceListingId: "real",
    sourceUrl: "https://example.com/boat",
    title: "A real boat",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "boatscout-snapshot-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
it("exports canonical real ads without raw captures or private workspace fields", () => {
  const snapshot = prepareSnapshot([
    {
      ...listing({
        rawPayload: { secret: "raw secret" },
        specs: {
          password: "secret",
          notes: "private note",
          lengthWarning: "Measured length required",
          detailsCheckedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      notes: "private workspace",
      favorites: ["real"],
      workspace: { private: true },
    },
    listing({ id: "sample", isSample: true }),
  ]);
  expect(snapshot.listings).toHaveLength(1);
  const serialized = JSON.stringify(snapshot);
  expect(serialized).not.toMatch(
    /rawPayload|secret|private workspace|private note|favorites/,
  );
  expect(snapshot.observationRange.newest).toBe("2026-01-01T00:00:00.000Z");
});
it("validates before replacing and backs up the previous snapshot", async () => {
  const target = join(directory, "snapshot.json");
  await writeFile(target, "previous good snapshot");
  const result = await exportSnapshot({
    target,
    loadListings: async () => [listing()],
    backupDirectory: join(directory, "backups"),
    updateMode: false,
  });
  expect(result.listings).toBe(1);
  expect(await readFile(result.backup!, "utf8")).toBe("previous good snapshot");
  expect(JSON.parse(await readFile(target, "utf8")).listings[0].id).toBe(
    "real",
  );
});
it("keeps the previous website on invalid, empty, credential-bearing or duplicate data", async () => {
  const target = join(directory, "snapshot.json");
  await writeFile(target, "previous good snapshot");
  for (const input of [
    [],
    [{ invalid: true }],
    [listing(), listing()],
    [listing({ sourceUrl: "https://user:password@example.com/boat" })],
  ]) {
    await expect(
      exportSnapshot({ target, loadListings: async () => input }),
    ).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe("previous good snapshot");
  }
});
it("cannot commit when ownership validation fails", async () => {
  const target = join(directory, "snapshot.json");
  await writeFile(target, "previous good snapshot");
  const beforeCommit = vi.fn(async () => {
    throw new Error("Lease lost");
  });
  await expect(
    exportSnapshot({
      target,
      loadListings: async () => [listing()],
      beforeCommit,
    }),
  ).rejects.toThrow("Lease lost");
  expect(await readFile(target, "utf8")).toBe("previous good snapshot");
});
it("labels explicit partial exports separately from generation and observation times", () => {
  const snapshot = prepareSnapshot([listing()], {
    provenance: {
      runId: "run",
      status: "partial",
      partial: true,
      collectionStartedAt: "2026-09-01T00:00:00.000Z",
      collectionCompletedAt: "2026-09-01T01:00:00.000Z",
    },
  });
  expect(snapshot.refresh).toMatchObject({ partial: true, status: "partial" });
});
