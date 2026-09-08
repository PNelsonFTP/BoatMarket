import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { cityQuerySchema } from "../lib/location-review";
import { allListings, acquireLock, releaseLock } from "./repository";
import { db } from "./db";
import { locationKey, locateListing, readLocations } from "./locations";
import { atomicJson } from "./refresh-report";
export const reviewFile = () =>
  process.env.LOCATION_REVIEW_FILE || "data/location-review.json";
export async function readLocationReview(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(reviewFile(), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}
export async function applyCachedLocations(owner?: string) {
  const locations = await readLocations();
  let updated = 0;
  // Read and update each listing in one transaction so a collector observation cannot be overwritten by stale enrichment.
  for (const { id } of await db.listing.findMany({
    select: { id: true },
    where: { isSample: false },
  })) {
    updated += await db.$transaction(async (tx) => {
      if (
        owner &&
        !(await tx.jobLock.findFirst({
          where: { key: "collector", owner, expiresAt: { gt: new Date() } },
        }))
      )
        throw new Error("Collector lease lost; refusing location write");
      const row = await tx.listing.findUnique({ where: { id } });
      if (!row) return 0;
      const listing = {
        ...(row.data as import("../lib/types").Listing),
        lat: row.lat,
        lng: row.lng,
      };
      const next = locateListing(listing, locations);
      if (JSON.stringify(next) === JSON.stringify(listing)) return 0;
      await tx.listing.update({
        where: { id },
        data: {
          data: JSON.parse(JSON.stringify(next)),
          confidence: next.confidence,
          lat: next.lat,
          lng: next.lng,
        },
      });
      return 1;
    });
  }
  return updated;
}
export function registerLocationRoutes(app: FastifyInstance) {
  app.get("/api/admin/locations", async () => {
    const [listings, locations, reviews] = await Promise.all([
      allListings(),
      readLocations(),
      readLocationReview(),
    ]);
    const groups = new Map<
      string,
      {
        city: string;
        state: string;
        ads: number;
        unknown: number;
        offsite: number;
      }
    >();
    for (const l of listings) {
      if (!l.city || !l.state) continue;
      const key = locationKey(l.city, l.state);
      const g = groups.get(key) || {
        city: l.city,
        state: l.state,
        ads: 0,
        unknown: 0,
        offsite: 0,
      };
      g.ads++;
      if (l.lat == null || l.lng == null) g.unknown++;
      if (l.specs.boatLocationUnknown) g.offsite++;
      groups.set(key, g);
    }
    return {
      cities: [...groups]
        .map(([key, g]) => ({
          key,
          ...g,
          point: locations[key] || null,
          review: reviews[key] || null,
        }))
        .sort((a, b) => b.unknown - a.unknown || a.key.localeCompare(b.key)),
      missingCity: listings.filter((l) => !l.city || !l.state).length,
    };
  });
  app.put("/api/admin/locations", async (req, reply) => {
    const input = cityQuerySchema
      .extend({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        label: z.string().trim().min(3).max(500),
        evidence: z.string().trim().min(5).max(2000),
      })
      .parse(req.body);
    const owner = await acquireLock("collector", 3600000);
    if (!owner)
      return reply
        .code(409)
        .send({
          error: "Collection or enrichment is running; retry after it finishes",
        });
    try {
      const locations = await readLocations(),
        reviews = await readLocationReview(),
        key = locationKey(input.city, input.state),
        at = new Date().toISOString();
      const previous = locations[key] || null;
      locations[key] = {
        lat: input.lat,
        lng: input.lng,
        label: input.label,
        source: "User-reviewed city center",
        fetchedAt: at,
        reviewed: true,
      };
      reviews[key] = {
        status: "reviewed",
        reviewedAt: at,
        evidence: input.evidence,
        previous,
      };
      // Write evidence first. A failed cache write cannot silently apply a correction without its explanation.
      await atomicJson(reviewFile(), reviews);
      await atomicJson(
        process.env.LOCATION_CONFIG || "config/locations.json",
        locations,
      );
      return {
        updated: await applyCachedLocations(owner),
        message:
          "City center corrected. Exact source coordinates and offsite boat locations are preserved. Export a snapshot to update the static website.",
      };
    } finally {
      await releaseLock("collector", owner);
    }
  });
}
