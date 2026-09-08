import { z } from "zod";
import { db } from "./db";
import {
  rankLocationCandidates,
  US_STATES,
  type CityQuery,
} from "../lib/location-review";
import { configuredBase, requestConfiguredService } from "./configured-service";
import {
  providerCooldown,
  ProviderCooldownError,
  retryDelay,
  withProviderLimit,
} from "./provider-limiter";
export const GEOCODER_POLICY_URL =
  "https://operations.osmfoundation.org/policies/nominatim/";
export function geocoderConfig() {
  const base = configuredBase(
    process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org",
  );
  const publicService =
    new URL(base).hostname === "nominatim.openstreetmap.org";
  const enabled =
    !publicService || process.env.GEOCODER_PUBLIC_POLICY_ACCEPTED === "true";
  return {
    base,
    enabled,
    publicService,
    policyUrl: GEOCODER_POLICY_URL,
    reason: enabled
      ? ""
      : "The public geocoder requires an informed owner choice. Review its usage policy, then configure GEOCODER_PUBLIC_POLICY_ACCEPTED=true or choose a managed/self-hosted provider.",
  };
}
export const geocodeKey = (base: string, query: CityQuery | string) =>
  `geocode:v2:${base}:${typeof query === "string" ? `text:${query.trim().toLowerCase()}` : JSON.stringify([query.city.trim().toLowerCase(), query.state.toUpperCase(), query.zip.slice(0, 5)])}`;
export type GeocodeOutcome = {
  status: "automatic" | "needs-review" | "failed" | "unconfigured";
  query: CityQuery | string;
  checkedAt: string;
  retryAt: string;
  attempts: number;
  candidates?: ReturnType<typeof rankLocationCandidates>["candidates"];
  chosen?: ReturnType<typeof rankLocationCandidates>["chosen"];
  reason?: string;
  error?: string;
  results?: { name: string; lat: number; lng: number }[];
  cached?: boolean;
  provider: string;
};
const freeResults = z.array(
  z.object({
    display_name: z.string(),
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
  }),
);
export async function geocode(
  query: CityQuery | string,
  options: { batch?: boolean; signal?: AbortSignal; now?: number } = {},
): Promise<GeocodeOutcome> {
  const config = geocoderConfig(),
    key = geocodeKey(config.base, query),
    now = options.now ?? Date.now();
  const stored = await db.geocodeCache.findUnique({ where: { query: key } });
  const cached = stored?.results as unknown as GeocodeOutcome | undefined;
  if (cached && Date.parse(cached.retryAt) > now)
    return { ...cached, cached: true };
  // The former interactive endpoint used this fixed public provider and a plain query key.
  // Reuse only validated, unexpired entries from that provider; no cross-provider migration.
  if (!stored && typeof query === "string" && config.publicService) {
    const legacy = await db.geocodeCache.findUnique({
      where: { query: query.trim().toLowerCase() },
    });
    const results = z
      .array(
        z.object({
          name: z.string(),
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        }),
      )
      .safeParse(legacy?.results);
    if (
      legacy &&
      results.success &&
      legacy.createdAt.getTime() + 30 * 86400000 > now
    )
      return {
        status: "automatic",
        query,
        checkedAt: legacy.createdAt.toISOString(),
        retryAt: new Date(
          legacy.createdAt.getTime() + 30 * 86400000,
        ).toISOString(),
        attempts: 1,
        provider: config.base,
        results: results.data,
        cached: true,
      };
  }
  const checkedAt = new Date(now).toISOString(),
    attempts = (cached?.attempts || 0) + 1;
  if (!config.enabled)
    return {
      status: "unconfigured",
      query,
      checkedAt,
      retryAt: checkedAt,
      attempts: 0,
      provider: config.base,
      reason: config.reason,
      results: [],
    };
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "us",
    limit: "5",
    ...(typeof query === "string"
      ? { q: query }
      : {
          city: query.city,
          state: US_STATES[query.state],
          ...(query.zip ? { postalcode: query.zip.slice(0, 5) } : {}),
        }),
  });
  const provider = `geocoder:${new URL(config.base).origin}`;
  let result: GeocodeOutcome;
  try {
    const response = await withProviderLimit(
      provider,
      options.batch ? 15000 : 1200,
      () =>
        requestConfiguredService(
          `${config.base}/search?${params}`,
          config.base,
          process.env.GEOCODER_LOCAL_ORIGINS || "",
          {
            signal: options.signal,
            headers: {
              accept: "application/json",
              ...(process.env.GEOCODER_API_KEY
                ? { authorization: `Bearer ${process.env.GEOCODER_API_KEY}` }
                : {}),
            },
          },
        ),
      { signal: options.signal, maxWaitMs: options.batch ? 30000 : 5000 },
    );
    if (response.status !== 200) {
      const backoff = retryDelay(
        attempts,
        response.status,
        String(response.headers["retry-after"] || ""),
      );
      await providerCooldown(provider, backoff);
      result = {
        status: "failed",
        query,
        checkedAt,
        retryAt: new Date(Date.now() + backoff).toISOString(),
        attempts,
        provider: config.base,
        error: `Geocoder HTTP ${response.status}`,
      };
    } else {
      const raw = JSON.parse(response.body);
      if (typeof query === "string")
        result = {
          status: "automatic",
          query,
          checkedAt,
          retryAt: new Date(now + 30 * 86400000).toISOString(),
          attempts,
          provider: config.base,
          results: freeResults.parse(raw).map((entry) => ({
            name: entry.display_name,
            lat: entry.lat,
            lng: entry.lon,
          })),
        };
      else {
        const ranked = rankLocationCandidates(query, raw);
        result = {
          ...ranked,
          status: ranked.chosen ? "automatic" : "needs-review",
          query,
          checkedAt,
          retryAt: new Date(
            now + (ranked.chosen ? 30 : 7) * 86400000,
          ).toISOString(),
          attempts,
          provider: config.base,
        };
      }
    }
  } catch (error) {
    options.signal?.throwIfAborted();
    const retryAt =
      error instanceof ProviderCooldownError
        ? error.retryAt
        : new Date(now + retryDelay(attempts)).toISOString();
    result = {
      status: "failed",
      query,
      checkedAt,
      retryAt,
      attempts,
      provider: config.base,
      error: (error as Error).message,
    };
  }
  await db.geocodeCache.upsert({
    where: { query: key },
    create: { query: key, results: JSON.parse(JSON.stringify(result)) },
    update: {
      results: JSON.parse(JSON.stringify(result)),
      createdAt: new Date(),
    },
  });
  return result;
}
