import type { BoatResult, Listing } from "./types";

export const ALERT_EVENT_TYPES = [
  "new-match",
  "price-drop",
  "price-change",
  "status-change",
  "no-longer-matches",
] as const;
export type AlertEventType = (typeof ALERT_EVENT_TYPES)[number];
export const DEFAULT_ALERT_EVENTS: AlertEventType[] = [
  "new-match",
  "price-change",
  "status-change",
];
export const ALERT_EVENT_LABELS: Record<AlertEventType, string> = {
  "new-match": "New matching boat",
  "price-drop": "Price drop",
  "price-change": "Any price change",
  "status-change": "Status change, including sold",
  "no-longer-matches": "No longer matches this search",
};
export type MatchObservation = {
  id: string;
  members: string[];
  title: string;
  url: string;
  price: number | null;
  status: Listing["status"];
};
export type MatchSnapshot = {
  version: 2;
  boats: Record<string, MatchObservation>;
};
export type SearchEvent = {
  kind: AlertEventType;
  listingId: string;
  listingIds: string[];
  title: string;
  url: string;
  previousPrice: number | null;
  price: number | null;
  previousStatus: string | null;
  status: string | null;
};
export function matchSnapshot(matches: BoatResult[]): MatchSnapshot {
  return {
    version: 2,
    boats: Object.fromEntries(
      matches.map((boat) => [
        boat.id,
        {
          id: boat.id,
          members: [
            ...new Set([boat.id, ...boat.sourceLinks.map((link) => link.id)]),
          ],
          title: boat.title,
          url: boat.sourceUrl,
          price: boat.price,
          status: boat.status,
        },
      ]),
    ),
  };
}
export function readMatchSnapshot(
  value: unknown,
  listings: Listing[],
): MatchSnapshot {
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    value.version === 2 &&
    "boats" in value &&
    typeof value.boats === "object"
  )
    return value as MatchSnapshot;
  const index = new Map(listings.map((listing) => [listing.id, listing]));
  const boats: Record<string, MatchObservation> = {};
  for (const [id, raw] of Object.entries(
    (value && typeof value === "object" ? value : {}) as Record<
      string,
      unknown
    >,
  )) {
    try {
      const pair = typeof raw === "string" ? JSON.parse(raw) : null;
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const listing = index.get(id);
      boats[id] = {
        id,
        members: [id],
        title: listing?.title ?? id,
        url: listing?.sourceUrl ?? "",
        price: typeof pair[0] === "number" ? pair[0] : null,
        status: pair[1],
      };
    } catch {
      /* An invalid old baseline must not invent a status change. */
    }
  }
  return { version: 2, boats };
}
export function searchEvents(
  previous: MatchSnapshot,
  next: MatchSnapshot,
  listings: Listing[],
  enabled: readonly AlertEventType[],
): SearchEvent[] {
  const events: SearchEvent[] = [];
  const used = new Set<string>();
  const previousBoats = Object.values(previous.boats);
  const add = (
    kind: AlertEventType,
    before: MatchObservation | undefined,
    after: MatchObservation | undefined,
  ) => {
    if (!enabled.includes(kind)) return;
    const boat = after ?? before!;
    events.push({
      kind,
      listingId: boat.id,
      listingIds: boat.members,
      title: boat.title,
      url: boat.url,
      previousPrice: before?.price ?? null,
      price: after?.price ?? null,
      previousStatus: before?.status ?? null,
      status: after?.status ?? null,
    });
  };
  for (const current of Object.values(next.boats)) {
    const before =
      previous.boats[current.id] ??
      previousBoats.find((old) =>
        old.members.some((id) => current.members.includes(id)),
      );
    if (!before) {
      add("new-match", undefined, current);
      continue;
    }
    for (const old of previousBoats)
      if (old.members.some((id) => current.members.includes(id)))
        used.add(old.id);
    if (before.price !== current.price) {
      if (
        before.price != null &&
        current.price != null &&
        current.price < before.price &&
        enabled.includes("price-drop")
      )
        add("price-drop", before, current);
      else add("price-change", before, current);
    }
    if (before.status !== current.status) add("status-change", before, current);
  }
  const index = new Map(listings.map((listing) => [listing.id, listing]));
  for (const before of previousBoats) {
    if (used.has(before.id)) continue;
    const remaining = before.members
      .map((id) => index.get(id))
      .filter((listing): listing is Listing => !!listing);
    const live =
      remaining.find((listing) => listing.id === before.id) ?? remaining[0];
    const after = live
      ? {
          id: live.id,
          members: before.members,
          title: live.title,
          url: live.sourceUrl,
          price: live.price,
          status: live.status,
        }
      : undefined;
    if (after && before.status !== after.status)
      add("status-change", before, after);
    add("no-longer-matches", before, after);
  }
  return events;
}
