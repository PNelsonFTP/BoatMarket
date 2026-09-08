import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSeed } from "../lib/seed";
import { DEFAULT_FILTERS } from "../lib/types";
const file = join(tmpdir(), `boatscout-test-${process.pid}.db`);
process.env.DATABASE_URL = `file:${file}`;
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
