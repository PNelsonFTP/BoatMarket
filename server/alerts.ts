import nodemailer from "nodemailer";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { allListings, acquireLock, releaseLock } from "./repository";
import { filtersSchema } from "../lib/types";
import { searchListings } from "../lib/search";
import { requestPublic } from "./network";
import { logger } from "./logger";
export function changedMatches(
  previous: Record<string, string>,
  next: Record<string, string>,
) {
  return Object.keys(next).filter((id) => previous[id] !== next[id]);
}
export async function evaluateAlerts() {
  const owner = await acquireLock("alerts", 600000);
  if (!owner) return;
  try {
    const listings = await allListings(false);
    for (const search of await db.savedSearch.findMany({
      where: { cadence: { not: "off" } },
    })) {
      const interval =
        search.cadence === "hourly"
          ? 3600000
          : search.cadence === "weekly"
            ? 604800000
            : 86400000;
      if (search.lastCheckedAt && Date.now() - +search.lastCheckedAt < interval)
        continue;
      const matches = searchListings(
        listings,
        filtersSchema.parse(search.filters),
      );
      const state = Object.fromEntries(
        matches.map((l) => [l.id, JSON.stringify([l.price, l.status])]),
      );
      const previous = search.matchState as Record<string, string>;
      const changed = search.lastCheckedAt
        ? changedMatches(previous, state)
        : [];
      await db.$transaction(async (tx) => {
        const groups = search.digest ? [changed] : changed.map((id) => [id]);
        for (const ids of groups) {
          if (!ids.length) continue;
          const title = `${search.name}: ${ids.length} new or changed boat${ids.length === 1 ? "" : "s"}`;
          await tx.alert.create({
            data: {
              userId: search.userId,
              title,
              body: matches
                .filter((l) => ids.includes(l.id))
                .map(
                  (l) =>
                    `${l.title} — ${l.price == null ? "Price on request" : `$${l.price.toLocaleString()}`}\n${l.sourceUrl}`,
                )
                .join("\n\n"),
              listingIds: ids,
              deliveries: search.channels as Prisma.InputJsonValue,
            },
          });
        }
        await tx.savedSearch.update({
          where: { id: search.id },
          data: { lastCheckedAt: new Date(), matchState: state },
        });
      });
    }
    const pending = await db.alert.findMany({
      where: { deliveredAt: null, attempts: { lt: 5 } },
      take: 50,
      orderBy: { createdAt: "asc" },
    });
    for (const alert of pending) {
      const channels = alert.deliveries as string[];
      const remaining = channels.filter((c) => c !== "in-app");
      const errors: string[] = [];
      for (const channel of remaining) {
        try {
          if (channel === "email") {
            if (
              !process.env.SMTP_HOST ||
              !process.env.ALERT_EMAIL ||
              !process.env.SMTP_FROM
            )
              throw new Error(
                "Email requires SMTP_HOST, SMTP_FROM and ALERT_EMAIL",
              );
            const transport = nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT || 587),
              secure: process.env.SMTP_PORT === "465",
              auth: process.env.SMTP_USER
                ? {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD,
                  }
                : undefined,
              connectionTimeout: 15000,
            });
            await transport.sendMail({
              from: process.env.SMTP_FROM,
              to: process.env.ALERT_EMAIL,
              subject: alert.title,
              text: alert.body,
              messageId: `<${alert.id}@boatscout.local>`,
            });
          } else if (channel === "webhook") {
            if (!process.env.ALERT_WEBHOOK_URL)
              throw new Error(
                "Set ALERT_WEBHOOK_URL to deliver webhook alerts",
              );
            const result = await requestPublic(process.env.ALERT_WEBHOOK_URL, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: alert.id,
                title: alert.title,
                message: alert.body,
                listingIds: alert.listingIds,
              }),
            });
            if (result.status < 200 || result.status >= 300)
              throw new Error(`Webhook HTTP ${result.status}`);
          }
          channels.splice(channels.indexOf(channel), 1);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      await db.alert.update({
        where: { id: alert.id },
        data: {
          deliveries: channels,
          attempts: { increment: 1 },
          deliveryError: errors.length ? errors.join("; ") : null,
          deliveredAt: errors.length ? null : new Date(),
        },
      });
      if (errors.length)
        logger.warn({ alertId: alert.id, errors }, "Alert delivery failed");
    }
  } finally {
    await releaseLock("alerts", owner);
  }
}
