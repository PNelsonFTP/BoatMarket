/** Explicit, one-time lookup of distinct collected cities. Never run by the worker. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db } from "../server/db";
import { allListings } from "../server/repository";
import { locationKey, readLocations, locateListing } from "../server/locations";
import { requestPublic } from "../server/network";
import { readSources } from "../server/collector";
import { adapters } from "../server/adapters";
const locations = await readLocations();
const listings = await allListings(false);
// --cached-pages can prepare locations while the separate collector visits details.
if (process.argv.includes("--cached-pages"))
  for (const source of await readSources())
    for (const url of source.urls) {
      try {
        const html = await readFile(
          "data/cache/" +
            createHash("sha256").update(url).digest("hex") +
            ".html",
          "utf8",
        );
        listings.push(...adapters[source.adapter].parse(html, url, source));
      } catch {}
    }
const queries = [
  ...new Map(
    listings
      .filter(
        (l) =>
          l.city &&
          l.state &&
          (l.lat == null || l.lng == null) &&
          ["IL", "WI", "IN", "IA", "MI"].includes(l.state),
      )
      .map((l) => [
        locationKey(l.city!, l.state!),
        {
          city: l.city!,
          state: l.state!,
          zip: String(l.specs.postalCode || ""),
        },
      ]),
  ).entries(),
]
  .filter(([key]) => !locations[key])
  .slice(0, 100);
for (const [key, q] of queries) {
  if (locations[key]) continue;
  await new Promise((r) => setTimeout(r, 1200));
  const region: Record<string, string> = {
    IL: "Illinois",
    WI: "Wisconsin",
    IN: "Indiana",
    MI: "Michigan",
    IA: "Iowa",
  };
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&limit=5&city=" +
    encodeURIComponent(q.city) +
    "&state=" +
    region[q.state] +
    (q.zip ? "&postalcode=" + encodeURIComponent(q.zip) : "");
  try {
    const response = await requestPublic(url, {
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) throw new Error("HTTP " + response.status);
    const first = JSON.parse(response.body).find((v: { addresstype: string }) =>
      ["city", "town", "village", "hamlet", "municipality"].includes(
        v.addresstype,
      ),
    );
    if (!first) throw new Error("No city found");
    const lat = Number(first.lat),
      lng = Number(first.lon);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < 24 ||
      lat > 50 ||
      lng < -125 ||
      lng > -66
    )
      throw new Error("Unexpected coordinates");
    locations[key] = {
      lat,
      lng,
      label: first.display_name,
      source: "https://www.openstreetmap.org/copyright",
      fetchedAt: new Date().toISOString(),
    };
    await writeFile(
      "config/locations.json",
      JSON.stringify(locations, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({ city: key, lat, lng, label: first.display_name }),
    );
  } catch (error) {
    console.log(JSON.stringify({ city: key, error: String(error) }));
  }
}
let updated = 0;
for (const listing of await allListings(false)) {
  const next = locateListing(listing, locations);
  // Coordinate enrichment is not a new source observation or a price change.
  if (next !== listing) {
    await db.listing.update({
      where: { id: listing.id },
      data: {
        data: JSON.parse(JSON.stringify(next)),
        confidence: next.confidence,
        lat: next.lat,
        lng: next.lng,
      },
    });
    updated++;
  }
}
console.log(
  `Located ${updated} listings using ${Object.keys(locations).length} cached cities.`,
);
await db.$disconnect();
