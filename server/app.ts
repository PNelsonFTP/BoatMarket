import "dotenv/config";
import Fastify, { type FastifyBaseLogger } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
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
import { registerDuplicateRoutes } from "./duplicates";
import { registerLocationRoutes } from "./location-review";
import { registerSourceHealthRoutes } from "./source-health";
import { readWorkerHeartbeat } from "./worker";
import { runRefresh } from "./refresh";
import { atomicJson, reportDirectory } from "./refresh-report";
import { join } from "node:path";
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
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    bodyLimit: 12 * 1024 * 1024,
  });
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
  app.get("/api/health", async (_req, reply) => {
    let database = "ready";
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      database = "unavailable";
    }
    const heartbeat = await readWorkerHeartbeat().catch(() => null);
    const fresh =
      !!heartbeat &&
      heartbeat.state !== "stopped" &&
      Date.now() - Date.parse(heartbeat.heartbeatAt) < 120000;
    return reply.code(database === "ready" ? 200 : 503).send({
      name: "BoatScout",
      version: "1.0.0",
      authRequired: true,
      configured: !!password,
      database,
      worker: fresh ? heartbeat?.state : "not-reporting",
      workerHeartbeatAt: heartbeat?.heartbeatAt ?? null,
    });
  });
  registerDuplicateRoutes(app);
  registerLocationRoutes(app);
  registerSourceHealthRoutes(app);
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
    if (
      new Set(body.listings.map((l) => l.id)).size !== body.listings.length ||
      new Set(
        body.listings.map((l) => JSON.stringify([l.source, l.sourceListingId])),
      ).size !== body.listings.length
    ) {
      throw Object.assign(
        new Error(
          "Each import chunk must have unique listing IDs and source identities",
        ),
        { statusCode: 400 },
      );
    }
    const stats = {
      new: 0,
      updated: 0,
      acceptedIds: [] as string[],
      idMap: {} as Record<string, string>,
      failed: [] as { id: string; error: string }[],
      unattemptedIds: [] as string[],
    };
    for (let index = 0; index < body.listings.length; index++) {
      const l = body.listings[index];
      try {
        const result = await upsertListing(l, { dedupe: true });
        if (result.isNew) stats.new++;
        else if (result.updated) stats.updated++;
        stats.acceptedIds.push(l.id);
        stats.idMap[l.id] = result.id;
      } catch (error) {
        const e = error as Error & { statusCode?: number };
        req.log.error({ err: e, listingId: l.id }, "Listing import stopped");
        stats.failed.push({
          id: l.id,
          error:
            e.statusCode && e.statusCode < 500
              ? e.message
              : "Import failed; check backend logs before retrying",
        });
        stats.unattemptedIds = body.listings.slice(index + 1).map((l) => l.id);
        break;
      }
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
  let pendingJob: string | null = null;
  const jobControllers = new Set<AbortController>();
  const jobs = new Set<Promise<unknown>>();
  app.addHook("onClose", async () => {
    for (const controller of jobControllers) controller.abort();
    await Promise.allSettled([...jobs]);
  });
  async function queueJob(full: boolean, sourceId?: string) {
    if (
      pendingJob ||
      (await db.jobLock.findFirst({
        where: {
          key: { in: ["collector", "refresh-pipeline"] },
          expiresAt: { gt: new Date() },
        },
      }))
    )
      throw Object.assign(
        new Error("Another collection or refresh is running; check its report"),
        { statusCode: 409 },
      );
    const runId = randomUUID();
    // Set synchronously before the next await; another request in this API process cannot also queue.
    if (pendingJob)
      throw Object.assign(new Error("A refresh was just queued"), {
        statusCode: 409,
      });
    pendingJob = runId;
    try {
      const sources = await readSources();
      const selected = sourceId
        ? sources.filter((s) => s.id === sourceId)
        : sources;
      if (sourceId && !selected.length)
        throw Object.assign(new Error("Unknown source"), { statusCode: 404 });
      if (!selected.some((s) => s.enabled && s.urls.length))
        throw Object.assign(
          new Error("Enable a source and add an inventory URL first"),
          { statusCode: 400 },
        );
      await atomicJson(
        join(reportDirectory(), `${runId}${full ? "-refresh" : ""}.json`),
        {
          runId,
          status: "queued",
          startedAt: new Date().toISOString(),
          completedAt: null,
        },
      );
      const controller = new AbortController();
      jobControllers.add(controller);
      const job = (
        full
          ? runRefresh({ sources: selected, runId, signal: controller.signal })
          : collect(selected, { runId, signal: controller.signal })
      )
        .then(async (result) => {
          if (result.status === "success") {
            const outcome = {
              runId,
              status: "success",
              completedAt: "",
              error: null as string | null,
            };
            try {
              await evaluateAlerts();
            } catch (err) {
              logger.error(
                { err, runId },
                "Data refresh succeeded but alert evaluation failed",
              );
              outcome.status = "failed";
              outcome.error =
                "Data refresh succeeded; alert evaluation failed. Check backend logs.";
            }
            outcome.completedAt = new Date().toISOString();
            try {
              await atomicJson(
                join(reportDirectory(), `${runId}-alerts.json`),
                outcome,
              );
              await atomicJson(
                join(reportDirectory(), "latest-alerts.json"),
                outcome,
              );
            } catch (err) {
              logger.error(
                { err, runId },
                "Could not record alert outcome; collection report preserved",
              );
            }
          }
          return result;
        })
        .catch(async (err) => {
          logger.error({ err, runId }, "Requested refresh failed");
          await atomicJson(
            join(reportDirectory(), `${runId}${full ? "-refresh" : ""}.json`),
            {
              runId,
              status: "failed",
              completedAt: new Date().toISOString(),
              errors: ["Job failed; check backend logs"],
            },
          );
        })
        .finally(() => {
          pendingJob = null;
          jobControllers.delete(controller);
          jobs.delete(job);
        });
      jobs.add(job);
      return {
        runId,
        reportUrl: `/api/admin/jobs/${runId}`,
        message: full
          ? "Full refresh queued; follow source health for the outcome"
          : "Collection queued; follow run history for the outcome",
      };
    } catch (error) {
      pendingJob = null;
      throw error;
    }
  }
  app.post("/api/admin/refresh", async (req, reply) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    return reply.code(202).send(await queueJob(true));
  });
  app.post("/api/admin/collect", async (req, reply) => {
    const { sourceId } = z
      .object({ sourceId: z.string().max(100).optional() })
      .parse(req.body ?? {});
    return reply.code(202).send(await queueJob(false, sourceId));
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
