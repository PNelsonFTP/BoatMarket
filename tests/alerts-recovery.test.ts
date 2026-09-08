import { realpath } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { makeSeed } from "../lib/seed";
import { DEFAULT_FILTERS } from "../lib/types";
import {
  matchSnapshot,
  readMatchSnapshot,
  searchEvents,
} from "../lib/alert-events";
import { searchListings } from "../lib/search";
const directory = await mkdtemp(join(tmpdir(), "boatscout-alerts-"));
const databaseUrl = `file:${join(directory, "test.db")}`;
process.env.DATABASE_URL = databaseUrl;
const { db } = await import("../server/db");
const { upsertListing } = await import("../server/repository");
const { evaluateAlerts, retryAlert, alertDiagnostics, deliveryRetryDelay } =
  await import("../server/alerts");
const boat = {
  ...makeSeed()[0],
  id: "watched",
  source: "Fixture",
  sourceListingId: "watched",
  isSample: false,
  price: 25000,
  status: "active" as const,
};
beforeAll(async () => {
  await writeFile(join(directory, "test.db"), "");
  const r = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8" },
  );
  if (r.status) throw new Error(r.stdout + r.stderr);
  const attached = await db.$queryRawUnsafe<{ file: string; name: string }[]>(
    "PRAGMA database_list",
  );
  expect(
    await realpath(attached.find((entry) => entry.name === "main")!.file),
  ).toBe(await realpath(join(directory, "test.db")));
});
beforeEach(async () => {
  await db.alert.deleteMany();
  await db.savedSearch.deleteMany();
  await db.listing.deleteMany();
  await db.jobLock.deleteMany();
  await db.user.upsert({
    where: { id: "local" },
    create: { id: "local" },
    update: {},
  });
});
afterAll(async () => {
  await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
it("notifies sold status even when a boat leaves an active-only search", async () => {
  await upsertListing(boat);
  await db.savedSearch.create({
    data: {
      id: "watch",
      name: "Active boats",
      filters: DEFAULT_FILTERS,
      cadence: "hourly",
      channels: ["in-app"],
      eventTypes: ["status-change"],
    },
  });
  expect((await evaluateAlerts({ force: true })).alertsCreated).toBe(0);
  await upsertListing({ ...boat, status: "sold" });
  expect((await evaluateAlerts({ force: true })).alertsCreated).toBe(1);
  const alert = await db.alert.findFirstOrThrow();
  expect(alert.eventDetails).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "status-change",
        previousStatus: "active",
        status: "sold",
      }),
    ]),
  );
  expect(alert.body).toContain("sold");
  expect((await evaluateAlerts({ force: true })).alertsCreated).toBe(0);
});
it("emits optional no-longer-matches when price exceeds the saved filter", async () => {
  await upsertListing(boat);
  await db.savedSearch.create({
    data: {
      id: "watch",
      name: "Budget",
      filters: {
        ...DEFAULT_FILTERS,
        criteria: { price: { max: 30000 }, status: { values: ["active"] } },
      },
      cadence: "daily",
      channels: ["in-app"],
      eventTypes: ["no-longer-matches"],
    },
  });
  await evaluateAlerts({ force: true });
  await upsertListing({ ...boat, price: 40000 });
  await evaluateAlerts({ force: true });
  expect((await db.alert.findFirstOrThrow()).eventDetails).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "no-longer-matches", price: 40000 }),
    ]),
  );
});
it("retries only failed channels after backoff, with per-channel durable evidence", async () => {
  const alert = await db.alert.create({
    data: {
      title: "Fixture",
      body: "Test only",
      listingIds: [],
      deliveries: ["email", "webhook"],
    },
  });
  const delivery = vi.fn(async (channel: string) => {
    if (channel === "webhook") throw new Error("Temporary endpoint failure");
  });
  expect((await evaluateAlerts({ deliver: delivery })).status).toBe("partial");
  const first = await db.alert.findUniqueOrThrow({ where: { id: alert.id } });
  expect(first.deliveries).toEqual(["webhook"]);
  expect(first.attempts).toBe(1);
  expect(+first.nextAttemptAt!).toBeGreaterThan(Date.now());
  expect((await evaluateAlerts({ deliver: delivery })).delivered).toBe(0);
  expect(delivery).toHaveBeenCalledTimes(2);
  await db.alert.update({
    where: { id: alert.id },
    data: { nextAttemptAt: new Date(0) },
  });
  const retry = vi.fn(async (_channel: string) => {});
  expect((await evaluateAlerts({ deliver: retry })).delivered).toBe(1);
  expect(retry).toHaveBeenCalledTimes(1);
  expect(retry.mock.calls[0][0]).toBe("webhook");
  const done = await db.alert.findUniqueOrThrow({ where: { id: alert.id } });
  expect(done.deliveredAt).not.toBeNull();
  expect(done.deliveries).toEqual([]);
  expect(done.deliveryHistory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ channel: "email", outcome: "success" }),
      expect.objectContaining({ channel: "webhook", outcome: "failed" }),
      expect.objectContaining({ channel: "webhook", outcome: "success" }),
    ]),
  );
});
it("allows explicit replay of exhausted remaining channels and forbids delivered replay", async () => {
  const alert = await db.alert.create({
    data: {
      title: "Fixture",
      body: "Test only",
      listingIds: [],
      deliveries: ["webhook"],
      attempts: 5,
      deliveryError: "Old failure",
    },
  });
  expect((await alertDiagnostics()).alerts[0].state).toBe("exhausted");
  await retryAlert(alert.id);
  expect(
    (await db.alert.findUniqueOrThrow({ where: { id: alert.id } })).attempts,
  ).toBe(0);
  await evaluateAlerts({ deliver: vi.fn(async () => {}) });
  await expect(retryAlert(alert.id)).rejects.toThrow("delivered");
});
it("records uncertain started delivery without writing after lease loss", async () => {
  const alert = await db.alert.create({
    data: {
      title: "Fixture",
      body: "Test only",
      listingIds: [],
      deliveries: ["email", "webhook"],
    },
  });
  const delivery = vi.fn(async () => {
    await db.jobLock.update({
      where: { key: "alerts" },
      data: { owner: "successor", expiresAt: new Date(Date.now() + 600000) },
    });
  });
  await expect(evaluateAlerts({ deliver: delivery })).rejects.toThrow(
    "lease lost",
  );
  expect(delivery).toHaveBeenCalledOnce();
  const row = await db.alert.findUniqueOrThrow({ where: { id: alert.id } });
  expect(row.deliveries).toEqual(["email", "webhook"]);
  expect((row.deliveryHistory as { outcome: string }[]).at(-1)?.outcome).toBe(
    "started",
  );
  expect(
    (await db.jobLock.findUniqueOrThrow({ where: { key: "alerts" } })).owner,
  ).toBe("successor");
});
it("cancels an in-flight delivery and preserves uncertain remaining work", async () => {
  await db.alert.create({
    data: {
      title: "Fixture",
      body: "Test only",
      listingIds: [],
      deliveries: ["webhook"],
    },
  });
  const controller = new AbortController();
  const result = await evaluateAlerts({
    signal: controller.signal,
    deliver: vi.fn(async () => {
      controller.abort();
    }),
  });
  expect(result.status).toBe("cancelled");
  expect((await db.alert.findFirstOrThrow()).deliveredAt).toBeNull();
});
it("uses bounded exponential backoff and preserves legacy event baselines", () => {
  expect([1, 2, 3, 100].map((n) => deliveryRetryDelay(n, 60))).toEqual([
    60000, 120000, 240000, 86400000,
  ]);
  const previous = readMatchSnapshot(
    { watched: JSON.stringify([30000, "active"]) },
    [boat],
  );
  const next = matchSnapshot(searchListings([boat], DEFAULT_FILTERS));
  const events = searchEvents(
    previous,
    next,
    [boat],
    ["price-drop", "price-change"],
  );
  expect(events.map((event) => event.kind)).toEqual(["price-drop"]);
});

