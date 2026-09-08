import { createHash } from "node:crypto";
import type { BoatGroup, Listing as ListingRow, Prisma } from "@prisma/client";
import type { Listing } from "../lib/types";
import type { DuplicateGroupPlan } from "./dedup";

export const initialVesselId = (listingId: string) =>
  `vessel_${createHash("sha256").update(`anchor:${listingId}`).digest("hex").slice(0, 24)}`;
export type StableVesselPlan = DuplicateGroupPlan & {
  vessels: {
    id: string;
    anchorListingId: string;
    memberIds: string[];
    reason: string;
  }[];
  vesselAssignments: Map<string, string>;
  aliases: { id: string; mergedIntoId: string }[];
};

/** A component keeps its anchored oldest active identity. Previously absorbed
 * identities can reactivate on a split; membership changes never delete IDs.
 */
export function stabilizeVessels(
  listings: Listing[],
  plan: DuplicateGroupPlan,
  existing: BoatGroup[],
): StableVesselPlan {
  const real = listings.filter((l) => !l.isSample);
  const byId = new Map(real.map((l) => [l.id, l]));
  const assigned = new Set(plan.groups.flatMap((g) => g.memberIds));
  const components = [
    ...plan.groups.map((g) => ({ memberIds: g.memberIds, reason: g.reason })),
    ...real
      .filter((l) => !assigned.has(l.id))
      .map((l) => ({
        memberIds: [l.id],
        reason: "Single advertisement; physical vessel identity is unverified",
      })),
  ].sort((a, b) => a.memberIds[0].localeCompare(b.memberIds[0]));
  const anchors = new Map(
    existing.map((v) => [
      v.id,
      v.anchorListingId ??
        real
          .filter((l) => l.vesselId === v.id || l.groupId === v.id)
          .map((l) => l.id)
          .sort()[0],
    ]),
  );
  const vesselAssignments = new Map<string, string>();
  const chosenIds = new Set<string>();
  const vessels = components.map((component) => {
    const ids = new Set(component.memberIds);
    const candidates = existing.filter(
      (v) =>
        !chosenIds.has(v.id) &&
        anchors.get(v.id) &&
        ids.has(anchors.get(v.id)!),
    );
    candidates.sort(
      (a, b) =>
        Number(!!a.retiredAt) - Number(!!b.retiredAt) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    const chosen = candidates[0];
    const anchorListingId = chosen
      ? anchors.get(chosen.id)!
      : [...ids].sort()[0];
    const id = chosen?.id ?? initialVesselId(anchorListingId);
    chosenIds.add(id);
    for (const member of ids) vesselAssignments.set(member, id);
    return {
      id,
      anchorListingId,
      memberIds: [...ids].sort(),
      reason: component.reason,
    };
  });
  const aliases = existing
    // Retired identities no longer have directly assigned ads. Their anchor must
    // still follow a later split; otherwise an old alias points at the wrong hull.
    .filter(
      (v) =>
        !chosenIds.has(v.id) &&
        !!anchors.get(v.id) &&
        vesselAssignments.has(anchors.get(v.id)!),
    )
    .flatMap((v) => {
      const anchor = anchors.get(v.id);
      const destination = anchor ? vesselAssignments.get(anchor) : undefined;
      return destination && destination !== v.id
        ? [{ id: v.id, mergedIntoId: destination }]
        : [];
    });
  const groups = vessels
    .filter((v) => v.memberIds.length > 1)
    .map(({ id, memberIds, reason }) => ({ id, memberIds, reason }));
  const assignments = new Map<string, string | null>(
    real.map((l) => [l.id, null]),
  );
  for (const g of groups)
    for (const id of g.memberIds) assignments.set(id, g.id);
  // Missing data must not silently produce identities for records outside this plan.
  for (const id of vesselAssignments.keys())
    if (!byId.has(id))
      throw new Error("Vessel plan refers to an unknown advertisement");
  return { ...plan, groups, assignments, vessels, vesselAssignments, aliases };
}

export async function ensureListingVessel(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const row = await tx.listing.findUniqueOrThrow({ where: { id } });
  if (row.isSample || row.vesselId) return row.vesselId;
  const vesselId = row.groupId ?? initialVesselId(id);
  await tx.boatGroup.upsert({
    where: { id: vesselId },
    create: {
      id: vesselId,
      anchorListingId: id,
      reason: "Single advertisement; physical vessel identity is unverified",
    },
    update: {},
  });
  await tx.listing.update({ where: { id }, data: { vesselId } });
  await tx.vesselEvent.create({
    data: {
      vesselId,
      listingId: id,
      kind: "identity-assigned",
      data: {
        source: row.source,
        sourceUrl: row.sourceUrl,
        note: "Persistent research identity assigned; not verification of a distinct physical boat",
      },
    },
  });
  return vesselId;
}

export async function persistVesselPlan(
  tx: Prisma.TransactionClient,
  listings: Listing[],
  plan: StableVesselPlan,
) {
  const old = new Map(listings.map((l) => [l.id, l]));
  const now = new Date();
  for (const vessel of plan.vessels) {
    const previous = await tx.boatGroup.findUnique({
      where: { id: vessel.id },
    });
    await tx.boatGroup.upsert({
      where: { id: vessel.id },
      create: {
        id: vessel.id,
        reason: vessel.reason,
        anchorListingId: vessel.anchorListingId,
      },
      update: {
        reason: vessel.reason,
        anchorListingId: vessel.anchorListingId,
        mergedIntoId: null,
        retiredAt: null,
      },
    });
    if (previous?.retiredAt)
      await tx.vesselEvent.create({
        data: {
          vesselId: vessel.id,
          kind: "identity-reactivated",
          data: { previousMergedIntoId: previous.mergedIntoId },
        },
      });
    for (const id of vessel.memberIds) {
      const prior = old.get(id)!;
      const groupId = plan.assignments.get(id) ?? null;
      if (prior.groupId !== groupId || prior.vesselId !== vessel.id)
        await tx.listing.update({
          where: { id },
          data: { groupId, vesselId: vessel.id },
        });
      if (prior.vesselId !== vessel.id) {
        if (prior.vesselId)
          await tx.vesselEvent.create({
            data: {
              vesselId: prior.vesselId,
              listingId: id,
              kind: "advertisement-left",
              at: now,
              data: {
                movedTo: vessel.id,
                source: prior.source,
                sourceUrl: prior.sourceUrl,
              },
            },
          });
        await tx.vesselEvent.create({
          data: {
            vesselId: vessel.id,
            listingId: id,
            kind: prior.vesselId ? "advertisement-joined" : "identity-assigned",
            at: now,
            data: {
              previousVesselId: prior.vesselId,
              source: prior.source,
              sourceUrl: prior.sourceUrl,
              reason: vessel.reason,
            },
          },
        });
      }
    }
  }
  for (const alias of plan.aliases) {
    const prior = await tx.boatGroup.findUniqueOrThrow({
      where: { id: alias.id },
    });
    await tx.boatGroup.update({
      where: { id: alias.id },
      data: { mergedIntoId: alias.mergedIntoId, retiredAt: now },
    });
    if (prior.mergedIntoId !== alias.mergedIntoId || !prior.retiredAt)
      await tx.vesselEvent.create({
        data: {
          vesselId: alias.id,
          kind: "identity-merged",
          at: now,
          data: { mergedIntoId: alias.mergedIntoId },
        },
      });
  }
}

function observationDate(value: unknown, fallback: string) {
  return new Date(
    typeof value === "string" && Number.isFinite(Date.parse(value))
      ? value
      : fallback,
  );
}
export async function recordVesselObservation(
  tx: Prisma.TransactionClient,
  id: string,
  old: ListingRow | null,
  listing: Listing,
) {
  const row = await tx.listing.findUniqueOrThrow({
    where: { id },
    select: { vesselId: true, isSample: true },
  });
  if (!row.vesselId || row.isSample) return;
  if (!old || old.status !== listing.status)
    await tx.vesselEvent.create({
      data: {
        vesselId: row.vesselId,
        listingId: id,
        kind: "source-status",
        at: observationDate(
          listing.specs.availabilityObservedAt,
          listing.lastSeenAt,
        ),
        data: {
          source: listing.source,
          from: old?.status ?? null,
          to: listing.status,
          sourceUrl: listing.sourceUrl,
          firstObservation: !old,
        },
      },
    });
  if (!old || old.price !== listing.price)
    await tx.vesselEvent.create({
      data: {
        vesselId: row.vesselId,
        listingId: id,
        kind: "source-price",
        at: observationDate(listing.specs.priceObservedAt, listing.lastSeenAt),
        data: {
          source: listing.source,
          from: old?.price ?? null,
          to: listing.price,
          sourceUrl: listing.sourceUrl,
          firstObservation: !old,
        },
      },
    });
}
