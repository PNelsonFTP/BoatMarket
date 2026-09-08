import type { Listing as ListingRow, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db";
import {
  duplicateEvidence,
  duplicateFingerprint,
  publishedContacts,
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
  DuplicateQueueFilters,
} from "../lib/duplicates";
import {
  canonicalImageIdentity,
  imageEvidenceMatch,
  type AuditedImageEvidence,
} from "../lib/image-identity";
import { distanceMiles } from "../lib/search";
import { LAKE_HOLIDAY } from "../lib/lake-holiday";
import { readImageEvidence } from "./image-evidence";
import { stabilizeVessels, persistVesselPlan } from "./vessel-identity";
import { getVesselTimeline } from "./vessel-timeline";

function listingFromRow(row: ListingRow): Listing {
  return listingSchema.parse({
    ...(row.data as object),
    id: row.id,
    groupId: row.groupId,
    vesselId: row.vesselId,
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
    leftFingerprint?: string | null;
    rightFingerprint?: string | null;
    evidence?: unknown;
  }[],
): DuplicatePairDecision[] {
  return rows
    .filter((r) => r.decision === "same" || r.decision === "different")
    .map((r) => ({
      leftId: r.leftId,
      rightId: r.rightId,
      decision: r.decision as "same" | "different",
      updatedAt: r.updatedAt.toISOString(),
      leftFingerprint: r.leftFingerprint,
      rightFingerprint: r.rightFingerprint,
      evidence: r.evidence,
    }));
}

async function applyPlan(
  tx: Prisma.TransactionClient,
  listings: Listing[],
  plan: DuplicateGroupPlan,
) {
  const stable = stabilizeVessels(
    listings,
    plan,
    await tx.boatGroup.findMany(),
  );
  await persistVesselPlan(tx, listings, stable);
  return stable;
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
          { vesselId: { in: [...wantedGroups] } },
          { identityHin: { in: [...wantedHins] } },
        ],
      },
    });
    if (!found.length) break;
    for (const row of found) {
      rows.set(row.id, row);
      if (row.groupId) wantedGroups.add(row.groupId);
      if (row.vesselId) wantedGroups.add(row.vesselId);
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
      const plan = stabilizeVessels(
        listings,
        planDuplicateGroups(listings, decisions),
        await tx.boatGroup.findMany(),
      );
      if (apply) {
        for (let i = 0; i < rows.length; i++) {
          const hin = normalizedHin(listings[i].specs.hin);
          if (rows[i].identityHin !== hin)
            await tx.listing.update({
              where: { id: rows[i].id },
              data: { identityHin: hin },
            });
        }
        await persistVesselPlan(tx, listings, plan);
      }
      return {
        applied: apply,
        vesselIdentities: plan.vessels.length,
        newVesselIdentities: listings.filter((l) => !l.vesselId).length,
        aliases: plan.aliases,
        ...report(listings, plan),
      };
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
    vesselId: listing.vesselId,
  };
}

/** Buckets limit comparisons without an arbitrary candidate cap. Every matching
 * HIN, make/model/year, title, and exact photo bucket is considered before paging.
 */
