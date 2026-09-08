import { z } from "zod";
import { listingSchema, type Listing } from "./types";
export const sourceQualityPolicySchema = z.object({
  minRecords: z.number().int().min(0).max(100000).optional(),
  maxRecordDropFraction: z.number().min(0).max(1).optional(),
  minPriceCoverage: z.number().min(0).max(1).optional(),
  minLocationCoverage: z.number().min(0).max(1).optional(),
  minIdentityCoverage: z.number().min(0).max(1).optional(),
  maxFieldCoverageDrop: z.number().min(0).max(1).optional(),
});
export type SourceQualityPolicy = z.infer<typeof sourceQualityPolicySchema>;
export const qualityFields = [
  "price",
  "length",
  "horsepower",
  "make",
  "model",
  "year",
  "lat",
  "lng",
] as const;
const identity = (l: Listing) => JSON.stringify([l.source, l.sourceListingId]);
export function inspectSourceQuality(
  input: unknown[],
  previous: Listing[] = [],
  policy: SourceQualityPolicy = {},
) {
  const parsed = input.map((x) => listingSchema.safeParse(x));
  const issues: string[] = parsed.flatMap((r, i) =>
    r.success
      ? []
      : [
          `Record ${i + 1} failed canonical schema validation: ${r.error.issues.map((v) => v.path.join(".")).join(", ")}`,
        ],
  );
  const listings = parsed.flatMap((r) => (r.success ? [r.data] : []));
  if (new Set(listings.map((l) => l.id)).size !== listings.length)
    issues.push("Duplicate listing IDs in parsed inventory");
  if (new Set(listings.map(identity)).size !== listings.length)
    issues.push("Duplicate source identities in parsed inventory");
  const fraction = (n: number) => (listings.length ? n / listings.length : 0);
  const coverage = {
    price: fraction(listings.filter((l) => l.price != null).length),
    location: fraction(
      listings.filter(
        (l) => (l.lat != null && l.lng != null) || (l.city && l.state),
      ).length,
    ),
    identity: fraction(listings.filter((l) => l.make && l.model).length),
    fields: Object.fromEntries(
      qualityFields.map((f) => [
        f,
        fraction(listings.filter((l) => l[f] != null).length),
      ]),
    ),
  };
  if (policy.minRecords != null && listings.length < policy.minRecords)
    issues.push(
      `Parsed ${listings.length} records, below required ${policy.minRecords}`,
    );
  if (
    previous.length &&
    policy.maxRecordDropFraction != null &&
    listings.length < previous.length * (1 - policy.maxRecordDropFraction)
  )
    issues.push(
      `Inventory fell from ${previous.length} to ${listings.length}, exceeding the configured drop limit`,
    );
  for (const [key, minimum] of [
    ["price", policy.minPriceCoverage],
    ["location", policy.minLocationCoverage],
    ["identity", policy.minIdentityCoverage],
  ] as const)
    if (minimum != null && coverage[key] < minimum)
      issues.push(
        `${key} coverage ${Math.round(100 * coverage[key])}% below required ${Math.round(100 * minimum)}%`,
      );
  const old = new Map(previous.map((l) => [identity(l), l]));
  const changes: listDiff[] = [];
  for (const current of listings) {
    const before = old.get(identity(current));
    if (!before) {
      changes.push({
        id: current.id,
        sourceListingId: current.sourceListingId,
        kind: "new",
        fields: [],
      });
      continue;
    }
    const fields = [
      ...qualityFields,
      "status",
      "title",
      "city",
      "state",
      "category",
      "propulsion",
    ] as const;
    const diff = fields
      .filter((f) => current[f] !== before[f])
      .map((f) => ({ field: f, before: before[f], after: current[f] }));
    if (diff.length)
      changes.push({
        id: current.id,
        sourceListingId: current.sourceListingId,
        kind: "changed",
        fields: diff,
      });
  }
  if (policy.maxFieldCoverageDrop != null) {
    const comparable = listings.filter((l) => old.has(identity(l)));
    if (comparable.length >= 5)
      for (const field of qualityFields) {
        const oldKnown = comparable.filter(
          (l) => old.get(identity(l))![field] != null,
        ).length;
        const nowKnown = comparable.filter((l) => l[field] != null).length;
        if (
          oldKnown >= 5 &&
          (oldKnown - nowKnown) / oldKnown > policy.maxFieldCoverageDrop
        )
          issues.push(
            `${field} coverage fell from ${oldKnown} to ${nowKnown} among comparable ads`,
          );
      }
  }
  const currentKeys = new Set(listings.map(identity));
  return {
    version: 1 as const,
    status: issues.length ? ("failed" as const) : ("passed" as const),
    counts: {
      parsed: listings.length,
      previous: previous.length,
      new: changes.filter((c) => c.kind === "new").length,
      changed: changes.filter((c) => c.kind === "changed").length,
      missingFromCapture: previous.filter((l) => !currentKeys.has(identity(l)))
        .length,
    },
    coverage,
    issues,
    changes,
  };
}
type listDiff = {
  id: string;
  sourceListingId: string;
  kind: "new" | "changed";
  fields: { field: string; before: unknown; after: unknown }[];
};
