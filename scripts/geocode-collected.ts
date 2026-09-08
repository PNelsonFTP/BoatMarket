/** Explicit bounded city enrichment. Ambiguity is retained for review, never guessed. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db } from "../server/db";
import { allListings, acquireLock, releaseLock } from "../server/repository";
import { readLocations } from "../server/locations";
import { geocode, geocoderConfig } from "../server/geocoder";
import { readSources } from "../server/collector";
import { adapters } from "../server/adapters";
import { groupPostalLocationQueries } from "../lib/location-review";
import {
  applyCachedLocations,
  readLocationReview,
  reviewFile,
} from "../server/location-review";
import { atomicJson } from "../server/refresh-report";
import { startCollectorLease } from "../server/lease";
const controller = new AbortController();
const stop = () => controller.abort(new Error("Geocoding stopped"));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
let owner: string | null = null;
let lease: ReturnType<typeof startCollectorLease> | null = null;
try {
  if (process.argv.slice(2).some((a) => a !== "--cached-pages"))
    throw new Error("Usage: npm run geocode:listings -- [--cached-pages]");
  owner =
    process.env.GEOCODE_COLLECTOR_OWNER ||
    (await acquireLock("collector", 3600000));
  if (!owner) {
    process.exitCode = 3;
    console.error("Collection or enrichment already running");
  } else {
    lease = startCollectorLease(owner, { signal: controller.signal });
    await lease.checkpoint();
    const locations = await readLocations(),
      reviews = await readLocationReview(),
      listings = await allListings(false);
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
    const queries = groupPostalLocationQueries(
      listings.filter(
        (listing) =>
          listing.lat == null ||
          listing.lng == null ||
          /city center|Ambiguous city/.test(
            String(listing.specs.locationPrecision),
          ),
      ),
    )
      .filter(({ key }) => !locations[key])
      .slice(0, 100);
    let errors = 0,
      ambiguous = 0;
    const config = geocoderConfig();
    if (!config.enabled && queries.length)
      console.log(
        JSON.stringify({
          provider: config.base,
          networking: "disabled",
          reason: config.reason,
          policyUrl: config.policyUrl,
        }),
      );
    for (const { key, query } of queries) {
      await lease.checkpoint();
      const outcome = await geocode(query, {
        batch: true,
        signal: lease.signal,
      });
      reviews[key] = outcome;
      await lease.checkpoint();
      await atomicJson(reviewFile(), reviews);
      if (outcome.status === "unconfigured") break;
      if (outcome.status === "failed") {
        errors++;
        console.error(
          JSON.stringify({
            city: key,
            error: outcome.error,
            retryAt: outcome.retryAt,
          }),
        );
        continue;
      }
      if (outcome.chosen) {
        locations[key] = {
          lat: outcome.chosen.lat,
          lng: outcome.chosen.lng,
          label: outcome.chosen.label,
          source: outcome.provider,
          fetchedAt: outcome.checkedAt,
          ...(query.zip ? { zip: query.zip } : {}),
        };
        await atomicJson(
          process.env.LOCATION_CONFIG || "config/locations.json",
          locations,
        );
      } else ambiguous++;
      console.log(
        JSON.stringify({
          city: key,
          outcome: outcome.status,
          cached: outcome.cached || false,
          candidates: outcome.candidates?.length,
          retryAt: outcome.retryAt,
        }),
      );
    }
    await lease.checkpoint();
    console.log(
      JSON.stringify({
        updated: await applyCachedLocations(owner),
        cachedCities: Object.keys(locations).length,
        ambiguous,
        errors,
      }),
    );
    if (errors) process.exitCode = 2;
  }
} catch (error) {
  console.error(String(error));
  process.exitCode = controller.signal.aborted ? 130 : 1;
} finally {
  await lease?.stop();
  if (owner && !process.env.GEOCODE_COLLECTOR_OWNER)
    await releaseLock("collector", owner);
  await db.$disconnect();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
