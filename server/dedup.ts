import { createHash } from "node:crypto";
import type { Listing } from "../lib/types";
import type {
  DuplicateEvidence,
  DuplicatePairDecision,
} from "../lib/duplicates";

export const normalizedIdentity = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Modern US HIN structure, not MIC registration or seller authenticity verification.
 * 33 CFR 181.25 / 181.27: only an explicit US country prefix is removed.
 * Legacy/nonstandard identifiers remain available in specs for human review.
 */
export function normalizedHin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let hin = value.trim().toUpperCase();
  if (/^US[-\s]/.test(hin)) hin = hin.replace(/^US[-\s]+/, "");
  hin = hin.replace(/[\s-]/g, "");
  return /^[A-Z]{3}[A-HJ-NPR-Z0-9]{5}[A-L][0-9]{3}$/.test(hin) ? hin : null;
}

export function pairKey(left: string, right: string) {
  return JSON.stringify([left, right].sort());
}

function meaningfulPhoto(photo: string) {
  return (
    /^https?:\/\//.test(photo) &&
    !/placeholder|no[-_]?image|stock[-_]?photo|logo/i.test(photo)
  );
}

export function duplicateEvidence(
  a: Listing,
  b: Listing,
): DuplicateEvidence | null {
  if (a.id === b.id || a.isSample || b.isSample) return null;
  const hinA = normalizedHin(a.specs.hin),
    hinB = normalizedHin(b.specs.hin);
  const conflicts: string[] = [],
    reasons: string[] = [];
  let score = 0;
  const hinMatch = !!hinA && hinA === hinB;
  if (hinA && hinB && hinA !== hinB)
    conflicts.push("Different modern-format HINs");
  if (hinMatch) {
    score += 100;
    reasons.push("Matching modern-format HIN");
  } else if (
    !hinA &&
    !hinB &&
    normalizedIdentity(a.specs.hin).length >= 8 &&
    normalizedIdentity(a.specs.hin) === normalizedIdentity(b.specs.hin)
  ) {
    score += 25;
    reasons.push("Matching nonstandard identifier; verify its format");
  }
  const make =
    !!a.make && normalizedIdentity(a.make) === normalizedIdentity(b.make);
  const model =
    !!a.model && normalizedIdentity(a.model) === normalizedIdentity(b.model);
  const year = a.year != null && a.year === b.year;
  const title =
    normalizedIdentity(a.title).length >= 12 &&
    normalizedIdentity(a.title) === normalizedIdentity(b.title);
  const photo = a.photos.some(
    (p) => meaningfulPhoto(p) && b.photos.includes(p),
  );
  const seller =
    !!a.sellerName &&
    normalizedIdentity(a.sellerName).length >= 4 &&
    normalizedIdentity(a.sellerName) === normalizedIdentity(b.sellerName);
  const city =
    !!a.city &&
    !!a.state &&
    normalizedIdentity(a.city) === normalizedIdentity(b.city) &&
    a.state === b.state;
  const price = a.price != null && a.price > 0 && a.price === b.price;
  if (make && model) {
    score += 25;
    reasons.push("Same normalized make and model");
  }
  if (year) {
    score += 10;
    reasons.push("Same reported model year");
  }
  if (title) {
    score += 12;
    reasons.push("Same normalized title");
  }
  if (photo) {
    score += 30;
    reasons.push("Exact shared photo URL; could be stock photography");
  }
  if (seller) {
    score += 15;
    reasons.push("Same reported seller name");
  }
  if (city) {
    score += 10;
    reasons.push("Same reported city and state");
  }
  if (price) {
    score += 8;
    reasons.push("Same asking price");
  }
  if (
    a.length != null &&
    b.length != null &&
    Math.abs(a.length - b.length) < 0.25
  ) {
    score += 5;
    reasons.push("Similar reported length");
  }
  if (
    a.horsepower != null &&
    a.horsepower > 0 &&
    a.horsepower === b.horsepower
  ) {
    score += 5;
    reasons.push("Same reported horsepower");
  }
  if (a.year != null && b.year != null && a.year !== b.year)
    conflicts.push("Reported model years differ");
  if (a.make && b.make && !make) conflicts.push("Reported makes differ");
  if (a.source === b.source && reasons.length)
    reasons.push(
      "Separate ads on the same source; possible repost or separate stock",
    );
  // Title/price alone never creates a suggestion, much less an automatic group.
  const plausible =
    hinMatch ||
    (photo && (make || title)) ||
    (make && model && year && (city || seller)) ||
    (title && city && price);
  if (!plausible || score < 45) return null;
  return {
    score,
    reasons,
    conflicts,
    automatic: hinMatch && !conflicts.includes("Different modern-format HINs"),
    hinA,
    hinB,
  };
}

