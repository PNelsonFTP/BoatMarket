import type { Listing as ListingRow, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db";
import {
  duplicateEvidence,
  normalizedHin,
  normalizedIdentity,
  pairKey,
  planDuplicateGroups,
  type DuplicateGroupPlan,
} from "./dedup";
import { listingSchema, type Listing } from "../lib/types";
import type {
  DuplicateAd,
  DuplicatePairDecision,
  DuplicateReviewData,
} from "../lib/duplicates";

function listingFromRow(row: ListingRow): Listing {
  return listingSchema.parse({
    ...(row.data as object),
    id: row.id,
    groupId: row.groupId,
    status: row.status,
    price: row.price,
    isSample: row.isSample,
  });
}
function decisionsFromRows(
  rows: {
    leftId: string;
    rightId: string;
    decision: string;
    updatedAt: Date;
  }[],
): DuplicatePairDecision[] {
  return rows
    .filter((r) => r.decision === "same" || r.decision === "different")
    .map((r) => ({
      leftId: r.leftId,
      rightId: r.rightId,
      decision: r.decision as "same" | "different",
      updatedAt: r.updatedAt.toISOString(),
    }));
}

async function applyPlan(
  tx: Prisma.TransactionClient,
  listings: Listing[],
  plan: DuplicateGroupPlan,
) {
  const old = new Map(listings.map((l) => [l.id, l.groupId]));
  for (const group of plan.groups) {
    await tx.boatGroup.upsert({
      where: { id: group.id },
      create: { id: group.id, reason: group.reason },
      update: { reason: group.reason },
    });
    const changed = group.memberIds.filter((id) => old.get(id) !== group.id);
    if (changed.length)
      await tx.listing.updateMany({
        where: { id: { in: changed } },
        data: { groupId: group.id },
      });
  }
  const singles = [...plan.assignments]
    .filter(([id, group]) => group === null && old.get(id) !== null)
    .map(([id]) => id);
  if (singles.length)
    await tx.listing.updateMany({
      where: { id: { in: singles } },
      data: { groupId: null },
    });
  await tx.boatGroup.deleteMany({ where: { listings: { none: {} } } });
}

/** Reconcile only the connected identity neighborhood after an upsert. Indexed HIN
 * discovery is independent of spelling, year, marketplace, and existing group IDs.
 */
export async function reconcileListingDuplicates(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const rows = new Map<string, ListingRow>();
  const wantedIds = new Set([id]),
    wantedGroups = new Set<string>(),
    wantedHins = new Set<string>();
  while (true) {
    const found = await tx.listing.findMany({
      where: {
        isSample: false,
        id: { notIn: [...rows.keys()] },
        OR: [
          { id: { in: [...wantedIds] } },
          { groupId: { in: [...wantedGroups] } },
          { identityHin: { in: [...wantedHins] } },
        ],
      },
    });
    if (!found.length) break;
    for (const row of found) {
      rows.set(row.id, row);
      if (row.groupId) wantedGroups.add(row.groupId);
      if (row.identityHin) wantedHins.add(row.identityHin);
    }
    const links = await tx.duplicateDecision.findMany({
      where: {
        decision: "same",
        OR: [
          { leftId: { in: [...rows.keys()] } },
          { rightId: { in: [...rows.keys()] } },
        ],
      },
    });
    for (const link of links) {
      wantedIds.add(link.leftId);
      wantedIds.add(link.rightId);
    }
  }
  const listings = [...rows.values()].map(listingFromRow);
  const ids = [...rows.keys()];
  const decisions = decisionsFromRows(
    await tx.duplicateDecision.findMany({
      where: { leftId: { in: ids }, rightId: { in: ids } },
    }),
  );
  await applyPlan(tx, listings, planDuplicateGroups(listings, decisions));
}

function report(listings: Listing[], plan: DuplicateGroupPlan) {
  return {
    advertisements: listings.length,
    groups: plan.groups.length,
    groupedAds: plan.groups.reduce((sum, g) => sum + g.memberIds.length, 0),
    changedAssignments: listings.filter(
      (l) => l.groupId !== plan.assignments.get(l.id),
    ).length,
    conflicts: plan.conflicts,
    proposedGroups: plan.groups,
  };
}

/** Dry-run is the default. Applying never deletes ads, prices, favorites, or notes. */
export async function reindexDuplicates(apply = false) {
  return db.$transaction(
    async (tx) => {
      const rows = await tx.listing.findMany({
        where: { isSample: false },
        orderBy: { id: "asc" },
      });
      const listings = rows.map(listingFromRow);
      const decisions = decisionsFromRows(
        await tx.duplicateDecision.findMany(),
      );
      const plan = planDuplicateGroups(listings, decisions);
      if (apply) {
        for (let i = 0; i < rows.length; i++) {
          const hin = normalizedHin(listings[i].specs.hin);
          if (rows[i].identityHin !== hin)
            await tx.listing.update({
              where: { id: rows[i].id },
              data: { identityHin: hin },
            });
        }
        await applyPlan(tx, listings, plan);
      }
      return { applied: apply, ...report(listings, plan) };
    },
    { timeout: 60000 },
  );
}

function ad(listing: Listing): DuplicateAd {
  return {
    id: listing.id,
    title: listing.title,
    source: listing.source,
    url: listing.sourceUrl,
    price: listing.price,
    location: [listing.city, listing.state].filter(Boolean).join(", "),
    hin: typeof listing.specs.hin === "string" ? listing.specs.hin : null,
    status: listing.status,
  };
}

/** Buckets limit comparisons without an arbitrary candidate cap. Every matching
 * HIN, make/model/year, title, and exact photo bucket is considered before paging.
 */
export function rankDuplicateCandidates(listings: Listing[]) {
  const boats = listings
    .filter((l) => !l.isSample)
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(boats.map((l) => [l.id, l]));
  const buckets = new Map<string, string[]>();
  for (const l of boats) {
    const hin = normalizedHin(l.specs.hin),
      keys: string[] = [];
    if (hin) keys.push(`hin:${hin}`);
    if (l.make && l.model && l.year)
      keys.push(
        `model:${normalizedIdentity(l.make)}:${normalizedIdentity(l.model)}:${l.year}`,
      );
    if (l.title.length >= 12) keys.push(`title:${normalizedIdentity(l.title)}`);
    keys.push(
      ...l.photos
        .filter((p) => /^https?:\/\//.test(p))
        .map((p) => `photo:${p}`),
    );
    for (const key of new Set(keys))
      buckets.set(key, [...(buckets.get(key) ?? []), l.id]);
  }
  const pairs = new Set<string>();
  for (const ids of buckets.values())
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        pairs.add(pairKey(ids[i], ids[j]));
  return [...pairs]
    .flatMap((key) => {
      const [a, b] = JSON.parse(key) as string[];
      const left = byId.get(a)!,
        right = byId.get(b)!,
        evidence = duplicateEvidence(left, right);
      return evidence ? [{ left, right, evidence }] : [];
    })
    .sort(
      (a, b) =>
        Number(a.evidence.conflicts.includes("Different modern-format HINs")) -
          Number(
            b.evidence.conflicts.includes("Different modern-format HINs"),
          ) ||
        b.evidence.score - a.evidence.score ||
        pairKey(a.left.id, a.right.id).localeCompare(
          pairKey(b.left.id, b.right.id),
        ),
    );
}

export async function getDuplicateReview(
  offset = 0,
  limit = 25,
): Promise<DuplicateReviewData> {
  const state = await db.$transaction(async (tx) => ({
    rows: await tx.listing.findMany({
      where: { isSample: false },
      orderBy: { id: "asc" },
    }),
    decisions: await tx.duplicateDecision.findMany(),
    groups: await tx.boatGroup.findMany(),
  }));
  const listings = state.rows.map(listingFromRow),
    byId = new Map(listings.map((l) => [l.id, l]));
  const decisions = decisionsFromRows(state.decisions),
    decided = new Set(decisions.map((d) => pairKey(d.leftId, d.rightId)));
  const plan = planDuplicateGroups(listings, decisions);
  const suggestions = rankDuplicateCandidates(listings).filter(
    (p) =>
      !decided.has(pairKey(p.left.id, p.right.id)) &&
      !(p.left.groupId && p.left.groupId === p.right.groupId),
  );
  const groups = state.groups
    .map((g) => ({
      id: g.id,
      reason: g.reason,
      members: listings.filter((l) => l.groupId === g.id).map(ad),
    }))
    .filter((g) => g.members.length > 1);
  const groupedAds = groups.reduce((sum, g) => sum + g.members.length, 0);
  return {
    generatedAt: new Date().toISOString(),
    offset,
    limit,
    candidateTotal: suggestions.length,
    candidates: suggestions
      .slice(offset, offset + limit)
      .map((p) => ({
        left: ad(p.left),
        right: ad(p.right),
        evidence: p.evidence,
      })),
    groups,
    decisions: decisions
      .filter((d) => byId.has(d.leftId) && byId.has(d.rightId))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .map((d) => ({
        ...d,
        left: ad(byId.get(d.leftId)!),
        right: ad(byId.get(d.rightId)!),
        conflict: plan.conflicts.find(
          (c) => pairKey(c.leftId, c.rightId) === pairKey(d.leftId, d.rightId),
        )?.reason,
      })),
    counts: {
      advertisements: listings.length,
      groupedAds,
      groups: groups.length,
      displayUnits: listings.length - groupedAds + groups.length,
    },
  };
}

export async function setDuplicateDecision(
  left: string,
  right: string,
  decision: "same" | "different" | "undo",
) {
  if (left === right)
    throw Object.assign(new Error("Choose two different advertisements"), {
      statusCode: 400,
    });
  const [leftId, rightId] = [left, right].sort();
  return db.$transaction(
    async (tx) => {
      const rows = await tx.listing.findMany({ where: { isSample: false } }),
        listings = rows.map(listingFromRow);
      if (![leftId, rightId].every((id) => listings.some((l) => l.id === id)))
        throw Object.assign(
          new Error(
            "Both advertisements must exist in the collected inventory",
          ),
          { statusCode: 404 },
        );
      const before = planDuplicateGroups(
        listings,
        decisionsFromRows(await tx.duplicateDecision.findMany()),
      );
      if (decision === "undo")
        await tx.duplicateDecision.deleteMany({ where: { leftId, rightId } });
      else
        await tx.duplicateDecision.upsert({
          where: { leftId_rightId: { leftId, rightId } },
          create: { leftId, rightId, decision },
          update: { decision },
        });
      const plan = planDuplicateGroups(
        listings,
        decisionsFromRows(await tx.duplicateDecision.findMany()),
      );
      const existingConflicts = new Set(
        before.conflicts.map((c) => pairKey(c.leftId, c.rightId)),
      );
      const newConflict = plan.conflicts.find(
        (c) =>
          !existingConflicts.has(pairKey(c.leftId, c.rightId)) ||
          pairKey(c.leftId, c.rightId) === pairKey(leftId, rightId),
      );
      if (decision === "same" && newConflict)
        throw Object.assign(
          new Error(
            `${newConflict.reason}. Review or undo the conflicting decision before combining these ads.`,
          ),
          { statusCode: 409 },
        );
      await applyPlan(tx, listings, plan);
      return { ok: true, decision, ...report(listings, plan) };
    },
    { timeout: 60000 },
  );
}

export function registerDuplicateRoutes(app: FastifyInstance) {
  app.get("/api/duplicates", async (req) => {
    const q = z
      .object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(req.query);
    return getDuplicateReview(q.offset, q.limit);
  });
  app.post("/api/duplicates/decisions", async (req) => {
    const body = z
      .object({
        leftId: z.string().min(1).max(200),
        rightId: z.string().min(1).max(200),
        decision: z.enum(["same", "different", "undo"]),
      })
      .strict()
      .parse(req.body);
    return setDuplicateDecision(body.leftId, body.rightId, body.decision);
  });
}
