import type { Listing } from "../lib/types";
import {
  descriptionSimilarity,
  duplicateEvidence,
  duplicateFingerprint,
  normalizedHin,
} from "./dedup";

const CRESTLINER_IDS = [
  "cb0108f73888a808a251d8ff",
  "b5ec6f81bbd5f9cb1092991e",
  "083da56ce95cb433783e5e8b",
  "9dd7100bf7039e41d35a0309",
  "4ece733e4a7f09253ee8e2e6",
];
export type IdentityRecommendation = {
  leftId: string;
  rightId: string;
  decision: "same" | "different" | "review";
  sufficientLocalEvidence: boolean;
  reason: string;
  leftFingerprint: string;
  rightFingerprint: string;
  sources: { id: string; url: string; lastObservedAt: string }[];
  evidence: ReturnType<typeof duplicateEvidence>;
};
/** Bounded adjudication of the named captured examples, never a general automatic
 * merger. Recommendations refer to the advertised vessel, not verified ownership.
 */
export function reviewNamedIdentityExamples(listings: Listing[]) {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const recommendations: IdentityRecommendation[] = [];
  const missing: string[] = [];
  function add(
    leftId: string,
    rightId: string,
    check: (
      a: Listing,
      b: Listing,
    ) => {
      decision: "same" | "different" | "review";
      reason: string;
      sufficientLocalEvidence: boolean;
    },
  ) {
    const a = byId.get(leftId),
      b = byId.get(rightId);
    if (!a || !b) {
      missing.push(
        ...[!a ? leftId : null, !b ? rightId : null].filter(
          (id): id is string => !!id,
        ),
      );
      return;
    }
    recommendations.push({
      leftId,
      rightId,
      ...check(a, b),
      leftFingerprint: duplicateFingerprint(a),
      rightFingerprint: duplicateFingerprint(b),
      sources: [a, b].map((l) => ({
        id: l.id,
        url: l.sourceUrl,
        lastObservedAt: l.lastSeenAt,
      })),
      evidence: duplicateEvidence(a, b),
    });
  }
  for (const id of CRESTLINER_IDS.slice(1))
    add(CRESTLINER_IDS[0], id, (a, b) => {
      const evidence = duplicateEvidence(a, b),
        description = descriptionSimilarity(a.description, b.description);
      const supported =
        a.city === "Butler" &&
        b.city === "Butler" &&
        a.state === "WI" &&
        b.state === "WI" &&
        a.source === "Craigslist" &&
        b.source === "Craigslist" &&
        a.lat === b.lat &&
        a.lng === b.lng &&
        a.lat != null &&
        a.length === 16 &&
        b.length === 16 &&
        [null, 25].includes(a.horsepower) &&
        [null, 25].includes(b.horsepower) &&
        (evidence?.sharedImageIdentities?.length ?? 0) >= 3 &&
        description.shared >= 8 &&
        description.overlap >= 0.5 &&
        [a, b].every(
          (l) =>
            /crestliner\s+sportsman\s+16/i.test(l.description) &&
            /yamaha\s+25\s*hp/i.test(l.description) &&
            /spartan\s+trailer/i.test(l.description),
        ) &&
        !evidence?.conflicts.length &&
        a.price != null &&
        b.price != null &&
        Math.abs(a.price - b.price) <= Math.max(a.price, b.price) * 0.1;
      return {
        decision: supported ? "same" : "review",
        sufficientLocalEvidence: supported,
        reason: supported
          ? "The Butler ads share at least three distinct original photo identities, identical advertised map coordinates, the same 16-ft hull/25-hp Yamaha and Spartan-trailer description, and prices within 10%. The optional 1994 year and $2,100 versus $2,200 price are compatible repost changes. Reviewed as the same advertised vessel from captured local evidence; ownership and present availability are not independently confirmed."
          : "The bounded Butler corroboration checks no longer all agree; retain as a candidate for fresh review.",
      };
    });
  add("11c502ff0fda5136fdb4f49c", "b8d8511b5eeea9421726930b", (a, b) => {
    const details = [
      /93v/i,
      /126sv/i,
      /live\s*scope/i,
      /gms\s*network/i,
      /miller\s*tech/i,
      /2021/,
      /suspension.*brakes/i,
    ];
    const corroborators = details.filter(
      (pattern) => pattern.test(a.description) && pattern.test(b.description),
    ).length;
    const supported =
      a.make === "Skeeter" &&
      b.make === "Skeeter" &&
      a.model === "ZX225" &&
      b.model === "ZX225" &&
      a.year === 2002 &&
      b.year === 2002 &&
      a.city === "Fenton" &&
      b.city === "Fenton" &&
      a.state === "MI" &&
      b.state === "MI" &&
      a.price === b.price &&
      a.price === 18500 &&
      corroborators >= 6 &&
      !duplicateEvidence(a, b)?.conflicts.includes(
        "Different modern-format HINs",
      );
    return {
      decision: supported ? "same" : "review",
      sufficientLocalEvidence: supported,
      reason: supported
        ? `The Craigslist and Bass Boat Central ads agree on 2002 Skeeter ZX225, Fenton MI and $18,500 and share ${corroborators} distinctive descriptive details: 93V/126SV electronics, LiveScope, GMS network, Millertech lithium batteries, 2021 seats, and renewed trailer suspension/brakes. This is strong corroboration beyond headline/model alone. Reviewed as the same advertised vessel; rehosted photographs, HIN and seller ownership have not been independently verified.`
        : "The named Skeeter metadata/distinctive equipment checks do not all agree; retain as a candidate for manual verification.",
    };
  });
  add("020df7da9f2ef3053eb31474", "4bb8aef0bb5952be8c7dc45c", (a, b) => {
    const ha = normalizedHin(a.specs.hin),
      hb = normalizedHin(b.specs.hin),
      conflict = !!ha && !!hb && ha !== hb;
    return {
      decision: conflict ? "different" : "review",
      sufficientLocalEvidence: conflict,
      reason: conflict
        ? `The Wauconda stock ads report different supported HINs (${ha} and ${hb}) and stock numbers A-76/A-75. Matching model, price and dealer boilerplate must not collapse distinct stock units.`
        : "One reported HIN is missing/unsupported or no longer conflicts; inspect the stock units again.",
    };
  });
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    basis:
      "Existing local source captures; no new source fetch, seller contact or image download",
    recommendations,
    missing: [...new Set(missing)],
    separateExample: {
      id: "25070c23b761fc4b28973894",
      reason:
        "The 2006 Dubuque Crestliner remains separate: different original photos, location and $7,500 asking price; it is not part of the Butler review.",
    },
  };
}
