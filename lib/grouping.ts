import type { BoatResult, Listing } from "./types";

/** Filtered records may select one ad from a larger group. The basis belongs to
 * the full available membership, never to whichever ad has the lowest price. */
export function groupingForMembers(
  members: Listing[],
): NonNullable<Listing["grouping"]> {
  const bases = new Set(members.map((l) => l.grouping?.basis ?? "unresolved"));
  const grouped =
    members.length > 1 &&
    members.every((l) => l.groupId && l.groupId === members[0].groupId);
  const basis = grouped && bases.size === 1 ? [...bases][0] : "unresolved";
  return {
    basis,
    totalAdvertisements: Math.max(
      members.length,
      ...members.map((l) => l.grouping?.totalAdvertisements ?? 1),
    ),
  };
}
export function summarizeGrouping(boats: BoatResult[]) {
  const counts = { reviewed: 0, hin: 0, unresolved: 0, total: boats.length };
  for (const boat of boats) counts[boat.grouping?.basis ?? "unresolved"]++;
  return counts;
}
