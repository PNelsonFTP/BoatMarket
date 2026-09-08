import nodemailer from "nodemailer";
import { Prisma, type Alert } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db";
import { allListings, acquireLock, releaseLock } from "./repository";
import { filtersSchema } from "../lib/types";
import { searchListings } from "../lib/search";
import { requestPublic } from "./network";
import { logger } from "./logger";
import { startCollectorLease } from "./lease";
import {
  ALERT_EVENT_TYPES,
  DEFAULT_ALERT_EVENTS,
  ALERT_EVENT_LABELS,
  matchSnapshot,
  readMatchSnapshot,
  searchEvents,
  type SearchEvent,
} from "../lib/alert-events";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const eventSchema = z
  .array(z.enum(ALERT_EVENT_TYPES))
  .max(ALERT_EVENT_TYPES.length);
export function changedMatches(
  previous: Record<string, string>,
  next: Record<string, string>,
) {
  return Object.keys(next).filter((id) => previous[id] !== next[id]);
}
export function deliveryRetryDelay(
  attempt: number,
  baseSeconds = Number(process.env.ALERT_RETRY_BASE_SECONDS ?? 60),
) {
  if (!Number.isFinite(baseSeconds) || baseSeconds < 1 || baseSeconds > 86400)
    throw new Error("ALERT_RETRY_BASE_SECONDS must be between 1 and 86400");
  return Math.min(86400000, baseSeconds * 1000 * 2 ** Math.max(0, attempt - 1));
}
function maximumAttempts() {
  const value = Number(process.env.ALERT_MAX_ATTEMPTS ?? 5);
  if (!Number.isInteger(value) || value < 1 || value > 100)
    throw new Error("ALERT_MAX_ATTEMPTS must be between 1 and 100");
  return value;
}
type HistoryEntry = {
  at: string;
  channel: string;
  outcome: "started" | "success" | "failed" | "replayed";
  attempt: number;
  error?: string;
};
const history = (value: unknown) =>
  Array.isArray(value) ? (value as HistoryEntry[]) : [];
const append = (value: unknown, item: HistoryEntry) =>
  json([...history(value), item].slice(-200));
const safeError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/https?:\/\/[^\s)]+/g, "[configured endpoint]")
    .slice(0, 2000);
