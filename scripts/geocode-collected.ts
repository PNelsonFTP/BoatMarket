/** Explicit bounded city enrichment. Ambiguity is retained for review, never guessed. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../server/db";
import { allListings, acquireLock, releaseLock } from "../server/repository";
import { readLocations } from "../server/locations";
import { requestPublic } from "../server/network";
import { readSources } from "../server/collector";
import { adapters } from "../server/adapters";
import {
  groupLocationQueries,
  rankLocationCandidates,
  US_STATES,
} from "../lib/location-review";
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
    const groups = groupLocationQueries(
      listings.filter((listing) => listing.lat == null || listing.lng == null),
    ).filter(({ key }) => !locations[key]);
    const conflicts = groups.filter((group) => group.conflictingPostalCodes);
    // One city cache entry applies to every matching ad. Conflicting ZIP evidence must not be reduced to whichever ad happened to be last.
    for (const group of conflicts) {
      reviews[group.key] = {
        query: group.query,
        checkedAt: new Date().toISOString(),
        status: "needs-review",
        postalCodes: group.postalCodes,
        reason:
          "Ads for this city have conflicting ZIP codes; review the city/locality before assigning a shared center",
        candidates: [],
        chosen: null,
      };
    }
    if (conflicts.length) {
      await lease.checkpoint();
      await atomicJson(reviewFile(), reviews);
    }
    const queries = groups
      .filter((group) => !group.conflictingPostalCodes)
      .slice(0, 100);
    let errors = 0,
      ambiguous = conflicts.length;
    for (const { key, query: q } of queries) {
      await lease.checkpoint();
      await delay(1200, undefined, { signal: lease.signal });
      const parameters = new URLSearchParams({
        format: "jsonv2",
        addressdetails: "1",
        countrycodes: "us",
        limit: "5",
        city: q.city,
        state: US_STATES[q.state],
        ...(q.zip ? { postalcode: q.zip } : {}),
      });
      let responseStatus = 0;
      try {
        const response = await requestPublic(
          "https://nominatim.openstreetmap.org/search?" + parameters,
          { headers: { accept: "application/json" }, signal: lease.signal },
        );
        responseStatus = response.status;
        if (response.status !== 200) throw new Error("HTTP " + response.status);
        const ranked = rankLocationCandidates(q, JSON.parse(response.body)),
          at = new Date().toISOString();
        reviews[key] = {
          query: q,
          checkedAt: at,
          status: ranked.chosen ? "automatic" : "needs-review",
          ...ranked,
        };
        await lease.checkpoint();
        await atomicJson(reviewFile(), reviews);
        if (ranked.chosen) {
          locations[key] = {
            lat: ranked.chosen.lat,
            lng: ranked.chosen.lng,
            label: ranked.chosen.label,
            source: "https://www.openstreetmap.org/copyright",
            fetchedAt: at,
          };
          await atomicJson(
            process.env.LOCATION_CONFIG || "config/locations.json",
            locations,
          );
        } else ambiguous++;
        console.log(
          JSON.stringify({
            city: key,
            outcome: ranked.reason,
            candidates: ranked.candidates.length,
          }),
        );
      } catch (error) {
        if (lease.signal.aborted) throw error;
        errors++;
        console.error(JSON.stringify({ city: key, error: String(error) }));
        reviews[key] = {
          query: q,
          checkedAt: new Date().toISOString(),
          status: "failed",
          error: String(error),
        };
        await atomicJson(reviewFile(), reviews);
        if ([403, 429].includes(responseStatus)) break;
      }
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