export function rankDuplicateCandidates(
  listings: Listing[],
  auditedImages: AuditedImageEvidence[] = [],
) {
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
    if (l.make && l.city && l.state)
      keys.push(
        `make-city:${normalizedIdentity(l.make)}:${normalizedIdentity(l.city)}:${l.state}`,
      );
    for (const contact of publishedContacts(l)) keys.push(`contact:${contact}`);
    keys.push(
      ...l.photos
        .map(canonicalImageIdentity)
        .filter(Boolean)
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
  const availableAudits = auditedImages.filter((i) =>
    byId.get(i.listingId)?.photos.includes(i.url),
  );
  for (let i = 0; i < availableAudits.length; i++)
    for (let j = i + 1; j < availableAudits.length; j++)
      if (imageEvidenceMatch(availableAudits[i], availableAudits[j]))
        pairs.add(
          pairKey(availableAudits[i].listingId, availableAudits[j].listingId),
        );
  return [...pairs]
    .flatMap((key) => {
      const [a, b] = JSON.parse(key) as string[];
      const left = byId.get(a)!,
        right = byId.get(b)!,
        evidence = duplicateEvidence(left, right, auditedImages);
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
  filters: DuplicateQueueFilters = {},
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
    decided = new Map(decisions.map((d) => [pairKey(d.leftId, d.rightId), d]));
  const changed = (d: DuplicatePairDecision) =>
    !d.leftFingerprint ||
    !d.rightFingerprint ||
    duplicateFingerprint(byId.get(d.leftId)!) !== d.leftFingerprint ||
    duplicateFingerprint(byId.get(d.rightId)!) !== d.rightFingerprint;
  const plan = planDuplicateGroups(listings, decisions);
  const auditedImages = await readImageEvidence();
  const ranked = rankDuplicateCandidates(listings, auditedImages);
  const pairs = new Set(ranked.map((p) => pairKey(p.left.id, p.right.id)));
  for (const d of decisions)
    if (
      byId.has(d.leftId) &&
      byId.has(d.rightId) &&
      !pairs.has(pairKey(d.leftId, d.rightId))
    ) {
      const left = byId.get(d.leftId)!,
        right = byId.get(d.rightId)!;
      ranked.push({
        left,
        right,
        evidence: duplicateEvidence(left, right, auditedImages) ?? {
          score: 0,
          reasons: [
            "Previously reviewed pair; current matching evidence is limited",
          ],
          conflicts: [],
          automatic: false,
          hinA: normalizedHin(left.specs.hin),
          hinB: normalizedHin(right.specs.hin),
        },
      });
    }
  const reference = {
    lat: filters.lat ?? LAKE_HOLIDAY.lat,
    lng: filters.lng ?? LAKE_HOLIDAY.lng,
  };
  const miles = (l: Listing) =>
    l.lat != null && l.lng != null
      ? distanceMiles(reference, { lat: l.lat, lng: l.lng })
      : null;
  const pairDistance = (p: { left: Listing; right: Listing }) =>
    Math.max(miles(p.left) ?? Infinity, miles(p.right) ?? Infinity);
  const suggestions = ranked
    .filter((p) => {
      const d = decided.get(pairKey(p.left.id, p.right.id));
      if (
        filters.activeOnly &&
        (p.left.status !== "active" || p.right.status !== "active")
      )
        return false;
      if (filters.radiusMiles != null && pairDistance(p) > filters.radiusMiles)
        return false;
      if (filters.reviewState === "changed") return !!d && changed(d);
      if (filters.reviewState === "all") return true;
      return !d && !(p.left.groupId && p.left.groupId === p.right.groupId);
    })
    .sort(
      (a, b) =>
        Number(b.left.status === "active" && b.right.status === "active") -
          Number(a.left.status === "active" && a.right.status === "active") ||
        Math.floor(pairDistance(a) / 25) - Math.floor(pairDistance(b) / 25) ||
        b.evidence.score - a.evidence.score ||
        pairKey(a.left.id, a.right.id).localeCompare(
          pairKey(b.left.id, b.right.id),
        ),
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
    filters,
    candidateTotal: suggestions.length,
    candidates: suggestions.slice(offset, offset + limit).map((p) => ({
      left: { ...ad(p.left), distance: miles(p.left) },
      right: { ...ad(p.right), distance: miles(p.right) },
      evidence: p.evidence,
      reviewedDecision: decided.get(pairKey(p.left.id, p.right.id))?.decision,
      changedSinceReview: decided.has(pairKey(p.left.id, p.right.id))
        ? changed(decided.get(pairKey(p.left.id, p.right.id))!)
        : false,
    })),
    groups,
    decisions: decisions
      .filter((d) => byId.has(d.leftId) && byId.has(d.rightId))
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .map((d) => ({
        ...d,
        changedSinceReview: changed(d),
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
      reviewedGroups: groups.filter((g) => g.reason.startsWith("Reviewed"))
        .length,
      hinGroups: groups.filter((g) => !g.reason.startsWith("Reviewed")).length,
    },
  };
}

export async function setDuplicateDecision(
  left: string,
  right: string,
  decision: "same" | "different" | "undo",
  options: { note?: string; reviewedBy?: string } = {},
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
      const prior = await tx.duplicateDecision.findUnique({
        where: { leftId_rightId: { leftId, rightId } },
      });
      const leftListing = listings.find((l) => l.id === leftId)!,
        rightListing = listings.find((l) => l.id === rightId)!;
      const evidence = {
        version: 1,
        reviewedBy: options.reviewedBy ?? "local-user",
        note: options.note ?? "",
        sourceObservations: [leftListing, rightListing].map((l) => ({
          id: l.id,
          url: l.sourceUrl,
          observedAt: l.lastSeenAt,
          hin: l.specs.hin ?? null,
        })),
        signals: duplicateEvidence(
          leftListing,
          rightListing,
          await readImageEvidence(),
        ),
      };
      const reviewData = {
        decision,
        leftFingerprint: duplicateFingerprint(leftListing),
        rightFingerprint: duplicateFingerprint(rightListing),
        evidence: JSON.parse(JSON.stringify(evidence)) as Prisma.InputJsonValue,
      };
      if (decision === "undo")
        await tx.duplicateDecision.deleteMany({ where: { leftId, rightId } });
      else
        await tx.duplicateDecision.upsert({
          where: { leftId_rightId: { leftId, rightId } },
          create: { leftId, rightId, ...reviewData },
          update: reviewData,
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
      const stable = await applyPlan(tx, listings, plan);
      if (decision !== "undo" || prior) {
        const vessels = new Set(
          [
            stable.vesselAssignments.get(leftId),
            stable.vesselAssignments.get(rightId),
          ].filter((id): id is string => !!id),
        );
        for (const vesselId of vessels)
          await tx.vesselEvent.create({
            data: {
              vesselId,
              kind: "duplicate-review",
              data: {
                leftId,
                rightId,
                decision,
                previousDecision: prior?.decision ?? null,
                ...evidence,
              } as Prisma.InputJsonValue,
            },
          });
      }
      return { ok: true, decision, ...report(listings, stable) };
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
        activeOnly: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => v === "true"),
        radiusMiles: z.coerce.number().positive().max(12500).optional(),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
        reviewState: z
          .enum(["unreviewed", "changed", "all"])
          .default("unreviewed"),
      })
      .parse(req.query);
    return getDuplicateReview(q.offset, q.limit, q);
  });
  app.post("/api/duplicates/decisions", async (req) => {
    const body = z
      .object({
        leftId: z.string().min(1).max(200),
        rightId: z.string().min(1).max(200),
        decision: z.enum(["same", "different", "undo"]),
        note: z.string().max(5000).optional(),
      })
      .strict()
      .parse(req.body);
    return setDuplicateDecision(body.leftId, body.rightId, body.decision, {
      note: body.note,
    });
  });
  app.get("/api/vessels/:id", async (req) => {
    const { id } = z
      .object({ id: z.string().min(1).max(200) })
      .parse(req.params);
    const q = z
      .object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      })
      .parse(req.query);
    return getVesselTimeline(id, q.offset, q.limit);
  });
}
