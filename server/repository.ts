import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  listingSchema,
  type Listing,
  type Workspace,
  EMPTY_WORKSPACE,
} from "../lib/types";
import { normalizedHin } from "./dedup";
import { reconcileListingDuplicates } from "./duplicates";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function allListings(includeSamples = false) {
  const rows = await db.listing.findMany({
    where: includeSamples ? {} : { isSample: false },
    include: { prices: { orderBy: { at: "asc" } }, engines: true },
    orderBy: { firstSeenAt: "desc" },
  });
  return rows.map((r) =>
    listingSchema.parse({
      ...(r.data as object),
      id: r.id,
      price: r.price,
      status: r.status,
      groupId: r.groupId,
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      removedAt: r.removedAt?.toISOString() ?? null,
      priceHistory: r.prices.map((p) => ({
        price: p.price,
        at: p.at.toISOString(),
      })),
      engines: r.engines.map((e) => ({
        make: e.make,
        model: e.model,
        year: e.year,
        hp: e.hp,
        hours: e.hours,
      })),
      confidence: r.confidence,
      isSample: r.isSample,
    }),
  );
}
export async function upsertListing(
  input: Listing,
  options: { dedupe?: boolean; collectorLease?: { owner: string } } = {},
) {
  const l = listingSchema.parse(input);
  return db.$transaction(async (tx) => {
    if (options.collectorLease) {
      const lease = await tx.jobLock.findFirst({
        where: { key: "collector", owner: options.collectorLease.owner, expiresAt: { gt: new Date() } },
      });
      if (!lease) throw Object.assign(new Error("Collector lease lost; refusing stale write"), { code: "COLLECTOR_LEASE_LOST" });
    }
    const old = await tx.listing.findUnique({
      where: {
        source_sourceListingId: {
          source: l.source,
          sourceListingId: l.sourceListingId,
        },
      },
    });
    const id = old?.id ?? l.id;
    if (!old && (await tx.listing.findUnique({ where: { id } }))) {
      throw Object.assign(
        new Error(
          "Listing ID already belongs to a different source record; use a unique ID",
        ),
        { statusCode: 409 },
      );
    }
    const groupId = old?.groupId ?? null;
    const seller = l.sellerName
      ? await tx.seller.upsert({
          where: {
            key: createHash("sha256")
              .update(
                `${l.source}|${l.sellerName}|${l.specs.sellerState ?? l.state}`,
              )
              .digest("hex"),
          },
          create: {
            key: createHash("sha256")
              .update(
                `${l.source}|${l.sellerName}|${l.specs.sellerState ?? l.state}`,
              )
              .digest("hex"),
            name: l.sellerName,
            type: l.sellerType,
          },
          update: { name: l.sellerName, type: l.sellerType },
        })
      : null;
    const { rawPayload, ...clean } = l;
    // Observing the same source again must not make a boat appear newly listed.
    clean.id = id;
    clean.firstSeenAt = old?.firstSeenAt.toISOString() ?? l.firstSeenAt;
    clean.groupId = groupId;
    const data = {
      source: l.source,
      sourceListingId: l.sourceListingId,
      sourceUrl: l.sourceUrl,
      title: l.title,
      make: l.make,
      model: l.model,
      year: l.year,
      price: l.price,
      length: l.length,
      horsepower: l.horsepower,
      lat: l.lat,
      lng: l.lng,
      state: l.state,
      status: l.status,
      lastSeenAt: new Date(l.lastSeenAt),
      removedAt: l.removedAt ? new Date(l.removedAt) : null,
      data: json(clean),
      rawPayload: rawPayload == null ? Prisma.DbNull : json(rawPayload),
      confidence: json(l.confidence),
      isSample: l.isSample,
      groupId,
      identityHin: normalizedHin(l.specs.hin),
      sellerId: seller?.id ?? null,
    };
    await tx.listing.upsert({
      where: { id },
      create: { ...data, id, firstSeenAt: new Date(l.firstSeenAt) },
      update: data,
    });
    await tx.engine.deleteMany({ where: { listingId: id } });
    if (l.engines.length)
      await tx.engine.createMany({
        data: l.engines.map((e) => ({ ...e, listingId: id })),
      });
    if (!old && l.priceHistory.length)
      await tx.priceHistory.createMany({
        data: l.priceHistory.map((p) => ({
          listingId: id,
          price: p.price,
          at: new Date(p.at),
        })),
      });
    else if (l.price != null && (!old || old.price !== l.price))
      await tx.priceHistory.create({ data: { listingId: id, price: l.price } });
    const changed =
      !!old &&
      (old.price !== l.price ||
        old.status !== l.status ||
        old.title !== l.title ||
        JSON.stringify({
          ...(old.data as object),
          firstSeenAt: undefined,
          groupId: undefined,
          lastSeenAt: undefined,
          priceHistory: undefined,
        }) !==
          JSON.stringify({
            ...clean,
            firstSeenAt: undefined,
            groupId: undefined,
            lastSeenAt: undefined,
            priceHistory: undefined,
          }));
    if (!l.isSample && (options.dedupe || old?.groupId))
      await reconcileListingDuplicates(tx, id);
    return { id, isNew: !old, updated: changed };
  });
}
export async function getWorkspace() {
  const user = await db.user.upsert({
    where: { id: "local" },
    create: {
      id: "local",
      referencePoints: json(EMPTY_WORKSPACE.referencePoints),
      rules: {
        create: {
          id: "generic",
          name: "My lake rules",
          config: json(EMPTY_WORKSPACE.rules[0]),
        },
      },
    },
    update: {},
    include: {
      favorites: true,
      notes: true,
      searches: true,
      rules: true,
      alerts: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });
  return {
    revision: user.workspaceVersion,
    workspace: {
      favorites: user.favorites.map((f) => f.listingId),
      notes: Object.fromEntries(user.notes.map((n) => [n.listingId, n.text])),
      savedSearches: user.searches.map((s) => ({
        id: s.id,
        name: s.name,
        filters: s.filters,
        cadence: s.cadence,
        channels: s.channels,
        digest: s.digest,
      })),
      rules: user.rules.map((r) => r.config),
      referencePoints: user.referencePoints,
      alerts: user.alerts.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        listingIds: a.listingIds,
        read: a.read,
        createdAt: a.createdAt.toISOString(),
      })),
    } as Workspace,
  };
}
export async function putWorkspace(w: Workspace, revision: number) {
  return db.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: { id: "local", workspaceVersion: revision },
      data: {
        workspaceVersion: { increment: 1 },
        referencePoints: json(w.referencePoints),
      },
    });
    if (!changed.count) throw new Error("WORKSPACE_CONFLICT");
    await tx.favorite.deleteMany({
      where: { userId: "local", listingId: { notIn: w.favorites } },
    });
    for (const id of w.favorites)
      await tx.favorite.upsert({
        where: { userId_listingId: { userId: "local", listingId: id } },
        create: { userId: "local", listingId: id },
        update: {},
      });
    await tx.note.deleteMany({
      where: { userId: "local", listingId: { notIn: Object.keys(w.notes) } },
    });
    for (const [listingId, text] of Object.entries(w.notes))
      await tx.note.upsert({
        where: { userId_listingId: { userId: "local", listingId } },
        create: { userId: "local", listingId, text },
        update: { text },
      });
    await tx.savedSearch.deleteMany({
      where: {
        userId: "local",
        id: { notIn: w.savedSearches.map((s) => s.id) },
      },
    });
    for (const s of w.savedSearches) {
      const old = await tx.savedSearch.findUnique({ where: { id: s.id } });
      const reset =
        old && JSON.stringify(old.filters) !== JSON.stringify(json(s.filters));
      await tx.savedSearch.upsert({
        where: { id: s.id },
        create: {
          ...s,
          userId: "local",
          filters: json(s.filters),
          channels: json(s.channels),
        },
        update: {
          ...s,
          filters: json(s.filters),
          channels: json(s.channels),
          ...(reset ? { lastCheckedAt: null, matchState: {} } : {}),
        },
      });
    }
    await tx.ruleSet.deleteMany({
      where: { userId: "local", id: { notIn: w.rules.map((r) => r.id) } },
    });
    for (const r of w.rules)
      await tx.ruleSet.upsert({
        where: { id: r.id },
        create: { id: r.id, userId: "local", name: r.name, config: json(r) },
        update: { name: r.name, config: json(r) },
      });
    for (const a of w.alerts)
      if (a.read)
        await tx.alert.updateMany({
          where: { id: a.id, userId: "local" },
          data: { read: true },
        });
    return { revision: revision + 1 };
  });
}
export async function acquireLock(key: string, ttl = 30 * 60 * 1000) {
  const owner = randomUUID();
  try {
    await db.jobLock.create({
      data: { key, owner, expiresAt: new Date(Date.now() + ttl) },
    });
    return owner;
  } catch {
    const updated = await db.jobLock.updateMany({
      where: { key, expiresAt: { lt: new Date() } },
      data: { owner, expiresAt: new Date(Date.now() + ttl) },
    });
    return updated.count ? owner : null;
  }
}
export async function releaseLock(key: string, owner: string) {
  await db.jobLock.deleteMany({ where: { key, owner } });
}
