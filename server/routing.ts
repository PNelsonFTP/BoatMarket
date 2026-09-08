import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db";
import {
  listingSchema,
  pointSchema,
  routeEstimateSchema,
  type Listing,
} from "../lib/types";
import { LAKE_HOLIDAY } from "../lib/lake-holiday";
import { configuredBase, requestConfiguredService } from "./configured-service";
import {
  providerCooldown,
  retryDelay,
  withProviderLimit,
} from "./provider-limiter";
export const OSRM_DOCS_URL = "https://project-osrm.org/docs/v5.24.0/api/";
export function routingConfig() {
  const configured = !!process.env.ROUTING_URL;
  return {
    configured,
    base: configured ? configuredBase(process.env.ROUTING_URL!) : "",
    provider: process.env.ROUTING_PROVIDER_NAME || "OSRM",
    profile: process.env.ROUTING_PROFILE || "driving",
    cacheDays: Math.max(
      1,
      Math.min(90, Number(process.env.ROUTING_CACHE_DAYS) || 30),
    ),
    docsUrl: OSRM_DOCS_URL,
  };
}
export function routeCacheKey(
  base: string,
  profile: string,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        base,
        profile,
        origin.lat.toFixed(6),
        origin.lng.toFixed(6),
        destination.lat.toFixed(6),
        destination.lng.toFixed(6),
      ]),
    )
    .digest("hex");
}
export function parseOsrmRoute(value: unknown) {
  const data = z
    .object({
      code: z.string(),
      routes: z
        .array(
          z.object({
            duration: z.number().nonnegative().finite(),
            distance: z.number().nonnegative().finite(),
          }),
        )
        .optional(),
    })
    .parse(value);
  if (data.code !== "Ok" || !data.routes?.length)
    throw new Error(`Routing returned ${data.code}; no usable road route`);
  return {
    durationMinutes: data.routes[0].duration / 60,
    distanceMiles: data.routes[0].distance / 1609.344,
  };
}
export async function calculateRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  signal?: AbortSignal,
) {
  const config = routingConfig(),
    now = new Date().toISOString();
  const initial = {
    status: "unconfigured" as const,
    provider: config.provider,
    providerUrl: config.base,
    origin,
    destination,
    computedAt: now,
    expiresAt: now,
    error:
      "Configure an OSRM-compatible routing provider before requesting road travel times.",
  };
  if (!config.configured) return { estimate: initial, cached: false };
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(config.profile))
    throw new Error("Invalid routing profile");
  const key = routeCacheKey(config.base, config.profile, origin, destination);
  const cached = await db.routeCache.findUnique({ where: { key } });
  if (cached && cached.expiresAt.getTime() > Date.now())
    return { estimate: routeEstimateSchema.parse(cached.data), cached: true };
  const provider = `routing:${new URL(config.base).origin}`;
  let estimate: z.infer<typeof routeEstimateSchema>;
  try {
    const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const response = await withProviderLimit(
      provider,
      1200,
      () =>
        requestConfiguredService(
          `${config.base}/route/v1/${config.profile}/${coordinates}?overview=false&steps=false&alternatives=false`,
          config.base,
          process.env.ROUTING_LOCAL_ORIGINS || "",
          {
            signal,
            headers: {
              accept: "application/json",
              ...(process.env.ROUTING_API_KEY
                ? { authorization: `Bearer ${process.env.ROUTING_API_KEY}` }
                : {}),
            },
          },
        ),
      { signal, maxWaitMs: 5000 },
    );
    if (response.status !== 200) {
      if ([403, 429].includes(response.status))
        await providerCooldown(
          provider,
          retryDelay(
            1,
            response.status,
            String(response.headers["retry-after"] || ""),
          ),
        );
      throw new Error(`Routing provider HTTP ${response.status}`);
    }
    estimate = {
      ...initial,
      ...parseOsrmRoute(JSON.parse(response.body)),
      status: "ready",
      error: undefined,
      expiresAt: new Date(
        Date.now() + config.cacheDays * 86400000,
      ).toISOString(),
    };
  } catch (error) {
    signal?.throwIfAborted();
    estimate = {
      ...initial,
      status: "failed",
      error: (error as Error).message,
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    };
  }
  await db.routeCache.upsert({
    where: { key },
    create: {
      key,
      data: JSON.parse(JSON.stringify(estimate)),
      expiresAt: new Date(estimate.expiresAt),
    },
    update: {
      data: JSON.parse(JSON.stringify(estimate)),
      expiresAt: new Date(estimate.expiresAt),
      createdAt: new Date(),
    },
  });
  return { estimate, cached: false };
}
export function registerRoutingRoutes(app: FastifyInstance) {
  app.get("/api/admin/routing", async () => ({
    ...routingConfig(),
    cacheEntries: await db.routeCache.count(),
    meaning:
      "Road-network estimates without live traffic, stops, or trailer-specific restrictions. Approximate source coordinates imply approximate travel times.",
  }));
  app.post("/api/listings/:id/route", async (req) => {
    const { id } = z
      .object({ id: z.string().min(1).max(200) })
      .parse(req.params);
    const { origin, target } = z
      .object({
        origin: pointSchema.default(LAKE_HOLIDAY),
        target: z.enum(["boat", "seller"]).default("boat"),
      })
      .parse(req.body || {});
    const row = await db.listing.findUnique({ where: { id } });
    if (!row)
      throw Object.assign(new Error("Boat not found"), { statusCode: 404 });
    const listing = listingSchema.parse(row.data),
      lat = target === "seller" ? listing.sellerLat : row.lat,
      lng = target === "seller" ? listing.sellerLng : row.lng;
    if (lat == null || lng == null)
      throw Object.assign(
        new Error(
          "The requested location is unknown. Review the actual boat location first.",
        ),
        { statusCode: 400 },
      );
    const result = await calculateRoute(origin, { lat, lng });
    await db.$transaction(async (tx) => {
      const current = await tx.listing.findUnique({ where: { id } });
      if (!current) return;
      const data = listingSchema.parse(current.data);
      const currentLat = target === "seller" ? data.sellerLat : current.lat,
        currentLng = target === "seller" ? data.sellerLng : current.lng;
      if (currentLat !== lat || currentLng !== lng)
        throw Object.assign(
          new Error(
            "Location changed while routing. Recalculate for the current boat location.",
          ),
          { statusCode: 409 },
        );
      await tx.listing.update({
        where: { id },
        data: {
          data: JSON.parse(
            JSON.stringify({ ...data, routeEstimate: result.estimate }),
          ),
        },
      });
    });
    return result;
  });
}
