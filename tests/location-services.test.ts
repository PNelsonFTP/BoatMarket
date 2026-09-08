import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import Fastify from "fastify";
import { ZodError } from "zod";
import { makeSeed } from "../lib/seed";
import { listingSchema } from "../lib/types";
const requestService = vi.hoisted(() => vi.fn());
vi.mock("../server/configured-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/configured-service")>()),
  requestConfiguredService: requestService,
}));
const directory = await mkdtemp(join(tmpdir(), "boatscout-locations-"));
process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;
const { db } = await import("../server/db");
const { upsertListing, sourceRecordFingerprint } =
  await import("../server/repository");
const { registerBoatLocationRoutes } =
  await import("../server/boat-location-review");
const { geocode, geocoderConfig, geocodeKey } =
  await import("../server/geocoder");
const { calculateRoute, registerRoutingRoutes, parseOsrmRoute } =
  await import("../server/routing");
const { withProviderLimit, providerCooldown, retryDelay } =
  await import("../server/provider-limiter");
const app = Fastify();
app.setErrorHandler<Error & { statusCode?: number }>((error, _req, reply) =>
  reply
    .code(error instanceof ZodError ? 400 : error.statusCode || 500)
    .send({ error: error.message }),
);
registerBoatLocationRoutes(app);
registerRoutingRoutes(app);
const original = {
  ...makeSeed()[0],
  id: "boat-review",
  sourceListingId: "boat-review",
  sourceUrl: "https://example.com/boat",
  isSample: false,
  lat: null,
  lng: null,
  sellerLat: 42,
  sellerLng: -89,
  specs: { boatLocationUnknown: true },
  fieldProvenance: undefined,
};
beforeAll(async () => {
  await writeFile(join(directory, "test.db"), "");
  const r = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, encoding: "utf8" },
  );
  if (r.status) throw new Error(r.stdout + r.stderr);
  await app.ready();
});
beforeEach(async () => {
  requestService.mockReset();
  delete process.env.GEOCODER_URL;
  delete process.env.GEOCODER_PUBLIC_POLICY_ACCEPTED;
  delete process.env.ROUTING_URL;
  await db.routeCache.deleteMany();
  await db.geocodeCache.deleteMany();
  await db.providerState.deleteMany();
  await db.jobLock.deleteMany();
  await db.locationOverrideEvent.deleteMany();
  await db.locationOverride.deleteMany();
  await db.listing.deleteMany();
  await db.listing.create({
    data: {
      id: original.id,
      source: original.source,
      sourceListingId: original.sourceListingId,
      sourceUrl: original.sourceUrl,
      title: original.title,
      lat: null,
      lng: null,
      data: JSON.parse(JSON.stringify(original)),
    },
  });
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
it("saves, rejects stale writes, and reverses private actual boat location with monotonic revisions and history", async () => {
  const url = `/api/admin/locations/listings/${original.id}`;
  const payload = {
    lat: 41.5,
    lng: -88.5,
    label: "Boat storage marina",
    evidence: "Seller confirmed the boat is stored here",
    sourceUrl: "https://example.com/contact",
    revision: 0,
  };
  const saved = await app.inject({ method: "PUT", url, payload });
  expect(saved.statusCode).toBe(200);
  expect(saved.json().revision).toBe(1);
  const row = await db.listing.findUniqueOrThrow({
    where: { id: original.id },
  });
  expect(listingSchema.parse(row.data)).toMatchObject({
    lat: 41.5,
    sourceLocation: { lat: null, sellerLat: 42 },
    locationOverride: { revision: 1 },
  });
  expect((await app.inject({ method: "PUT", url, payload })).statusCode).toBe(
    409,
  );
  expect(
    (await app.inject({ method: "DELETE", url, payload: { revision: 0 } }))
      .statusCode,
  ).toBe(409);
  expect(
    (await app.inject({ method: "DELETE", url, payload: { revision: 1 } }))
      .statusCode,
  ).toBe(200);
  const restored = listingSchema.parse(
    (await db.listing.findUniqueOrThrow({ where: { id: original.id } })).data,
  );
  expect(restored.lat).toBeNull();
  expect(restored.sellerLat).toBe(42);
  expect(restored.locationOverride).toBeUndefined();
  expect((await app.inject({ method: "PUT", url, payload })).statusCode).toBe(
    409,
  );
  const listing = (
    await app.inject({ url: "/api/admin/locations/listings" })
  ).json().listings[0];
  expect(listing).toMatchObject({ revision: 2, override: null });
  expect(
    (
      await app.inject({
        method: "PUT",
        url,
        payload: { ...payload, revision: 2 },
      })
    ).json().revision,
  ).toBe(3);
  expect(
    (await app.inject({ url: `${url}/history` }))
      .json()
      .history.map((entry: { action: string }) => entry.action),
  ).toEqual(["set", "revert", "set"]);
});
it("validates location evidence and leaves unknown offsite boats unroutable", async () => {
  const invalid = await app.inject({
    method: "PUT",
    url: `/api/admin/locations/listings/${original.id}`,
    payload: {
      lat: 91,
      lng: -88,
      label: "Boat",
      evidence: "No",
      sourceUrl: "javascript:alert(1)",
      revision: 0,
    },
  });
  expect(invalid.statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/listings/${original.id}/route`,
        payload: {},
      })
    ).statusCode,
  ).toBe(400);
  expect(requestService).not.toHaveBeenCalled();
});
it("retains reviewed boat coordinates across a source refresh, preserving latest source position and personal notes", async () => {
  await db.user.upsert({
    where: { id: "local" },
    create: { id: "local" },
    update: {},
  });
  await db.note.create({
    data: {
      userId: "local",
      listingId: original.id,
      text: "Please keep my private seller note",
    },
  });
  await db.favorite.create({
    data: { userId: "local", listingId: original.id },
  });
  const url = `/api/admin/locations/listings/${original.id}`;
  await app.inject({
    method: "PUT",
    url,
    payload: {
      lat: 41.5,
      lng: -88.5,
      label: "Reviewed location",
      evidence: "Source evidence checked by owner",
      revision: 0,
    },
  });
  const row = await db.listing.findUniqueOrThrow({
    where: { id: original.id },
  });
  const expectedFingerprint = sourceRecordFingerprint(row);
  await upsertListing(
    {
      ...original,
      sellerLat: 43,
      sellerLng: -90,
      lastSeenAt: new Date().toISOString(),
    },
    { expectedFingerprint },
  );
  const refreshed = listingSchema.parse(
    (await db.listing.findUniqueOrThrow({ where: { id: original.id } })).data,
  );
  expect(refreshed).toMatchObject({
    lat: 41.5,
    lng: -88.5,
    sourceLocation: { lat: null, sellerLat: 43 },
    locationOverride: { revision: 1 },
  });
  expect(refreshed.fieldProvenance?.length?.[0].method).toBe("import");
  expect((await db.note.findFirstOrThrow()).text).toBe(
    "Please keep my private seller note",
  );
  expect(await db.favorite.count()).toBe(1);
  await expect(
    upsertListing(
      { ...original, title: "Stale review should not win" },
      { expectedFingerprint },
    ),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    upsertListing(original, { expectedFingerprint: null }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(
    (await db.listing.findUniqueOrThrow({ where: { id: original.id } })).title,
  ).toBe(original.title);
  await app.inject({ method: "DELETE", url, payload: { revision: 1 } });
  expect(
    listingSchema.parse(
      (await db.listing.findUniqueOrThrow({ where: { id: original.id } })).data,
    ),
  ).toMatchObject({ lat: null, sellerLat: 43 });
});
it("requires an explicit public provider decision while preserving usable cached results", async () => {
  expect(geocoderConfig().enabled).toBe(false);
  expect((await geocode("Wheaton IL")).status).toBe("unconfigured");
  const result = {
    status: "automatic",
    query: "Wheaton IL",
    checkedAt: new Date().toISOString(),
    retryAt: new Date(Date.now() + 86400000).toISOString(),
    attempts: 1,
    provider: geocoderConfig().base,
    results: [{ name: "Wheaton IL", lat: 41.8, lng: -88.1 }],
  };
  await db.geocodeCache.create({
    data: {
      query: geocodeKey(geocoderConfig().base, "Wheaton IL"),
      results: result,
    },
  });
  expect(await geocode("Wheaton IL")).toMatchObject({
    cached: true,
    results: result.results,
  });
  expect(requestService).not.toHaveBeenCalled();
});
it("reuses validated legacy public geocoder cache only for that same configured provider", async () => {
  await db.geocodeCache.create({
    data: {
      query: "wheaton il",
      results: [{ name: "Wheaton IL", lat: 41.8, lng: -88.1 }],
    },
  });
  expect(await geocode("Wheaton IL")).toMatchObject({
    cached: true,
    status: "automatic",
  });
  expect(requestService).not.toHaveBeenCalled();
  process.env.GEOCODER_URL = "https://another-geocoder.example.com";
  requestService.mockResolvedValueOnce({
    status: 200,
    body: "[]",
    headers: {},
  });
  expect((await geocode("Wheaton IL")).cached).not.toBe(true);
  expect(requestService).toHaveBeenCalledTimes(1);
});
it("caches ambiguity per city/state/ZIP and retries it only after its review interval", async () => {
  process.env.GEOCODER_URL = "https://geocoder.example.com";
  const candidate = {
    lat: 42.9,
    lon: -85.9,
    display_name: "Allendale MI",
    name: "Allendale",
    addresstype: "village",
    address: { village: "Allendale", state: "Michigan", country_code: "us" },
  };
  requestService.mockResolvedValue({
    status: 200,
    body: JSON.stringify([candidate, { ...candidate, lat: 43.9 }]),
    headers: {},
  });
  const query = { city: "Allendale", state: "MI", zip: "" },
    first = await geocode(query);
  expect(first.status).toBe("needs-review");
  expect((await geocode(query)).cached).toBe(true);
  expect(requestService).toHaveBeenCalledTimes(1);
  expect(
    geocodeKey(geocoderConfig().base, { ...query, zip: "49401" }),
  ).not.toBe(geocodeKey(geocoderConfig().base, { ...query, zip: "48625" }));
  await db.providerState.deleteMany();
  await geocode(query, { now: Date.parse(first.retryAt) + 1 });
  expect(requestService).toHaveBeenCalledTimes(2);
});
it("honors shared provider cooldown after throttling and exposes cached failure retry metadata", async () => {
  process.env.GEOCODER_URL = "https://geocoder.example.com";
  requestService.mockResolvedValue({
    status: 429,
    body: "",
    headers: { "retry-after": "3600" },
  });
  const result = await geocode("Wheaton IL");
  expect(result.status).toBe("failed");
  expect(Date.parse(result.retryAt)).toBeGreaterThan(Date.now() + 3500000);
  expect((await geocode("Wheaton IL")).cached).toBe(true);
  expect((await geocode("Naperville IL")).status).toBe("failed");
  expect(requestService).toHaveBeenCalledTimes(1);
  expect(retryDelay(1, 403)).toBe(86400000);
  expect(retryDelay(4, 503)).toBeGreaterThan(retryDelay(1, 503));
});
it("serializes concurrent users through the shared provider state and releases failed operations", async () => {
  const starts: number[] = [];
  const work = () =>
    withProviderLimit(
      "shared-fixture",
      60,
      async () => {
        starts.push(Date.now());
        return true;
      },
      { maxWaitMs: 1000 },
    );
  expect(await Promise.all([work(), work()])).toEqual([true, true]);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(55);
  await expect(
    withProviderLimit("throw-fixture", 1, async () => {
      throw new Error("fixture failed");
    }),
  ).rejects.toThrow("fixture failed");
  expect(await db.jobLock.count()).toBe(0);
  await providerCooldown("blocked-fixture", 60000);
  await expect(
    withProviderLimit("blocked-fixture", 1, async () => true, {
      maxWaitMs: 10,
    }),
  ).rejects.toMatchObject({ statusCode: 429 });
  expect(await db.jobLock.count()).toBe(0);
});
it("keeps unconfigured, failed and cached road estimates distinct without straight-line fallback", async () => {
  const origin = { lat: 41.6, lng: -88.6 },
    destination = { lat: 42, lng: -89 };
  expect((await calculateRoute(origin, destination)).estimate.status).toBe(
    "unconfigured",
  );
  expect(requestService).not.toHaveBeenCalled();
  process.env.ROUTING_URL = "https://router.example.com";
  requestService.mockResolvedValueOnce({
    status: 200,
    body: JSON.stringify({ code: "NoRoute" }),
    headers: {},
  });
  const failed = await calculateRoute(origin, destination);
  expect(failed.estimate.status).toBe("failed");
  expect(failed.estimate).not.toHaveProperty("durationMinutes");
  expect((await calculateRoute(origin, destination)).cached).toBe(true);
  expect(requestService).toHaveBeenCalledTimes(1);
  await db.routeCache.deleteMany();
  await db.providerState.deleteMany();
  requestService.mockResolvedValueOnce({
    status: 200,
    body: JSON.stringify({
      code: "Ok",
      routes: [{ duration: 14400, distance: 321868.8 }],
    }),
    headers: {},
  });
  expect((await calculateRoute(origin, destination)).estimate).toMatchObject({
    status: "ready",
    durationMinutes: 240,
    distanceMiles: 200,
    provider: "OSRM",
  });
  expect((await calculateRoute(origin, destination)).cached).toBe(true);
  expect(() =>
    parseOsrmRoute({ code: "Ok", routes: [{ duration: -1, distance: 4 }] }),
  ).toThrow();
});
it("rejects attaching a route if the boat location changes during the provider request", async () => {
  process.env.ROUTING_URL = "https://router.example.com";
  await db.listing.update({
    where: { id: original.id },
    data: {
      lat: 42,
      lng: -89,
      data: JSON.parse(JSON.stringify({ ...original, lat: 42, lng: -89 })),
    },
  });
  requestService.mockImplementationOnce(async () => {
    await db.listing.update({ where: { id: original.id }, data: { lat: 43 } });
    return {
      status: 200,
      body: JSON.stringify({
        code: "Ok",
        routes: [{ duration: 3600, distance: 10000 }],
      }),
      headers: {},
    };
  });
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/listings/${original.id}/route`,
        payload: {},
      })
    ).statusCode,
  ).toBe(409);
  expect(
    listingSchema.parse(
      (await db.listing.findUniqueOrThrow({ where: { id: original.id } })).data,
    ).routeEstimate,
  ).toBeUndefined();
});
