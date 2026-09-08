import { z } from "zod";
export const US_STATES: Record<string, string> = Object.fromEntries(
  "AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|DC:District of Columbia"
    .split("|")
    .map((s) => s.split(":")),
);
export const cityQuerySchema = z.object({
  city: z.string().trim().min(1).max(120),
  state: z
    .string()
    .length(2)
    .transform((s) => s.toUpperCase())
    .refine((s) => !!US_STATES[s]),
  zip: z.string().max(20).default(""),
});
export type CityQuery = z.infer<typeof cityQuerySchema>;
export function groupLocationQueries(
  listings: {
    city: string | null;
    state: string | null;
    specs: Record<string, unknown>;
  }[],
) {
  const groups = new Map<
    string,
    { query: CityQuery; postalCodes: Set<string> }
  >();
  for (const listing of listings) {
    const parsed = cityQuerySchema.safeParse({
      city: listing.city,
      state: listing.state,
      zip: "",
    });
    if (!parsed.success) continue;
    const query = parsed.data;
    const key = `${query.city}, ${query.state}`.toLowerCase();
    const group = groups.get(key) ?? { query, postalCodes: new Set<string>() };
    const postal = String(listing.specs.postalCode ?? "")
      .trim()
      .match(/^(\d{5})(?:-\d{4})?$/)?.[1];
    if (postal) group.postalCodes.add(postal);
    groups.set(key, group);
  }
  return [...groups].map(([key, group]) => {
    const postalCodes = [...group.postalCodes].sort();
    const conflictingPostalCodes = postalCodes.length > 1;
    return {
      key,
      query: {
        ...group.query,
        zip: conflictingPostalCodes ? "" : (postalCodes[0] ?? ""),
      },
      postalCodes,
      conflictingPostalCodes,
    };
  });
}
export type LocationCandidate = {
  lat: number;
  lng: number;
  label: string;
  type: string;
  score: number;
  reasons: string[];
};
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^city of /, "")
    .replace(/[^a-z0-9]/g, "");
const rawSchema = z.array(
  z.object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
    display_name: z.string(),
    addresstype: z.string().default(""),
    name: z.string().optional(),
    address: z.record(z.string()).default({}),
  }),
);
export function rankLocationCandidates(query: CityQuery, raw: unknown) {
  const candidates: LocationCandidate[] = [];
  for (const c of rawSchema.parse(raw)) {
    const a = c.address;
    const stateMatch =
      normalize(a.state || "") ===
        normalize(US_STATES[query.state] || query.state) ||
      a["ISO3166-2-lvl4"] === `US-${query.state}`;
    if (!stateMatch || a.country_code?.toLowerCase() !== "us") continue;
    const localities = [
      c.name,
      a.city,
      a.town,
      a.village,
      a.hamlet,
      a.municipality,
      a.suburb,
      a.neighbourhood,
    ].filter((v): v is string => !!v);
    if (!localities.some((v) => normalize(v) === normalize(query.city)))
      continue;
    if (
      ![
        "city",
        "town",
        "village",
        "hamlet",
        "municipality",
        "suburb",
        "neighbourhood",
      ].includes(c.addresstype)
    )
      continue;
    const zipMatch =
      !!query.zip && a.postcode?.slice(0, 5) === query.zip.slice(0, 5);
    if (query.zip && a.postcode && !zipMatch) continue;
    const reasons = [
      "City name and state match",
      ...(zipMatch ? ["ZIP matches"] : []),
      ...(query.zip && !a.postcode
        ? ["Provider did not verify the requested ZIP"]
        : []),
    ];
    candidates.push({
      lat: c.lat,
      lng: c.lon,
      label: c.display_name,
      type: c.addresstype,
      score: zipMatch ? 100 : 80,
      reasons,
    });
  }
  const unique = [
    ...new Map(
      candidates.map((c) => [`${c.lat.toFixed(4)},${c.lng.toFixed(4)}`, c]),
    ).values(),
  ].sort((a, b) => b.score - a.score);
  const chosen =
    unique.length &&
    (!query.zip || unique[0].score === 100) &&
    (unique.length === 1 || unique[0].score > unique[1].score)
      ? unique[0]
      : null;
  return {
    candidates: unique,
    chosen,
    reason: chosen
      ? "Unique matching locality"
      : unique.length
        ? "Ambiguous localities; review required"
        : "No matching locality; review required",
  };
}
/** ZIP is part of a geocode identity; missing ZIP evidence gets its own reviewable query. */
export function groupPostalLocationQueries(
  listings: {
    city: string | null;
    state: string | null;
    specs: Record<string, unknown>;
  }[],
) {
  const queries = new Map<string, CityQuery>();
  for (const listing of listings) {
    const zip =
      String(listing.specs.postalCode || "").match(
        /^(\d{5})(?:-\d{4})?$/,
      )?.[1] || "";
    const parsed = cityQuerySchema.safeParse({
      city: listing.city,
      state: listing.state,
      zip,
    });
    if (!parsed.success) continue;
    const key =
      `${parsed.data.city.trim()}, ${parsed.data.state}${zip ? ` ${zip}` : ""}`.toLowerCase();
    queries.set(key, parsed.data);
  }
  return [...queries]
    .map(([key, query]) => ({ key, query }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
