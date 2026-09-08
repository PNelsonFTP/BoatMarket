import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { writeFileSync, unlinkSync, rmSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSeed } from "../lib/seed";
import { DEFAULT_FILTERS } from "../lib/types";
const file = join(tmpdir(), `boatscout-test-${process.pid}.db`);
process.env.DATABASE_URL = `file:${file}`;
process.env.REFRESH_REPORT_DIR = file + ".reports";
const { buildApp } = await import("../server/app");
const { db } = await import("../server/db");
const { upsertListing, allListings } = await import("../server/repository");
const { evaluateAlerts } = await import("../server/alerts");
const app = buildApp({ password: "test-password-only", serveStatic: false });
let token = "";
beforeAll(async () => {
  writeFileSync(file, "");
  const r = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: `file:${file}` }, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  rmSync(file + ".reports", { recursive: true, force: true });
  for (const suffix of ["", "-journal", "-wal", "-shm"])
    try {
      unlinkSync(file + suffix);
    } catch {}
});
describe("authenticated API and persistence", () => {
  it("allows health, rejects missing/incorrect auth, and issues a session", async () => {
    expect((await app.inject({ url: "/api/health" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/listings" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          payload: { password: "wrong" },
        })
      ).statusCode,
    ).toBe(401);
    const r = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { password: "test-password-only" },
    });
    expect(r.statusCode).toBe(200);
    token = r.json().token;
  });
  it("imports listings, preserves first-seen, and appends only changed prices", async () => {
    const boat = {
      ...makeSeed()[0],
      id: "real-1",
      source: "Manual",
      sourceListingId: "original-1",
      isSample: false,
    };
    const r = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { authorization: `Bearer ${token}` },
      payload: { listings: [boat] },
    });
    expect(r.statusCode).toBe(200);
    await upsertListing({
      ...boat,
      firstSeenAt: new Date().toISOString(),
      price: 30000,
      lastSeenAt: new Date().toISOString(),
    });
    const repeated = await upsertListing({
      ...boat,
      price: 30000,
      lastSeenAt: new Date().toISOString(),
    });
    expect(repeated.updated).toBe(false);
    const list = await allListings();
    expect(list).toHaveLength(1);
    expect(list[0].priceHistory).toHaveLength(boat.priceHistory.length + 1);
    expect(list[0].firstSeenAt).toBe(boat.firstSeenAt);
  });
  it("validates API filters and matches the browser filter engine", async () => {
    const headers = { authorization: `Bearer ${token}` };
    const invalid = await app.inject({
      method: "POST",
      url: "/api/search",
      headers,
      payload: { criteria: { price: { min: 100, max: 10 } } },
    });
    expect(invalid.statusCode).toBe(400);
    const r = await app.inject({
      method: "POST",
      url: "/api/search",
      headers,
      payload: { ...DEFAULT_FILTERS, criteria: { price: { max: 35000 } } },
    });
    expect(r.json().total).toBe(1);
  });
  it("persists notes, favorites and searches, rejecting stale workspace writes", async () => {
    const headers = { authorization: `Bearer ${token}` };
    const current = (
      await app.inject({ url: "/api/workspace", headers })
    ).json();
    current.workspace.favorites = ["real-1"];
    current.workspace.notes = { "real-1": "Ask about the trailer" };
    current.workspace.savedSearches = [
      {
        id: "watch",
        name: "My watch",
        filters: DEFAULT_FILTERS,
        cadence: "hourly",
        channels: ["in-app"],
        digest: true,
      },
    ];
    const save = await app.inject({
      method: "PUT",
      url: "/api/workspace",
      headers,
      payload: current,
    });
    expect(save.statusCode).toBe(200);
    const stale = await app.inject({
      method: "PUT",
      url: "/api/workspace",
      headers,
      payload: current,
    });
    expect(stale.statusCode).toBe(409);
    const reload = (
      await app.inject({ url: "/api/workspace", headers })
    ).json();
    expect(reload.workspace.notes["real-1"]).toBe("Ask about the trailer");
    expect(reload.workspace.favorites).toEqual(["real-1"]);
  });
  it("baselines saved searches and emits one alert for a subsequent price change", async () => {
    await evaluateAlerts();
    expect(await db.alert.count()).toBe(0);
    const listing = (await allListings())[0];
    await upsertListing({
      ...listing,
      price: 28000,
      lastSeenAt: new Date().toISOString(),
    });
    await db.savedSearch.update({
      where: { id: "watch" },
      data: { lastCheckedAt: new Date(Date.now() - 2 * 3600000) },
    });
    await evaluateAlerts();
    expect(await db.alert.count()).toBe(1);
    await evaluateAlerts();
    expect(await db.alert.count()).toBe(1);
  });
  it("reports persisted import IDs and stops a failed chunk without hiding partial success", async () => {
    const headers = { authorization: `Bearer ${token}` };
    const existing = (await allListings())[0];
    const alias = await app.inject({
      method: "POST",
      url: "/api/import",
      headers,
      payload: { listings: [{ ...existing, id: "input-alias" }] },
    });
    expect(alias.json().acceptedIds).toEqual(["input-alias"]);
    expect(alias.json().idMap["input-alias"]).toBe(existing.id);
    const boat = {
      ...existing,
      id: "new-record",
      sourceListingId: "new-record",
    };
    const collision = {
      ...existing,
      source: "Other source",
      sourceListingId: "collision",
    };
    const later = {
      ...boat,
      id: "not-attempted",
      sourceListingId: "not-attempted",
    };
    const r = await app.inject({
      method: "POST",
      url: "/api/import",
      headers,
      payload: { listings: [boat, collision, later] },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().acceptedIds).toEqual(["new-record"]);
    expect(r.json().failed[0].id).toBe(existing.id);
    expect(r.json().unattemptedIds).toEqual(["not-attempted"]);
    expect(
      await db.listing.findUnique({ where: { id: "not-attempted" } }),
    ).toBeNull();
  });
  it("prevalidates duplicate IDs before importing any records", async () => {
    const boat = {
      ...(await allListings())[0],
      id: "invalid-chunk",
      sourceListingId: "invalid-chunk",
    };
    const r = await app.inject({
      method: "POST",
      url: "/api/import",
      headers: { authorization: `Bearer ${token}` },
      payload: { listings: [boat, boat] },
    });
    expect(r.statusCode).toBe(400);
    expect(
      await db.listing.findUnique({ where: { id: "invalid-chunk" } }),
    ).toBeNull();
  });
  it("reports database readiness, coverage gaps, and an existing collector instead of false acceptance", async () => {
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ url: "/api/health" })).json().database).toBe(
      "ready",
    );
    const health = await app.inject({
      url: "/api/admin/source-health",
      headers,
    });
    expect(health.statusCode).toBe(200);
    expect(health.json().ledger.sources.length).toBeGreaterThan(15);
    await db.jobLock.create({
      data: {
        key: "collector",
        owner: "test-active-owner",
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    for (const url of ["/api/admin/collect", "/api/admin/refresh"]) {
      const r = await app.inject({ method: "POST", url, headers, payload: {} });
      expect(r.statusCode).toBe(409);
    }
    await db.jobLock.delete({ where: { key: "collector" } });
    expect(
      (await app.inject({ url: "/api/admin/duplicates", headers })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: "/api/duplicates", headers })).statusCode,
    ).toBe(200);
  });
  it("keeps a successful full-refresh report when subsequent alert evaluation fails", async () => {
    const refreshModule = await import("../server/refresh");
    const alertsModule = await import("../server/alerts");
    const { atomicJson } = await import("../server/refresh-report");
    const alertSpy = vi
      .spyOn(alertsModule, "evaluateAlerts")
      .mockRejectedValue(new Error("Fixture alert failure"));
    const refreshSpy = vi
      .spyOn(refreshModule, "runRefresh")
      .mockImplementation(async (options) => {
        const at = new Date().toISOString(),
          runId = options?.runId!;
        const result: Awaited<ReturnType<typeof refreshModule.runRefresh>> = {
          version: 1,
          runId,
          status: "success",
          stage: "complete",
          startedAt: at,
          completedAt: at,
          allowPartial: false,
          backupDirectory: "fixture-backup",
          collection: null,
          geocode: "not-requested",
          snapshot: {
            target: "fixture-snapshot",
            listings: 1,
            generatedAt: at,
            observationRange: { oldest: null, newest: null },
            backup: null,
          },
          errors: [],
          reportPath: join(
            process.env.REFRESH_REPORT_DIR!,
            runId + "-refresh.json",
          ),
        };
        await atomicJson(result.reportPath, result);
        await atomicJson(
          join(process.env.REFRESH_REPORT_DIR!, "latest-refresh.json"),
          result,
        );
        return result;
      });
    try {
      const headers = { authorization: `Bearer ${token}` };
      const queued = await app.inject({
        method: "POST",
        url: "/api/admin/refresh",
        headers,
        payload: {},
      });
      expect(queued.statusCode).toBe(202);
      await vi.waitFor(async () => {
        const r = await app.inject({ url: queued.json().reportUrl, headers });
        expect(r.json().alertEvaluation?.status).toBe("failed");
        expect(r.json().status).toBe("success");
        expect(r.json().stage).toBe("complete");
        expect(r.json().snapshot.target).toBe("fixture-snapshot");
      });
      expect(
        JSON.parse(
          readFileSync(
            join(process.env.REFRESH_REPORT_DIR!, "latest-refresh.json"),
            "utf8",
          ),
        ).status,
      ).toBe("success");
    } finally {
      refreshSpy.mockRestore();
      alertSpy.mockRestore();
    }
  });
  it("blocks unapproved browser origins and invalidates logout sessions", async () => {
    const headers = {
      authorization: `Bearer ${token}`,
      origin: "https://untrusted.example",
    };
    expect(
      (await app.inject({ url: "/api/listings", headers })).statusCode,
    ).toBe(403);
    await app.inject({
      method: "POST",
      url: "/api/logout",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(
      (
        await app.inject({
          url: "/api/listings",
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(401);
  });
});
