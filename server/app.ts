import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z, ZodError } from "zod";
import { db } from "./db";
import {
  allListings,
  getWorkspace,
  putWorkspace,
  upsertListing,
} from "./repository";
import { collect, readSources, writeSources } from "./collector";
import { evaluateAlerts } from "./alerts";
import { requestPublic } from "./network";
import {
  filtersSchema,
  listingSchema,
  savedSearchSchema,
  ruleSchema,
  pointSchema,
} from "../lib/types";
import { searchListings } from "../lib/search";
import { logger } from "./logger";
const workspaceSchema = z.object({
  favorites: z.array(z.string().max(200)).max(5000),
  notes: z.record(z.string().max(20000)),
  savedSearches: z.array(savedSearchSchema).max(200),
  rules: z.array(ruleSchema).max(100),
  alerts: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        body: z.string(),
        createdAt: z.string().datetime(),
        read: z.boolean(),
        listingIds: z.array(z.string()),
      }),
    )
    .max(500),
  referencePoints: z
    .array(pointSchema.extend({ name: z.string().min(1).max(100) }))
    .max(30),
});
export function buildApp(
  options: { password?: string; serveStatic?: boolean } = {},
) {
  const app = Fastify({ loggerInstance: logger, bodyLimit: 12 * 1024 * 1024 });
  const sessions = new Map<string, number>();
  const password = options.password ?? process.env.BOATSCOUT_PASSWORD ?? "";
  const allowed = (
    process.env.ALLOWED_ORIGINS ||
    "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:4310,http://localhost:4310"
  )
    .split(",")
    .map((s) => s.trim());
  app.register(cors, {
    origin: allowed,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (
      req.method === "OPTIONS" ||
      req.url === "/api/health" ||
      req.url === "/api/login"
    )
      return;
    const origin = req.headers.origin;
    if (origin && !allowed.includes(origin))
      return reply
        .code(403)
        .send({ error: "Origin is not in ALLOWED_ORIGINS" });
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token || !(sessions.get(token)! > Date.now()))
      return reply
        .code(401)
        .send({ error: "Connect with your backend password in Settings" });
  });
  app.setErrorHandler((err, req, reply) => {
    const error = err as Error & { statusCode?: number };
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (error.message === "WORKSPACE_CONFLICT")
      return reply.code(409).send({
        error:
          "The workspace changed in another window. Reload before saving again.",
      });
    req.log.error({ err: error }, "Request failed");
    return reply
      .code(error.statusCode && error.statusCode < 500 ? error.statusCode : 500)
      .send({
        error:
          error.statusCode && error.statusCode < 500
            ? error.message
            : "Request failed. Check the backend logs for details.",
      });
  });
  app.get("/api/health", async () => ({
    name: "BoatScout",
    version: "1.0.0",
    authRequired: true,
    configured: !!password,
  }));
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = z
        .object({ password: z.string().min(1).max(500) })
        .parse(req.body);
      if (!password)
        return reply.code(503).send({
          error: "Set BOATSCOUT_PASSWORD in .env; npm run setup generates one.",
        });
      const a = createHash("sha256").update(body.password).digest(),
        b = createHash("sha256").update(password).digest();
      if (!timingSafeEqual(a, b))
        return reply.code(401).send({ error: "Incorrect backend password" });
      for (const [token, expires] of sessions)
        if (expires < Date.now()) sessions.delete(token);
      if (sessions.size > 100) sessions.clear();
      const token = randomBytes(32).toString("base64url");
      sessions.set(token, Date.now() + 12 * 3600000);
      return { token, expiresIn: 43200 };
    },
  );
  app.post("/api/logout", async (req) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (token) sessions.delete(token);
    return { ok: true };
  });
  app.get("/api/listings", async () => ({
    listings: await allListings(),
    generatedAt: new Date().toISOString(),
  }));
  app.post("/api/search", async (req) => {
    const f = filtersSchema.parse(req.body);
    const results = searchListings(await allListings(), f);
    return { results, total: results.length };
  });
  app.get("/api/listings/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().max(200) }).parse(req.params);
    const l = (await allListings()).find((l) => l.id === id);
    return l || reply.code(404).send({ error: "Boat not found" });
  });
  app.get("/api/workspace", getWorkspace);
  app.put("/api/workspace", async (req) => {
    const input = z
      .object({
        revision: z.number().int().nonnegative(),
        workspace: workspaceSchema,
      })
      .parse(req.body);
    const ids = [
      ...input.workspace.favorites,
      ...Object.keys(input.workspace.notes),
    ];
    const existing = await db.listing.count({
      where: { id: { in: [...new Set(ids)] } },
    });
    if (existing !== new Set(ids).size)
      throw Object.assign(new Error("Workspace refers to an unknown listing"), {
        statusCode: 400,
      });
    return putWorkspace(input.workspace, input.revision);
  });
  app.post("/api/import", async (req) => {
    const body = z
      .object({ listings: z.array(listingSchema).min(1).max(1000) })
      .parse(req.body);
    const stats = { new: 0, updated: 0 };
    for (const l of body.listings) {
      const result = await upsertListing(l, { dedupe: true });
      if (result.isNew) stats.new++;
      else if (result.updated) stats.updated++;
    }
    return stats;
  });
  app.post("/api/listings/:id/flag", async (req, reply) => {
    const { id } = z.object({ id: z.string().max(200) }).parse(req.params);
    const { reason } = z
      .object({ reason: z.string().min(1).max(2000) })
      .parse(req.body);
    const l = await db.listing.findUnique({ where: { id } });
    if (!l) return reply.code(404).send({ error: "Boat not found" });
    await db.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: "local" },
        create: { id: "local" },
        update: { workspaceVersion: { increment: 1 } },
      });
      const old = await tx.note.findUnique({
        where: { userId_listingId: { userId: "local", listingId: id } },
      });
      await tx.note.upsert({
        where: { userId_listingId: { userId: "local", listingId: id } },
        create: {
          userId: "local",
          listingId: id,
          text: `[Data flag] ${reason}`,
        },
        update: { text: `${old?.text || ""}\n[Data flag] ${reason}` },
      });
    });
    return { ok: true };
  });
  app.get("/api/admin", async () => ({
    sources: await readSources(),
    runs: await db.ingestRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    }),
    geocodes: await db.geocodeCache.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
    failedDeliveries: await db.alert.findMany({
      where: { deliveryError: { not: null } },
      select: { id: true, title: true, deliveryError: true, attempts: true },
      take: 30,
    }),
    counts: {
      listings: await db.listing.count(),
      samples: await db.listing.count({ where: { isSample: true } }),
    },
    workerLock: await db.jobLock.findUnique({ where: { key: "collector" } }),
  }));
  app.put("/api/admin/sources", async (req) => ({
    sources: await writeSources(req.body),
  }));
  app.post("/api/admin/collect", async (req, reply) => {
    const { sourceId } = z
      .object({ sourceId: z.string().max(100).optional() })
      .parse(req.body ?? {});
    const sources = await readSources();
    const selected = sourceId
      ? sources.filter((s) => s.id === sourceId)
      : sources;
    if (sourceId && !selected.length)
      return reply.code(404).send({ error: "Unknown source" });
    if (!selected.some((s) => s.enabled && s.urls.length))
      return reply
        .code(400)
        .send({ error: "Enable a source and add an inventory URL first" });
    void collect(selected)
      .then(() => evaluateAlerts())
      .catch((err) => logger.error({ err }, "Manual collection failed"));
    return reply
      .code(202)
      .send({ message: "Collection requested; check run history for results" });
  });
  app.delete("/api/admin/geocodes", async () => {
    await db.geocodeCache.deleteMany();
    return { ok: true };
  });
  let lastGeocode = 0;
  let geocoding = false;
  app.get("/api/geocode", async (req, reply) => {
    const { q } = z.object({ q: z.string().min(2).max(200) }).parse(req.query);
    const key = q.trim().toLowerCase();
    const cached = await db.geocodeCache.findUnique({ where: { query: key } });
    if (cached) return { results: cached.results, cached: true };
    if (geocoding || Date.now() - lastGeocode < 1100)
      return reply
        .code(429)
        .send({ error: "Please wait a moment between location searches" });
    geocoding = true;
    lastGeocode = Date.now();
    try {
      const r = await requestPublic(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&limit=5&q=${encodeURIComponent(q)}`,
        { headers: { accept: "application/json" } },
      );
      if (r.status !== 200)
        return reply
          .code(502)
          .send({ error: `Geocoder returned HTTP ${r.status}` });
      const raw = z
        .array(
          z.object({
            display_name: z.string(),
            lat: z.string(),
            lon: z.string(),
          }),
        )
        .parse(JSON.parse(r.body));
      const results = raw.map((x) => ({
        name: x.display_name,
        lat: Number(x.lat),
        lng: Number(x.lon),
      }));
      await db.geocodeCache.upsert({
        where: { query: key },
        create: { query: key, results },
        update: { results },
      });
      return { results, cached: false };
    } finally {
      geocoding = false;
    }
  });
  if (options.serveStatic !== false && existsSync(resolve("out/index.html"))) {
    app.register(fastifyStatic, { root: resolve("out"), prefix: "/" });
  }
  return app;
}
