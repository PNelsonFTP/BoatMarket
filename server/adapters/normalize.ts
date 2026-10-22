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
const motorMakes = [
  "Volvo Penta",
  "MerCruiser",
  "Mercury",
  "Yamaha",
  "Suzuki",
  "Honda",
  "Evinrude",
  "Johnson",
  "Ilmor",
  "PCM",
  "Indmar",
  "Rotax",
];
const cleanMake = (value: unknown) =>
  typeof value === "string" &&
  value.trim() &&
  !/^(?:unknown|none|null|n\/?a|not (?:known|specified)|other|various|boat)$/i.test(
    value.trim(),
  )
    ? value.trim()
    : null;
const makeKey = (value: string) => value.toLowerCase().replace(/[\s-]/g, "");
function titleMakes(title: string) {
  const matches = [...makes]
    .sort((a, b) => b.length - a.length)
    .flatMap((make) => {
      const index =
        make === "Tige"
          ? title.search(tigeName)
          : title.toLowerCase().indexOf(make.toLowerCase());
      return index < 0 ? [] : [{ make, index, end: index + make.length }];
    });
  // Sun Tracker is one name; the overlapping Tracker substring is not a conflict.
  return matches.filter(
    (match, index) =>
      !matches
        .slice(0, index)
        .some((prior) => prior.index <= match.index && prior.end >= match.end),
  );
}
function inferMake(
  raw: Record<string, unknown>,
  title: string,
  specs: Record<string, unknown>,
) {
  const supplied = cleanMake(raw.make);
  const structured = supplied
    ? makes.find((make) => makeKey(make) === makeKey(supplied)) || supplied
    : null;
  const titleCandidates = titleMakes(title);
  const nonMotorHulls = titleCandidates.filter(
    (item) => item.make !== "Yamaha",
  );
  const yamahaModel =
    /\byamaha\s+(?:(?:AR|SX|SR|LS|LX)\s*\d+|[12]\d{2}(?:FSH|XE|XD|SD|SE|S|E|X)?\b(?!\s*(?:hp|horsepower|SHO|VMAX|outboard|four[ -]?stroke|4[ -]?stroke|motor|engine)\b)|(?:FX|VX|EX|GP)\b|wave\s*runner|superjet|jet\s*boat)/i.test(
      title,
    );
  const yamahaEngine =
    /\byamaha\s+(?:(?:F|VF)\d+\b|(?:\d+\s*(?:hp|horsepower)\b)|(?:\d+\s*)?(?:SHO|VMAX|outboard|four\s*stroke|4[ -]?stroke|motor|engine)\b)/i.test(
      title,
    );
  const hullCandidates = titleCandidates.filter(
    (item) =>
      item.make !== "Yamaha" ||
      (!nonMotorHulls.length && (!yamahaEngine || yamahaModel)),
  );
  const engineText = [
    raw.engineMake,
    specs.engineMake,
    raw.engine,
    specs.engineDescription,
  ]
    .filter((value) => typeof value === "string")
    .join(" ");
  const explicitMotors = motorMakes.filter((make) =>
    new RegExp(`\\b${make.replace(/ /g, "\\s+")}\\b`, "i").test(engineText),
  );
  const titleMotors = motorMakes.filter((make) => {
    if (!new RegExp(`\\b${make}\\b`, "i").test(title)) return false;
    return (
      make !== "Yamaha" ||
      !!nonMotorHulls.length ||
      (yamahaEngine && !yamahaModel)
    );
  });
  const structuredMotor = structured
    ? motorMakes.find((make) =>
        new RegExp(`\\b${make.replace(/ /g, "\\s+")}\\b`, "i").test(structured),
      )
    : undefined;
  const suppliedMotorOnly =
    structuredMotor &&
    (structuredMotor !== "Yamaha" ||
      /\b(?:outboards?|motors?|engines?|SHO|VMAX|hp|horsepower)\b/i.test(
        structured!,
      ) ||
      (!!nonMotorHulls.length && !yamahaModel) ||
      (yamahaEngine && !yamahaModel));
  const engineCandidates = explicitMotors.length
    ? explicitMotors
    : titleMotors.length
      ? titleMotors
      : suppliedMotorOnly
        ? [structuredMotor!]
        : [];
  const engineMake = engineCandidates.length === 1 ? engineCandidates[0] : null;
  const engineConflict =
    engineCandidates.length > 1 ||
    (!!engineMake && titleMotors.some((make) => make !== engineMake));
  const engineWarning = engineConflict
    ? `Engine manufacturer needs review: specification candidates ${explicitMotors.join(", ") || "none"}; title candidates ${titleMotors.join(", ") || "none"}. ${engineMake ? "Structured engine evidence retained; confirm installed engines with the seller." : "More than one manufacturer is mentioned; no single engine make asserted."}`
    : null;
  const candidates = [...new Set(hullCandidates.map((item) => item.make))];
  const credibleStructured =
    structured && !suppliedMotorOnly ? structured : null;
  const make =
    credibleStructured || (candidates.length === 1 ? candidates[0] : null);
  const conflict = !!(
    (credibleStructured &&
      candidates.some(
        (candidate) => makeKey(candidate) !== makeKey(credibleStructured),
      )) ||
    suppliedMotorOnly ||
    candidates.length > 1
  );
  const uncertain = !make || conflict;
  const explanation = conflict
    ? `Hull make needs review: structured make ${structured || "not supplied"}; title hull candidates ${candidates.join(", ") || "none"}. ${credibleStructured ? "Structured hull make retained." : make ? "Hull title evidence used instead of a motor manufacturer." : "Hull make left unknown."}`
    : make
      ? `${credibleStructured ? "Structured hull make" : "Title hull make"}: ${make}${engineMake ? `; engine manufacturer reported separately as ${engineMake}` : ""}.`
      : "No unambiguous hull make evidence; left unknown.";
  return {
    make,
    engineMake,
    engineWarning,
    structured,
    candidates,
    conflict,
    uncertain,
    explanation,
    confidence: make ? (conflict ? 0.65 : credibleStructured ? 1 : 0.8) : 0,
  };
}
export function normalizeListing(
  raw: Record<string, unknown>,
  source: string,
  pageUrl: string,
): Listing {
  const title = String(raw.title || raw.name || "Boat listing")
    .replace(/\s+/g, " ")
    .trim();
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
  const inference = inferMake(raw, title, suppliedSpecs);
  const { make } = inference;
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
    specs: {
      ...suppliedSpecs,
      // Undated parser evidence: the collector/reparse boundary records the real
      // capture timestamp through recordFieldProvenance, never parse-time now.
      ...(inference.structured ? { makeReported: inference.structured } : {}),
      ...(inference.candidates.length
        ? { makeTitleCandidates: inference.candidates.join(" | ") }
        : {}),
      ...(inference.engineMake ? { engineMake: inference.engineMake } : {}),
      ...(inference.engineWarning
        ? { engineMakeWarning: inference.engineWarning }
        : {}),
      ...(inference.uncertain
        ? { makeUncertain: true, makeWarning: inference.explanation }
        : {}),
      ...(inference.conflict ? { makeConflict: true } : {}),
    },
    engines: inference.engineMake ? [{ make: inference.engineMake }] : [],
    confidence: {
      title: 1,
      price: price == null ? 0 : 0.95,
      make: inference.confidence,
      "engines.make": inference.engineMake
        ? inference.engineWarning
          ? 0.65
          : 0.8
        : 0,
      model: raw.model ? 1 : 0.55,
      year: raw.year ? 1 : 0.9,
    },
    rawPayload: raw,
  });
}