async function fenced<T>(
  owner: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(async (tx) => {
    if (
      !(await tx.jobLock.findFirst({
        where: { key: "alerts", owner, expiresAt: { gt: new Date() } },
      }))
    )
      throw Object.assign(
        new Error("Alert lease lost; refusing obsolete delivery state write"),
        { code: "COLLECTOR_LEASE_LOST" },
      );
    return action(tx);
  });
}
async function sendDelivery(
  channel: string,
  alert: Alert,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (channel === "email") {
    if (
      !process.env.SMTP_HOST ||
      !process.env.ALERT_EMAIL ||
      !process.env.SMTP_FROM
    )
      throw new Error("Email requires SMTP_HOST, SMTP_FROM and ALERT_EMAIL");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    const stop = () => transport.close();
    signal.addEventListener("abort", stop, { once: true });
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.ALERT_EMAIL,
        subject: alert.title,
        text: alert.body,
        messageId: `<${alert.id}@boatscout.local>`,
      });
    } finally {
      signal.removeEventListener("abort", stop);
      transport.close();
    }
    signal.throwIfAborted();
  } else if (channel === "webhook") {
    if (!process.env.ALERT_WEBHOOK_URL)
      throw new Error("Set ALERT_WEBHOOK_URL to deliver webhook alerts");
    const response = await requestPublic(process.env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": alert.id,
      },
      signal,
      body: JSON.stringify({
        id: alert.id,
        title: alert.title,
        message: alert.body,
        listingIds: alert.listingIds,
        events: alert.eventDetails,
      }),
    });
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Webhook HTTP ${response.status}`);
  } else throw new Error(`Unsupported delivery channel: ${channel}`);
}
async function abortableDelivery(
  work: () => Promise<void>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () =>
      reject(signal.reason ?? new Error("Alert delivery cancelled"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    await Promise.race([work(), cancelled]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}
export type AlertEvaluationResult = {
  status: "success" | "partial" | "busy" | "cancelled";
  searchesChecked: number;
  alertsCreated: number;
  delivered: number;
  failed: number;
  errors: string[];
};
function eventBody(event: SearchEvent) {
  return `${ALERT_EVENT_LABELS[event.kind]}: ${event.title}\n${event.price == null ? "Price unavailable" : `$${event.price.toLocaleString()}`} · ${event.status ?? "no longer in collected inventory"}${event.previousStatus && event.previousStatus !== event.status ? ` (previously ${event.previousStatus})` : ""}\n${event.url}`;
}
export async function evaluateAlerts(
  options: {
    signal?: AbortSignal;
    force?: boolean;
    evaluateSearches?: boolean;
    deliver?: typeof sendDelivery;
    maxDeliveries?: number;
  } = {},
): Promise<AlertEvaluationResult> {
  const result: AlertEvaluationResult = {
    status: "success",
    searchesChecked: 0,
    alertsCreated: 0,
    delivered: 0,
    failed: 0,
    errors: [],
  };
  const owner = await acquireLock("alerts", 600000);
  if (!owner) return { ...result, status: "busy" };
  const lease = startCollectorLease(owner, {
    key: "alerts",
    ttlMs: 600000,
    signal: options.signal,
  });
  try {
    await lease.checkpoint();
    const listings =
      options.evaluateSearches === false ? [] : await allListings(false);
    for (const search of options.evaluateSearches === false
      ? []
      : await db.savedSearch.findMany({ where: { cadence: { not: "off" } } })) {
      await lease.checkpoint();
      const interval =
        search.cadence === "hourly"
          ? 3600000
          : search.cadence === "weekly"
            ? 604800000
            : 86400000;
      if (
        !options.force &&
        search.lastCheckedAt &&
        Date.now() - +search.lastCheckedAt < interval
      )
        continue;
      const next = matchSnapshot(
        searchListings(listings, filtersSchema.parse(search.filters)),
      );
      const events = search.lastCheckedAt
        ? searchEvents(
            readMatchSnapshot(search.matchState, listings),
            next,
            listings,
            eventSchema.parse(search.eventTypes ?? DEFAULT_ALERT_EVENTS),
          )
        : [];
      const created = await fenced(owner, async (tx) => {
        const current = await tx.savedSearch.findUnique({
          where: { id: search.id },
        });
        if (
          !current ||
          JSON.stringify([
            current.filters,
            current.eventTypes,
            current.cadence,
            current.lastCheckedAt,
          ]) !==
            JSON.stringify([
              search.filters,
              search.eventTypes,
              search.cadence,
              search.lastCheckedAt,
            ])
        )
          return 0;
        const groups = current.digest
          ? [events]
          : events.map((event) => [event]);
        let count = 0;
        for (const group of groups) {
          if (!group.length) continue;
          const listingIds = [
            ...new Set(group.flatMap((event) => event.listingIds)),
          ];
          await tx.alert.create({
            data: {
              userId: current.userId,
              title: `${current.name}: ${group.length} boat update${group.length === 1 ? "" : "s"}`,
              body: group.map(eventBody).join("\n\n"),
              listingIds,
              eventDetails: json(group),
              deliveries: current.channels as Prisma.InputJsonValue,
              nextAttemptAt: new Date(),
            },
          });
          count++;
        }
        await tx.savedSearch.update({
          where: { id: search.id },
          data: { lastCheckedAt: new Date(), matchState: json(next) },
        });
        return count;
      });
      result.searchesChecked++;
      result.alertsCreated += created;
    }
    const pending = await db.alert.findMany({
      where: {
        deliveredAt: null,
        attempts: { lt: maximumAttempts() },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      take: Math.min(100, Math.max(1, options.maxDeliveries ?? 50)),
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    });
    for (const pendingAlert of pending) {
      await lease.checkpoint();
      let alert = await fenced(owner, async (tx) => {
        const current = await tx.alert.findUnique({
          where: { id: pendingAlert.id },
        });
        if (
          !current ||
          current.deliveredAt ||
          current.attempts >= maximumAttempts() ||
          (current.nextAttemptAt && +current.nextAttemptAt > Date.now())
        )
          return null;
        const attempt = current.attempts + 1;
        return tx.alert.update({
          where: { id: current.id },
          data: {
            attempts: attempt,
            lastAttemptAt: new Date(),
            nextAttemptAt: new Date(Date.now() + deliveryRetryDelay(attempt)),
          },
        });
      });
      if (!alert) continue;
      const channels = [
        ...new Set(
          (alert.deliveries as string[]).filter(
            (channel) => channel !== "in-app",
          ),
        ),
      ];
      const errors: string[] = [];
      for (const channel of channels) {
        await lease.checkpoint();
        alert = await fenced(owner, async (tx) => {
          const current = await tx.alert.findUniqueOrThrow({
            where: { id: alert!.id },
          });
          return tx.alert.update({
            where: { id: current.id },
            data: {
              deliveryHistory: append(current.deliveryHistory, {
                at: new Date().toISOString(),
                channel,
                outcome: "started",
                attempt: current.attempts,
              }),
            },
          });
        });
        try {
          await abortableDelivery(
            () =>
              (options.deliver ?? sendDelivery)(channel, alert!, lease.signal),
            lease.signal,
          );
          await lease.checkpoint();
          alert = await fenced(owner, async (tx) => {
            const current = await tx.alert.findUniqueOrThrow({
              where: { id: alert!.id },
            });
            return tx.alert.update({
              where: { id: current.id },
              data: {
                deliveries: (current.deliveries as string[]).filter(
                  (value) => value !== channel,
                ),
                deliveryHistory: append(current.deliveryHistory, {
                  at: new Date().toISOString(),
                  channel,
                  outcome: "success",
                  attempt: current.attempts,
                }),
              },
            });
          });
        } catch (error) {
          if (
            lease.signal.aborted ||
            (error as { code?: string }).code === "COLLECTOR_LEASE_LOST"
          )
            throw error;
          const message = safeError(error);
          errors.push(`${channel}: ${message}`);
          alert = await fenced(owner, async (tx) => {
            const current = await tx.alert.findUniqueOrThrow({
              where: { id: alert!.id },
            });
            return tx.alert.update({
              where: { id: current.id },
              data: {
                deliveryHistory: append(current.deliveryHistory, {
                  at: new Date().toISOString(),
                  channel,
                  outcome: "failed",
                  attempt: current.attempts,
                  error: message,
                }),
              },
            });
          });
        }
      }
      await lease.checkpoint();
      await fenced(owner, async (tx) => {
        const current = await tx.alert.findUniqueOrThrow({
          where: { id: alert!.id },
        });
        const remaining = (current.deliveries as string[]).filter(
          (channel) => channel !== "in-app",
        );
        await tx.alert.update({
          where: { id: current.id },
          data: {
            deliveries: remaining,
            deliveredAt: remaining.length ? null : new Date(),
            nextAttemptAt:
              !remaining.length || current.attempts >= maximumAttempts()
                ? null
                : current.nextAttemptAt,
            deliveryError: errors.length ? errors.join("; ") : null,
          },
        });
      });
      if (errors.length) {
        result.failed++;
        result.errors.push(...errors.map((error) => `${alert.id}: ${error}`));
        logger.warn(
          { alertId: alert.id, errors },
          "Alert delivery failed; retained remaining channels for backoff/replay",
        );
      } else result.delivered++;
    }
    if (result.failed) result.status = "partial";
    return result;
  } catch (error) {
    if (options.signal?.aborted)
      return {
        ...result,
        status: "cancelled",
        errors: [
          ...result.errors,
          "Alert evaluation cancelled; in-flight sends may need delivery reconciliation",
        ],
      };
    throw error;
  } finally {
    await lease.stop();
    await releaseLock("alerts", owner);
  }
}
export async function retryAlert(id: string) {
  const owner = await acquireLock("alerts", 600000);
  if (!owner)
    throw Object.assign(
      new Error("Alert evaluation is running; retry afterward"),
      { statusCode: 409 },
    );
  try {
    return await fenced(owner, async (tx) => {
      const alert = await tx.alert.findUnique({ where: { id } });
      if (!alert)
        throw Object.assign(new Error("Alert not found"), { statusCode: 404 });
      if (alert.deliveredAt)
        throw Object.assign(
          new Error(
            "This alert is delivered; replay does not resend completed channels",
          ),
          { statusCode: 409 },
        );
      if (!alert.attempts)
        throw Object.assign(
          new Error("This alert has not failed yet; run the pending queue"),
          { statusCode: 409 },
        );
      return tx.alert.update({
        where: { id },
        data: {
          attempts: 0,
          nextAttemptAt: new Date(),
          deliveryError: null,
          deliveryHistory: append(alert.deliveryHistory, {
            at: new Date().toISOString(),
            channel: "operator",
            outcome: "replayed",
            attempt: alert.attempts,
          }),
        },
      });
    });
  } finally {
    await releaseLock("alerts", owner);
  }
}
export async function alertDiagnostics() {
  const now = new Date();
  const alerts = await db.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return {
    generatedAt: now.toISOString(),
    maximumAttempts: maximumAttempts(),
    retryBaseSeconds: deliveryRetryDelay(1) / 1000,
    semantics:
      "At least once. A process can send externally before recording success; a started entry without a result is uncertain. Stable message/idempotency IDs help receivers deduplicate but cannot guarantee exactly once.",
    destinations: {
      emailConfigured: !!(
        process.env.SMTP_HOST &&
        process.env.SMTP_FROM &&
        process.env.ALERT_EMAIL
      ),
      webhookConfigured: !!process.env.ALERT_WEBHOOK_URL,
    },
    lock: await db.jobLock.findUnique({ where: { key: "alerts" } }),
    alerts: alerts.map((alert) => ({
      ...alert,
      state: alert.deliveredAt
        ? "delivered"
        : alert.attempts >= maximumAttempts()
          ? "exhausted"
          : alert.nextAttemptAt && +alert.nextAttemptAt > +now
            ? "backoff"
            : "pending",
    })),
  };
}
export function registerAlertRoutes(app: FastifyInstance) {
  const controllers = new Set<AbortController>();
  const jobs = new Set<Promise<unknown>>();
  app.addHook("preClose", async () => {
    for (const controller of controllers)
      controller.abort(new Error("API shutting down"));
    await Promise.allSettled([...jobs]);
  });
  app.get("/api/admin/alerts", alertDiagnostics);
  app.post("/api/admin/alerts/:id/retry", async (req) => {
    const { id } = z
      .object({ id: z.string().min(1).max(200) })
      .parse(req.params);
    z.object({})
      .strict()
      .parse(req.body ?? {});
    const alert = await retryAlert(id);
    return {
      id: alert.id,
      message:
        "Remaining channels queued for retry. Completed channels are preserved.",
    };
  });
  app.post("/api/admin/alerts/run", async (req, reply) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    const controller = new AbortController();
    controllers.add(controller);
    const disconnected = () => {
      if (!reply.raw.writableEnded)
        controller.abort(new Error("Alert request disconnected"));
    };
    reply.raw.once("close", disconnected);
    const job = evaluateAlerts({ force: true, signal: controller.signal });
    jobs.add(job);
    try {
      return await job;
    } finally {
      controllers.delete(controller);
      jobs.delete(job);
      reply.raw.removeListener("close", disconnected);
    }
  });
}