it("returns promptly on cancellation even if a delivery transport never settles", async () => {
  await db.alert.create({
    data: {
      title: "Fixture",
      body: "Test",
      listingIds: [],
      deliveries: ["webhook"],
    },
  });
  const controller = new AbortController();
  const outcome = await evaluateAlerts({
    signal: controller.signal,
    deliver: async () => {
      setTimeout(() => controller.abort(), 10);
      return new Promise<void>(() => {});
    },
  });
  expect(outcome.status).toBe("cancelled");
  const alert = await db.alert.findFirstOrThrow();
  expect(alert.deliveries).toEqual(["webhook"]);
  expect((alert.deliveryHistory as { outcome: string }[]).at(-1)?.outcome).toBe(
    "started",
  );
  expect(await db.jobLock.count()).toBe(0);
});

it("API shutdown cancels active alert requests before waiting for HTTP drain", async () => {
  const fastify = (await import("fastify")).default;
  const network = await import("../server/network");
  const { registerAlertRoutes } = await import("../server/alerts");
  const transport = vi
    .spyOn(network, "requestPublic")
    .mockImplementation(async () => new Promise(() => {}));
  const priorUrl = process.env.ALERT_WEBHOOK_URL;
  process.env.ALERT_WEBHOOK_URL = "https://fixture.example/webhook";
  const app = fastify();
  registerAlertRoutes(app);
  await app.ready();
  await db.alert.create({
    data: {
      title: "Fixture",
      body: "Test",
      listingIds: [],
      deliveries: ["webhook"],
    },
  });
  try {
    const request = app
      .inject({ method: "POST", url: "/api/admin/alerts/run", payload: {} })
      .then((response) => response);
    for (let i = 0; i < 100 && !transport.mock.calls.length; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(transport).toHaveBeenCalledOnce();
    const closing = app.close();
    expect((await request).json().status).toBe("cancelled");
    await closing;
    expect((await db.alert.findFirstOrThrow()).deliveredAt).toBeNull();
  } finally {
    transport.mockRestore();
    if (priorUrl === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = priorUrl;
    await app.close();
  }
});