export function findDuplicate(listing: Listing, candidates: Listing[]) {
  return candidates.find(
    (candidate) => duplicateEvidence(listing, candidate)?.automatic,
  );
}

export type DuplicateGroupPlan = {
  groups: { id: string; memberIds: string[]; reason: string }[];
  assignments: Map<string, string | null>;
  conflicts: { leftId: string; rightId: string; reason: string }[];
};

/** Deterministic union with component-wide constraints: A!=C also prevents A=B=C. */
export function planDuplicateGroups(
  listings: Listing[],
  decisions: DuplicatePairDecision[],
): DuplicateGroupPlan {
  const boats = listings
    .filter((l) => !l.isSample)
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(boats.map((l) => [l.id, l]));
  const parents = new Map(boats.map((l) => [l.id, l.id]));
  const members = new Map(boats.map((l) => [l.id, new Set([l.id])]));
  const separate = new Set(
    decisions
      .filter((d) => d.decision === "different")
      .map((d) => pairKey(d.leftId, d.rightId)),
  );
  const conflicts: DuplicateGroupPlan["conflicts"] = [];
  function root(id: string): string {
    const parent = parents.get(id)!;
    if (parent === id) return id;
    const result = root(parent);
    parents.set(id, result);
    return result;
  }
  function union(leftId: string, rightId: string, reviewed: boolean) {
    if (!byId.has(leftId) || !byId.has(rightId)) return;
    const l = root(leftId),
      r = root(rightId);
    if (l === r) return;
    const left = members.get(l)!,
      right = members.get(r)!;
    let conflict = "";
    for (const a of left)
      for (const b of right) {
        if (separate.has(pairKey(a, b)))
          conflict = "A different-vessel decision separates these groups";
        const ha = normalizedHin(byId.get(a)!.specs.hin),
          hb = normalizedHin(byId.get(b)!.specs.hin);
        if (ha && hb && ha !== hb)
          conflict ||= "Different modern-format HINs in the combined group";
      }
    if (conflict) {
      if (reviewed) conflicts.push({ leftId, rightId, reason: conflict });
      return;
    }
    const [keep, remove] = [l, r].sort();
    parents.set(remove, keep);
    for (const id of members.get(remove)!) members.get(keep)!.add(id);
    members.delete(remove);
  }
  const same = decisions
    .filter((d) => d.decision === "same")
    .sort((a, b) =>
      pairKey(a.leftId, a.rightId).localeCompare(pairKey(b.leftId, b.rightId)),
    );
  for (const d of same) union(d.leftId, d.rightId, true);
  const hins = new Map<string, string[]>();
  for (const l of boats) {
    const hin = normalizedHin(l.specs.hin);
    if (hin) hins.set(hin, [...(hins.get(hin) ?? []), l.id]);
  }
  for (const ids of hins.values())
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) union(ids[i], ids[j], false);
  const assignments = new Map<string, string | null>(
    boats.map((l) => [l.id, null]),
  );
  const groups = [...members.values()]
    .filter((ids) => ids.size > 1)
    .map((ids) => {
      const memberIds = [...ids].sort();
      const id = `vessel_${createHash("sha256").update(JSON.stringify(memberIds)).digest("hex").slice(0, 24)}`;
      const reason = same.some((d) => ids.has(d.leftId) && ids.has(d.rightId))
        ? "Reviewed same vessel; any additional ads require matching modern-format HIN"
        : "Matching modern-format HIN; verify the seller's identifier";
      for (const member of memberIds) assignments.set(member, id);
      return { id, memberIds, reason };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return { groups, assignments, conflicts };
}
