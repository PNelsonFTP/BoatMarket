import { createHash } from "node:crypto";
import { listingSchema, type Listing } from "../../lib/types";
export function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const match = String(value)
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
export function parseLengthFeet(value: unknown): number | null {
  const text = String(value ?? "")
    .toLowerCase()
    .replace(/[’′]/g, "'")
    .replace(/[”″]/g, '"');
  const n = parseNumber(text);
  if (n == null || n <= 0) return null;
  if (/\b(?:meters?|metres?)\b|\d\s*m\b/.test(text))
    return Number((n * 3.280839895).toFixed(3));
  const feetAndInches = text.match(
    /(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(\d+(?:\.\d+)?)\s*(?:in|inches|")/,
  );
  if (feetAndInches)
    return Number(feetAndInches[1]) + Number(feetAndInches[2]) / 12;
  if (/\b(?:in|inches)\b|"/.test(text) && !/(?:ft|feet|')/.test(text))
    return n / 12;
  return n;
}
const makes = [
  "Bass Cat",
  "BassCat",
  "Phoenix",
  "Falcon",
  "Triton",
  "Vexus",
  "Warrior",
  "Caymas",
  "G3",
  "Supra",
  "Moomba",
  "Axis",
  "Tige",
  "MasterCraft",
  "Lund",
  "Ranger",
  "Tracker",
  "Alumacraft",
  "Crestliner",
  "Nitro",
  "Skeeter",
  "Malibu",
  "Nautique",
  "Bennington",
  "Boston Whaler",
  "Sea Ray",
  "Bayliner",
  "Yamaha",
  "Catalina",
  "Sun Tracker",
  "Grady-White",
  "Hobie",
];
// Allow compact model names such as Tige21 without matching Tiger/TIGER.
const tigeName = /(?<![a-z])tige(?![a-z])/i;
export function normalizeListing(
  raw: Record<string, unknown>,
  source: string,
  pageUrl: string,
): Listing {
  const title = String(raw.title || raw.name || "Boat listing")
    .replace(/\s+/g, " ")
    .trim();
  const make =
    [...makes]
      .sort((a, b) => b.length - a.length)
      .find((m) =>
        m === "Tige"
          ? tigeName.test(title)
          : title.toLowerCase().includes(m.toLowerCase()),
      ) ?? (typeof raw.make === "string" ? raw.make : null);
  const year =
    parseNumber(raw.year) ??
    parseNumber(title.match(/\b(?:19|20)\d{2}\b/)?.[0]);
  const sourceUrl = new URL(String(raw.url || pageUrl), pageUrl).href;
  const now = new Date().toISOString();
  const id = createHash("sha256")
    .update(`${source}|${raw.sourceListingId || sourceUrl}`)
    .digest("hex")
    .slice(0, 24);
  const price = parseNumber(raw.price);
  const photos = Array.isArray(raw.photos)
    ? raw.photos
    : raw.image
      ? [raw.image]
      : [];
  const photoUrls = photos
    .map((p) => {
      try {
        return new URL(
          String(typeof p === "object" && p ? (p as { url: unknown }).url : p),
          pageUrl,
        ).href;
      } catch {
        return "";
      }
    })
    .filter((p) => /^https?:\/\//.test(p));
  const suppliedSpecs = {
    ...(typeof raw.condition === "string" && raw.condition
      ? { condition: raw.condition }
      : {}),
    ...(typeof raw.specs === "object" && raw.specs ? raw.specs : {}),
  };
  return listingSchema.parse({
    id,
    source,
    sourceListingId: String(raw.sourceListingId || sourceUrl),
    sourceUrl,
    title,
    description: String(raw.description || ""),
    make,
    model:
      raw.model ??
      (make
        ? title
            .replace(
              make.toLowerCase() === "tige"
                ? tigeName
                : new RegExp(make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
              "",
            )
            .replace(/\b(?:19|20)\d{2}\b/, "")
            .replace(/^[\s-]+|[\s-]+$/g, "")
        : null),
    year,
    price: price != null && price >= 0 ? price : null,
    length: parseLengthFeet(raw.length),
    horsepower:
      /\bkw\b/i.test(String(raw.horsepower)) &&
      parseNumber(raw.horsepower) != null
        ? Number((parseNumber(raw.horsepower)! * 1.34102209).toFixed(1))
        : parseNumber(raw.horsepower),
    engineHours: parseNumber(raw.engineHours),
    category: raw.category ?? null,
    propulsion: raw.propulsion ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    lat: parseNumber(raw.lat),
    lng: parseNumber(raw.lng),
    sellerName: raw.sellerName ?? null,
    sellerType: raw.sellerType ?? null,
    photos: photoUrls,
    status: raw.status ?? "active",
    firstSeenAt: now,
    lastSeenAt: now,
    specs: suppliedSpecs,
    engines: [],
    confidence: {
      title: 1,
      price: price == null ? 0 : 0.95,
      make: raw.make ? 1 : 0.8,
      model: raw.model ? 1 : 0.55,
      year: raw.year ? 1 : 0.9,
    },
    rawPayload: raw,
  });
}
