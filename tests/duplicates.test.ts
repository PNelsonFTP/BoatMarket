import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { makeSeed } from "../lib/seed";
import type { Listing } from "../lib/types";
import {
  duplicateEvidence,
  findDuplicate,
  normalizedHin,
  planDuplicateGroups,
} from "../server/dedup";

const directory = mkdtempSync(join(tmpdir(), "boatscout-duplicates-"));
process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
const { db } = await import("../server/db");
const { upsertListing, allListings } = await import("../server/repository");
const {
  getDuplicateReview,
  rankDuplicateCandidates,
  reindexDuplicates,
  setDuplicateDecision,
} = await import("../server/duplicates");
const HIN = "ABC12345A626",
  OTHER_HIN = "ABC12346A626";
function boat(id: string, changes: Partial<Listing> = {}): Listing {
  return {
    ...makeSeed()[0],
    id,
    source: "Dealer",
    sourceListingId: id,
    isSample: false,
    title: "2026 Lund Pro V 1875",
    make: "Lund",
    model: "Pro V 1875",
    year: 2026,
    city: "Wauconda",
    state: "IL",
    sellerName: "Local marine",
    photos: ["https://example.com/boat.jpg"],
    specs: {},
    groupId: null,
    ...changes,
  };
}
beforeAll(() => {
  writeFileSync(join(directory, "test.db"), "");
  const migrated = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, encoding: "utf8" },
  );
  if (migrated.status !== 0) throw new Error(migrated.stdout + migrated.stderr);
});
beforeEach(async () => {
  await db.listing.deleteMany();
  await db.boatGroup.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

describe("conservative vessel identity", () => {
  it("normalizes modern HIN structure and an explicit US prefix without inventing identifiers", () => {
    expect(normalizedHin(" US-abc12345a626 ")).toBe(HIN);
    expect(normalizedHin("ABC 12345 A626")).toBe(HIN);
    expect(normalizedHin("CA-ABC12345A626")).toBeNull();
    expect(normalizedHin("ABC1234IA626")).toBeNull();
    expect(normalizedHin("ABC12345M86A")).toBeNull();
    expect(normalizedHin("Boat HIN: ABC12345A626")).toBeNull();
    expect(normalizedHin("ABC12345A626999")).toBeNull();
  });
  it("matches HIN despite make/model/year differences and includes same-source ads", () => {
    const a = boat("a", { specs: { hin: HIN } });
    const b = boat("b", {
      make: "LUND BOATS",
      model: "1875 Pro-V",
      year: 2025,
      specs: { hin: `US-${HIN}` },
    });
    expect(findDuplicate(a, [b])?.id).toBe("b");
    expect(duplicateEvidence(a, b)?.conflicts).toContain(
      "Reported model years differ",
    );
  });
  it("offers same-source reposts for review but never merges stock photos/specs with conflicting HINs", () => {
    const a = boat("a"),
      b = boat("b");
    expect(rankDuplicateCandidates([a, b])).toHaveLength(1);
    expect(findDuplicate(a, [b])).toBeUndefined();
    const stockA = { ...a, specs: { hin: HIN } },
      stockB = { ...b, specs: { hin: OTHER_HIN } };
    expect(duplicateEvidence(stockA, stockB)?.conflicts).toContain(
      "Different modern-format HINs",
    );
    expect(findDuplicate(stockA, [stockB])).toBeUndefined();
  });
  it("checks HIN conflicts and reviewed separations across every member of a proposed group", () => {
    const boats = [
      boat("a", { specs: { hin: HIN } }),
      boat("b"),
      boat("c", { specs: { hin: OTHER_HIN } }),
    ];
    const plan = planDuplicateGroups(boats, [
      { leftId: "a", rightId: "b", decision: "same" },
      { leftId: "b", rightId: "c", decision: "same" },
    ]);
    expect(plan.groups.map((g) => g.memberIds)).toEqual([["a", "b"]]);
    expect(plan.conflicts[0].reason).toContain("Different modern-format HINs");
    const reviewed = planDuplicateGroups(
      boats.map((b) => ({ ...b, specs: {} })),
      [
        { leftId: "a", rightId: "b", decision: "same" },
        { leftId: "b", rightId: "c", decision: "same" },
        { leftId: "a", rightId: "c", decision: "different" },
      ],
    );
    expect(reviewed.assignments.get("a")).not.toBe(
      reviewed.assignments.get("c"),
    );
    expect(reviewed.conflicts[0].reason).toContain("different-vessel decision");
  });
});

describe("durable duplicate review", () => {
  it("finds automatic matches without metadata prefilters, and a different decision survives collection", async () => {
    const a = boat("a", { specs: { hin: HIN } });
    const b = boat("b", {
      make: "LUND BOATS",
      model: "1875 Pro-V",
      year: 2025,
      specs: { hin: `US-${HIN}` },
    });
    await upsertListing(a, { dedupe: true });
    await upsertListing(b, { dedupe: true });
    let ads = await allListings();
    expect(ads[0].groupId).toBeTruthy();
    expect(ads[0].groupId).toBe(ads[1].groupId);
    await setDuplicateDecision("b", "a", "different");
    await upsertListing({ ...b, price: 31000 }, { dedupe: true });
    ads = await allListings();
    expect(ads.map((l) => l.groupId)).toEqual([null, null]);
    expect(await db.duplicateDecision.count()).toBe(1);
    await setDuplicateDecision("a", "b", "undo");
    ads = await allListings();
    expect(ads[0].groupId).toBe(ads[1].groupId);
    expect(ads[0].groupId).toBeTruthy();
  });
  it("merge and undo preserve IDs, links, all price observations, favorites and notes", async () => {
    await upsertListing(boat("a"), { dedupe: true });
    await upsertListing(
      boat("b", {
        source: "Craigslist",
        sourceUrl: "https://example.com/second",
      }),
      { dedupe: true },
    );
    await db.user.create({
      data: {
        id: "local",
        favorites: { create: [{ listingId: "a" }, { listingId: "b" }] },
        notes: {
          create: [
            { listingId: "a", text: "First seller" },
            { listingId: "b", text: "Second seller" },
          ],
        },
      },
    });
    const before = await allListings();
    const histories = await db.priceHistory.count();
    await setDuplicateDecision("a", "b", "same");
    expect((await getDuplicateReview()).groups[0].members).toHaveLength(2);
    const group = (await allListings())[0].groupId;
    await reindexDuplicates(true);
    expect((await allListings())[0].groupId).toBe(group);
    await setDuplicateDecision("a", "b", "undo");
    expect(await allListings()).toEqual(before);
    expect(await db.priceHistory.count()).toBe(histories);
    expect(await db.favorite.count()).toBe(2);
    expect(
      (await db.note.findMany({ orderBy: { listingId: "asc" } })).map(
        (n) => n.text,
      ),
    ).toEqual(["First seller", "Second seller"]);
  });
  it("rejects a transitive reviewed conflict atomically and splits on a later conflicting HIN observation", async () => {
    for (const id of ["a", "b", "c"])
      await upsertListing(boat(id), { dedupe: true });
    await setDuplicateDecision("a", "b", "same");
    await setDuplicateDecision("a", "c", "different");
    await expect(setDuplicateDecision("b", "c", "same")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(await db.duplicateDecision.count()).toBe(2);
    await upsertListing(boat("a", { specs: { hin: HIN } }), { dedupe: true });
    await upsertListing(boat("b", { specs: { hin: OTHER_HIN } }), {
      dedupe: true,
    });
    expect((await allListings()).filter((l) => l.groupId != null)).toHaveLength(
      0,
    );
    expect(
      (await getDuplicateReview()).decisions.find((d) => d.decision === "same")
        ?.conflict,
    ).toContain("Different modern-format HINs");
  });
  it("dry-run never changes records; apply reindexes preexisting records deterministically", async () => {
    await upsertListing(boat("a", { specs: { hin: HIN } }));
    await upsertListing(
      boat("b", { source: "Other", make: "LUND", specs: { hin: HIN } }),
    );
    await db.listing.updateMany({ data: { identityHin: null } });
    const preview = await reindexDuplicates();
    expect(preview).toMatchObject({
      applied: false,
      groupedAds: 2,
      groups: 1,
      changedAssignments: 2,
    });
    expect(await db.boatGroup.count()).toBe(0);
    expect(await db.listing.count({ where: { identityHin: null } })).toBe(2);
    const applied = await reindexDuplicates(true);
    const repeated = await reindexDuplicates(true);
    expect(repeated.proposedGroups).toEqual(applied.proposedGroups);
    expect(repeated.changedAssignments).toBe(0);
    expect(await db.listing.count({ where: { identityHin: HIN } })).toBe(2);
  });
});
