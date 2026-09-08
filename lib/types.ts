import { z } from "zod";
import { FIELD_MAP } from "./catalog";
export const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const fieldObservationSchema = z.object({
  value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
  sourceUrl: z
    .string()
    .url()
    .max(2000)
    .refine((value) => /^https?:\/\//.test(value)),
  source: z.string().max(100),
  observedAt: z.string().datetime(),
  method: z.enum(["source", "detail", "import", "review"]),
  evidence: z.string().max(4000).optional(),
});
export const locationOverrideSchema = pointSchema.extend({
  label: z.string().min(1).max(500),
  evidence: z.string().min(1).max(4000),
  sourceUrl: z
    .string()
    .url()
    .max(2000)
    .refine((value) => /^https?:\/\//.test(value))
    .optional(),
  reviewedAt: z.string().datetime(),
  revision: z.number().int().nonnegative(),
});
export const sourceLocationSchema = z.object({
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  sellerLat: z.number().min(-90).max(90).nullable(),
  sellerLng: z.number().min(-180).max(180).nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  precision: z.string().optional(),
  observedAt: z.string().datetime(),
});
export const routeEstimateSchema = z.object({
  status: z.enum(["ready", "failed", "unconfigured"]),
  provider: z.string().max(100),
  providerUrl: z.string().max(2000),
  origin: pointSchema,
  destination: pointSchema,
  durationMinutes: z.number().nonnegative().optional(),
  distanceMiles: z.number().nonnegative().optional(),
  computedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  error: z.string().max(2000).optional(),
});
export const alertEventSchema = z.enum([
  "new-match",
  "price-drop",
  "price-change",
  "status-change",
  "no-longer-matches",
]);
export const DEFAULT_ALERT_EVENTS = [
  "new-match",
  "price-change",
  "status-change",
] as const;
export const areaSchema = z
  .object({
    id: z.string().max(100),
    name: z.string().min(1).max(120),
    kind: z.enum(["radius", "states", "bbox"]),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    radius: z.number().positive().max(12500).optional(),
    states: z.array(z.string().length(2)).max(60).optional(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  })
  .superRefine((v, c) => {
    if (
      v.kind === "radius" &&
      (v.lat == null || v.lng == null || v.radius == null)
    )
      c.addIssue({
        code: "custom",
        message: "Radius areas need coordinates and a radius",
      });
    if (v.kind === "states" && !v.states?.length)
      c.addIssue({ code: "custom", message: "Select at least one state" });
    if (
      v.kind === "bbox" &&
      (!v.bbox ||
        v.bbox[0] >= v.bbox[2] ||
        v.bbox[1] >= v.bbox[3] ||
        v.bbox[0] < -90 ||
        v.bbox[2] > 90 ||
        v.bbox[1] < -180 ||
        v.bbox[3] > 180)
    )
      c.addIssue({ code: "custom", message: "Invalid map bounds" });
  });
export type SearchArea = z.infer<typeof areaSchema>;
export const criterionSchema = z
  .object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    values: z.array(z.string().max(120)).max(60).optional(),
    text: z.string().max(500).optional(),
    bool: z.boolean().optional(),
    excludeUnknown: z.boolean().optional(),
  })
  .refine(
    (v) => v.min == null || v.max == null || v.min <= v.max,
    "Minimum must not exceed maximum",
  );
export const ruleSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(120),
  maxLength: z.number().positive().optional(),
  maxLengthExclusive: z.boolean().optional(),
  maxHp: z.number().positive().optional(),
  maxLoadedWeight: z.number().positive().optional(),
  allowedPropulsion: z.array(z.string()).optional(),
  excludedCategories: z.array(z.string()).optional(),
  excludeUnknown: z.boolean().default(false),
  verification: z
    .object({
      status: z.enum([
        "unverified",
        "public-document-reviewed",
        "association-confirmed",
      ]),
      sourceUrl: z
        .string()
        .url()
        .refine((value) => /^https?:\/\//.test(value)),
      documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reviewedAt: z.string().datetime(),
      summary: z.string().max(2000),
      screeningFingerprint: z.string().max(2000),
    })
    .optional(),
});
export type RuleSet = z.infer<typeof ruleSchema>;
export const filtersSchema = z.object({
  q: z.string().max(300).default(""),
  criteria: z
    .record(criterionSchema)
    .default({})
    .refine(
      (v) => Object.keys(v).every((k) => FIELD_MAP[k]),
      "Unknown filter field",
    ),
  areas: z.array(areaSchema).max(20).default([]),
  reference: pointSchema
    .extend({ name: z.string().max(100).optional() })
    .optional(),
  driving: z
    .object({
      maxMinutes: z.number().positive().max(10080),
      excludeUnknown: z.boolean().default(true),
    })
    .optional(),
  locationTarget: z.enum(["boat", "seller"]).default("boat"),
  excludeUnknownLocation: z.boolean().default(false),
  excludeUnknown: z.boolean().default(false),
  dropWindowDays: z.number().int().min(1).max(3650).default(90),
  ruleSet: ruleSchema.optional(),
  sort: z
    .enum([
      "newest",
      "price-asc",
      "price-desc",
      "distance",
      "hours",
      "year",
      "days",
      "price-per-foot",
    ])
    .default("newest"),
});
export type Filters = z.infer<typeof filtersSchema>;
export type Criterion = z.infer<typeof criterionSchema>;
export const DEFAULT_FILTERS: Filters = filtersSchema.parse({
  criteria: { status: { values: ["active"] } },
});
export const listingSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(100),
  sourceListingId: z.string().max(300),
  sourceUrl: z
    .string()
    .url()
    .refine((v) => /^https?:\/\//.test(v), "HTTP URL required"),
  title: z.string().min(1).max(500),
  description: z.string().max(100000).default(""),
  make: z.string().max(100).nullable().default(null),
  model: z.string().max(100).nullable().default(null),
  year: z.number().int().min(1900).max(2200).nullable().default(null),
  price: z.number().nonnegative().nullable().default(null),
  currency: z.literal("USD").default("USD"),
  length: z.number().positive().nullable().default(null),
  horsepower: z.number().nonnegative().nullable().default(null),
  engineHours: z.number().nonnegative().nullable().default(null),
  category: z.string().nullable().default(null),
  propulsion: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  state: z.string().nullable().default(null),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  sellerLat: z.number().min(-90).max(90).nullable().default(null),
  sellerLng: z.number().min(-180).max(180).nullable().default(null),
  sellerName: z.string().nullable().default(null),
  sellerType: z.string().nullable().default(null),
  photos: z
    .array(
      z
        .string()
        .max(2000)
        .refine(
          (v) => /^https?:\/\//.test(v) || v.startsWith("/"),
          "Invalid photo URL",
        ),
    )
    .max(100)
    .default([]),
  status: z.enum(["active", "sold", "removed", "stale"]).default("active"),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  removedAt: z.string().datetime().nullable().default(null),
  specs: z
    .record(z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))
    .default({}),
  engines: z
    .array(
      z.object({
        make: z.string().nullable().default(null),
        model: z.string().nullable().default(null),
        year: z.number().nullable().default(null),
        hp: z.number().nullable().default(null),
        hours: z.number().nullable().default(null),
      }),
    )
    .default([]),
  priceHistory: z
    .array(
      z.object({ price: z.number().nonnegative(), at: z.string().datetime() }),
    )
    .default([]),
  confidence: z.record(z.number().min(0).max(1)).default({}),
  groupId: z.string().nullable().default(null),
  vesselId: z.string().nullable().default(null),
  fieldProvenance: z.record(z.array(fieldObservationSchema).max(30)).optional(),
  locationOverride: locationOverrideSchema.optional(),
  sourceLocation: sourceLocationSchema.optional(),
  routeEstimate: routeEstimateSchema.optional(),
  rawPayload: z.unknown().optional(),
  isSample: z.boolean().default(false),
});
export type Listing = z.infer<typeof listingSchema>;
export type BoatResult = Listing & {
  sourceLinks: {
    source: string;
    url: string;
    price: number | null;
    id: string;
  }[];
  distance?: number;
};
export const savedSearchSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(120),
  filters: filtersSchema,
  cadence: z.enum(["off", "hourly", "daily", "weekly"]).default("off"),
  channels: z.array(z.enum(["in-app", "email", "webhook"])).default(["in-app"]),
  digest: z.boolean().default(true),
  eventTypes: z.array(alertEventSchema).max(5).optional(),
});
export type SavedSearch = z.infer<typeof savedSearchSchema>;
export type Alert = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  listingIds: string[];
};
export type Workspace = {
  favorites: string[];
  notes: Record<string, string>;
  savedSearches: SavedSearch[];
  rules: RuleSet[];
  alerts: Alert[];
  referencePoints: (z.infer<typeof pointSchema> & { name: string })[];
};
export const EMPTY_WORKSPACE: Workspace = {
  favorites: [],
  notes: {},
  savedSearches: [],
  rules: [{ id: "generic", name: "My lake rules", excludeUnknown: false }],
  alerts: [],
  referencePoints: [
    { name: "Home · Lake Holiday, IL", lat: 41.6180404, lng: -88.6682705 },
    { name: "Wheaton, IL", lat: 41.8661, lng: -88.107 },
  ],
};
