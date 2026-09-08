import { fieldObservationSchema, type Listing } from "./types";
import type { z } from "zod";
export type FieldObservation = z.infer<typeof fieldObservationSchema>;
export const provenanceFields = (listing: Listing) => [
  ...new Set([
    "length",
    "horsepower",
    "engineHours",
    ...Object.keys(listing.specs).filter(
      (field) =>
        field.startsWith("equipment.") ||
        /^(?:trollingMotor|trollingMake|trollingThrust|trailerType|trailerBrand|trailerBrakes|sonarBrand|sonarModel)$/.test(
          field,
        ),
    ),
  ]),
];
const scalar = (
  listing: Listing,
  field: string,
): FieldObservation["value"] | undefined => {
  const value =
    field in listing ? listing[field as keyof Listing] : listing.specs[field];
  return value === null ||
    ["string", "number", "boolean"].includes(typeof value)
    ? (value as FieldObservation["value"])
    : undefined;
};
/** Record when each reported fact was actually observed, never when a cached page was reused. */
export function recordFieldProvenance(
  next: Listing,
  previous: Listing | null = null,
  options: {
    method?: FieldObservation["method"];
    sourceUrl?: string;
    observedAt?: string;
    observe?: boolean;
    fieldSources?: Record<
      string,
      Pick<FieldObservation, "sourceUrl" | "observedAt" | "method">
    >;
  } = {},
): Listing {
  const fieldProvenance: NonNullable<Listing["fieldProvenance"]> = {};
  for (const field of new Set([
    ...Object.keys(previous?.fieldProvenance || {}),
    ...Object.keys(next.fieldProvenance || {}),
  ])) {
    const entries = [
      ...(previous?.fieldProvenance?.[field] || []),
      ...(next.fieldProvenance?.[field] || []),
    ];
    fieldProvenance[field] = [
      ...new Map(
        entries.map((entry) => [JSON.stringify(entry), entry]),
      ).values(),
    ]
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .slice(0, 30);
  }
  const retained = new Set(
    String(next.specs.retainedDetailFields || "").split(/,\s*/),
  );
  if (options.observe === false) return { ...next, fieldProvenance };
  for (const field of provenanceFields(next)) {
    const value = scalar(next, field);
    if (value === undefined || value === null || value === "") continue;
    const inherited = fieldProvenance[field] || [];
    const existingMatch = inherited.find((entry) => entry.value === value);
    const retainedDetail =
      retained.has(field) ||
      (field.startsWith("equipment.") && !!next.specs.retainedDetailObservedAt);
    if (retainedDetail && existingMatch) continue;
    const supplied = options.fieldSources?.[field];
    const detailAt = retainedDetail
      ? next.specs.retainedDetailObservedAt
      : next.specs.detailsCheckedAt;
    const observedAt =
      supplied?.observedAt ||
      options.observedAt ||
      (typeof detailAt === "string"
        ? detailAt
        : typeof next.specs.summaryCheckedAt === "string"
          ? next.specs.summaryCheckedAt
          : next.lastSeenAt);
    const parsed = fieldObservationSchema.safeParse({
      value,
      sourceUrl: supplied?.sourceUrl || options.sourceUrl || next.sourceUrl,
      source: next.source,
      observedAt,
      method:
        supplied?.method || options.method || (detailAt ? "detail" : "source"),
      ...(retainedDetail
        ? {
            evidence:
              "Retained from an earlier successful detail observation; not freshly reconfirmed.",
          }
        : {}),
    });
    if (!parsed.success) continue;
    const observation = parsed.data;
    const combined = [...inherited, observation].filter(
      (entry, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.value === entry.value &&
            candidate.sourceUrl === entry.sourceUrl &&
            candidate.observedAt === entry.observedAt &&
            candidate.method === entry.method,
        ) === index,
    );
    fieldProvenance[field] = combined
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .slice(0, 30);
  }
  return { ...next, fieldProvenance };
}
export function currentFieldEvidence(
  listing: Listing,
  field: string,
  now = Date.now(),
) {
  const value = scalar(listing, field);
  const history = listing.fieldProvenance?.[field] || [];
  const current = history.find((entry) => entry.value === value) || null;
  const ageDays = current
    ? Math.max(0, Math.floor((now - Date.parse(current.observedAt)) / 86400000))
    : null;
  return {
    current,
    ageDays,
    stale: ageDays != null && ageDays > 30,
    conflicting: history.some((entry) => entry.value !== value),
    history,
  };
}
