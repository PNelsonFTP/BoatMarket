import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db";
import { listingSchema, locationOverrideSchema } from "../lib/types";
import {
  applyListingLocationOverride,
  restoreSourceLocation,
} from "../lib/boat-location";
const paramsSchema = z.object({ id: z.string().min(1).max(200) });
const revisionSchema = z.object({ revision: z.number().int().nonnegative() });
const conflict = () =>
  Object.assign(
    new Error("This location review changed. Refresh before saving."),
    { statusCode: 409 },
  );
export function registerBoatLocationRoutes(app: FastifyInstance) {
  app.get("/api/admin/locations/listings", async () => {
    const rows = await db.listing.findMany({
      where: { isSample: false },
      select: { id: true, title: true, data: true, lat: true, lng: true },
    });
    const overrides = await db.locationOverride.findMany();
    const byId = new Map(overrides.map((row) => [row.listingId, row]));
    return {
      listings: rows
        .map((row) => {
          const listing = listingSchema.parse(row.data),
            override = byId.get(row.id);
          return {
            id: row.id,
            title: row.title,
            city: listing.city,
            state: listing.state,
            sourceUrl: listing.sourceUrl,
            lat: row.lat,
            lng: row.lng,
            offsite: !!listing.specs.boatLocationUnknown,
            precision: listing.specs.locationPrecision || null,
            sourceLocation: listing.sourceLocation || null,
            override: locationOverrideSchema.safeParse(override?.data).success
              ? override?.data
              : null,
            revision: override?.revision || 0,
          };
        })
        .sort(
          (a, b) =>
            Number(b.offsite) - Number(a.offsite) ||
            a.title.localeCompare(b.title),
        ),
    };
  });
  app.get("/api/admin/locations/listings/:id/history", async (req) => {
    const { id } = paramsSchema.parse(req.params);
    return {
      history: await db.locationOverrideEvent.findMany({
        where: { listingId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    };
  });
  app.put("/api/admin/locations/listings/:id", async (req) => {
    const { id } = paramsSchema.parse(req.params);
    const input = locationOverrideSchema
      .omit({ reviewedAt: true })
      .extend({
        evidence: z.string().trim().min(5).max(4000),
        sourceUrl: z
          .string()
          .url()
          .refine((s) => /^https?:\/\//.test(s))
          .optional(),
      })
      .parse(req.body);
    return db.$transaction(async (tx) => {
      const [row, previous] = await Promise.all([
        tx.listing.findUnique({ where: { id } }),
        tx.locationOverride.findUnique({ where: { listingId: id } }),
      ]);
      if (!row)
        throw Object.assign(new Error("Listing not found"), {
          statusCode: 404,
        });
      if ((previous?.revision || 0) !== input.revision) throw conflict();
      const revision = input.revision + 1,
        data = { ...input, revision, reviewedAt: new Date().toISOString() };
      if (previous) {
        if (
          !(
            await tx.locationOverride.updateMany({
              where: { listingId: id, revision: input.revision },
              data: { revision, data },
            })
          ).count
        )
          throw conflict();
      } else
        await tx.locationOverride.create({
          data: { listingId: id, revision, data },
        });
      const listing = applyListingLocationOverride(
        listingSchema.parse(row.data),
        data,
      );
      await tx.listing.update({
        where: { id },
        data: {
          data: JSON.parse(JSON.stringify(listing)),
          lat: listing.lat,
          lng: listing.lng,
        },
      });
      await tx.locationOverrideEvent.create({
        data: {
          listingId: id,
          action: "set",
          data: { previous: previous?.data || null, next: data },
        },
      });
      return {
        revision,
        message:
          "Actual boat location saved privately. Source coordinates are preserved, and refreshes will retain this correction.",
      };
    });
  });
  app.delete("/api/admin/locations/listings/:id", async (req) => {
    const { id } = paramsSchema.parse(req.params),
      { revision } = revisionSchema.parse(req.body);
    return db.$transaction(async (tx) => {
      const [row, previous] = await Promise.all([
        tx.listing.findUnique({ where: { id } }),
        tx.locationOverride.findUnique({ where: { listingId: id } }),
      ]);
      if (!row || !previous || previous.revision !== revision) throw conflict();
      if (!locationOverrideSchema.safeParse(previous.data).success)
        throw conflict();
      if (
        !(
          await tx.locationOverride.updateMany({
            where: { listingId: id, revision },
            data: {
              revision: revision + 1,
              data: { active: false, revertedAt: new Date().toISOString() },
            },
          })
        ).count
      )
        throw conflict();
      const restored = restoreSourceLocation(listingSchema.parse(row.data));
      await tx.listing.update({
        where: { id },
        data: {
          data: JSON.parse(JSON.stringify(restored)),
          lat: restored.lat,
          lng: restored.lng,
        },
      });
      await tx.locationOverrideEvent.create({
        data: {
          listingId: id,
          action: "revert",
          data: {
            previous: previous.data,
            restoredSource: JSON.parse(
              JSON.stringify(restored.sourceLocation || {}),
            ),
          },
        },
      });
      return {
        message:
          "Correction reverted. Source location restored; review history retained.",
      };
    });
  });
}
