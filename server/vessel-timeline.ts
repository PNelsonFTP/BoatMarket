import type {
  BoatGroup,
  Listing as ListingRow,
  VesselEvent,
} from "@prisma/client";
import { db } from "./db";
import type { DuplicateAd, VesselTimeline } from "../lib/duplicates";

export function resolveVesselAlias(id: string, vessels: BoatGroup[]) {
  const byId = new Map(vessels.map((v) => [v.id, v]));
  const visited = new Set<string>();
  while (byId.get(id)?.mergedIntoId) {
    if (visited.has(id))
      throw new Error("Vessel alias cycle; inspect identity history");
    visited.add(id);
    id = byId.get(id)!.mergedIntoId!;
  }
  return id;
}
function ad(row: ListingRow): DuplicateAd {
  const data = row.data as Record<string, unknown>;
  const specs = (data.specs ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    url: row.sourceUrl,
    price: row.price,
    status: row.status,
    vesselId: row.vesselId,
    location: [data.city, row.state].filter(Boolean).join(", "),
    hin: typeof specs.hin === "string" ? specs.hin : null,
  };
}
function eventDetail(event: VesselEvent) {
  const d = event.data as Record<string, unknown>;
  if (event.kind === "source-price")
    return `Source asking price: ${d.from == null ? "unknown" : `$${d.from}`} → ${d.to == null ? "unknown" : `$${d.to}`}`;
  if (event.kind === "source-status")
    return `Source status: ${d.from ?? "not previously observed"} → ${d.to ?? "unknown"}`;
  if (event.kind === "duplicate-review")
    return `${d.reviewedBy ?? "Local user"} reviewed ${d.leftId} / ${d.rightId}: ${d.decision}${d.note ? ` — ${String(d.note)}` : ""}`;
  if (event.kind === "identity-merged")
    return `Identity retained as an alias of ${d.mergedIntoId}`;
  if (event.kind === "identity-reactivated")
    return "Earlier vessel identity reactivated after separation";
  if (event.kind === "advertisement-left")
    return `Advertisement moved to ${d.movedTo}; retained here as historical evidence`;
  if (event.kind === "advertisement-joined")
    return `Advertisement joined from ${d.previousVesselId ?? "an unassigned identity"}`;
  return "Persistent research identity assigned; physical vessel identity remains subject to verification";
}

export async function getVesselTimeline(
  requestedId: string,
  offset = 0,
  limit = 200,
): Promise<VesselTimeline> {
  return db.$transaction(
    async (tx) => {
      const vessels = await tx.boatGroup.findMany();
      const listing = await tx.listing.findUnique({
        where: { id: requestedId },
      });
      const rawId = listing?.vesselId ?? requestedId;
      if (!vessels.some((v) => v.id === rawId))
        throw Object.assign(
          new Error(
            "Vessel identity not found; run the identity reindex for older imported ads",
          ),
          { statusCode: 404 },
        );
      const vesselId = resolveVesselAlias(rawId, vessels);
      const aliases = vessels
        .filter(
          (v) =>
            v.id !== vesselId && resolveVesselAlias(v.id, vessels) === vesselId,
        )
        .map((v) => v.id);
      const identities = [vesselId, ...aliases];
      const members = await tx.listing.findMany({
        where: { vesselId, isSample: false },
        orderBy: { id: "asc" },
      });
      const memberIds = members.map((l) => l.id);
      const events = await tx.vesselEvent.findMany({
        where: {
          OR: [
            { vesselId: { in: identities } },
            { listingId: { in: memberIds } },
          ],
        },
        orderBy: [{ at: "desc" }, { id: "desc" }],
      });
      const oldIds = [
        ...new Set(
          events
            .map((e) => e.listingId)
            .filter((id): id is string => !!id && !memberIds.includes(id)),
        ),
      ];
      const historical = await tx.listing.findMany({
        where: { id: { in: oldIds }, isSample: false },
        orderBy: { id: "asc" },
      });
      const rows = [...members, ...historical],
        byId = new Map(rows.map((r) => [r.id, r]));
      const eventRows: VesselTimeline["events"] = events.map((e) => ({
        id: e.id,
        at: e.at.toISOString(),
        kind: e.kind,
        listingId: e.listingId,
        source:
          typeof (e.data as Record<string, unknown>).source === "string"
            ? String((e.data as Record<string, unknown>).source)
            : e.listingId
              ? byId.get(e.listingId)?.source
              : undefined,
        detail: eventDetail(e),
        ...(e.kind === "source-price"
          ? {
              price:
                typeof (e.data as Record<string, unknown>).to === "number"
                  ? Number((e.data as Record<string, unknown>).to)
                  : null,
            }
          : {}),
      }));
      // Older price observations predate the event ledger and remain inspectable.
      // Former members contribute history only up to their last recorded departure.
      const prices = await tx.priceHistory.findMany({
        where: { listingId: { in: rows.map((r) => r.id) } },
        orderBy: { at: "desc" },
      });
      for (const price of prices) {
        if (!memberIds.includes(price.listingId)) {
          const left = events
            .filter(
              (e) =>
                e.listingId === price.listingId &&
                e.kind === "advertisement-left",
            )
            .map((e) => e.at.getTime());
          if (!left.length || price.at.getTime() > Math.max(...left)) continue;
        }
        if (
          eventRows.some(
            (e) =>
              e.kind === "source-price" &&
              e.listingId === price.listingId &&
              e.price === price.price &&
              Math.abs(Date.parse(e.at) - price.at.getTime()) < 1000,
          )
        )
          continue;
        eventRows.push({
          id: `price:${price.id}`,
          at: price.at.toISOString(),
          kind: "price-history",
          listingId: price.listingId,
          source: byId.get(price.listingId)?.source,
          price: price.price,
          detail: `Recorded source asking price: $${price.price.toLocaleString()}`,
        });
      }
      eventRows.sort(
        (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
      );
      return {
        requestedId,
        vesselId,
        aliases,
        identityBasis: vessels.find((v) => v.id === vesselId)!.reason,
        members: members.map(ad),
        historicalAds: historical.map(ad),
        totalEvents: eventRows.length,
        offset,
        limit,
        events: eventRows.slice(offset, offset + limit),
      };
    },
    { timeout: 60000 },
  );
}
