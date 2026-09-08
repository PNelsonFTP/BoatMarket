import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "./db";
export class ProviderCooldownError extends Error {
  statusCode = 429;
  constructor(
    public retryAt: string,
    message = "Provider is cooling down; retry after the recorded time",
  ) {
    super(message);
  }
}
export function retryDelay(
  attempts: number,
  status?: number,
  retryAfter?: string,
  now = Date.now(),
) {
  const header = retryAfter
    ? Number.isFinite(Number(retryAfter))
      ? Number(retryAfter) * 1000
      : Date.parse(retryAfter) - now
    : 0;
  return Math.min(
    86400000,
    Math.max(
      Number.isFinite(header) ? header : 0,
      status === 403 ? 86400000 : status === 429 ? 60000 : 900000,
      900000 * 2 ** Math.max(0, Math.min(attempts - 1, 6)),
    ),
  );
}
export async function providerCooldown(key: string, milliseconds: number) {
  await db.$transaction(async (tx) => {
    const current = await tx.providerState.findUnique({ where: { key } });
    const nextRequestAt = new Date(
      Math.max(
        current?.nextRequestAt.getTime() || 0,
        Date.now() + milliseconds,
      ),
    );
    await tx.providerState.upsert({
      where: { key },
      create: { key, nextRequestAt },
      update: { nextRequestAt },
    });
  });
}
/** One database-backed provider mutex serves interactive requests and every batch process. */
export async function withProviderLimit<T>(
  key: string,
  intervalMs: number,
  operation: () => Promise<T>,
  options: { signal?: AbortSignal; maxWaitMs?: number } = {},
): Promise<T> {
  const lockKey = `provider:${key}`,
    owner = randomUUID(),
    started = Date.now(),
    maxWait = options.maxWaitMs ?? 20000;
  let acquired = false;
  while (!acquired) {
    options.signal?.throwIfAborted();
    try {
      await db.jobLock.create({
        data: { key: lockKey, owner, expiresAt: new Date(Date.now() + 60000) },
      });
      acquired = true;
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      acquired = !!(
        await db.jobLock.updateMany({
          where: { key: lockKey, expiresAt: { lt: new Date() } },
          data: { owner, expiresAt: new Date(Date.now() + 60000) },
        })
      ).count;
      if (!acquired) {
        if (Date.now() - started >= maxWait)
          throw new ProviderCooldownError(
            new Date(Date.now() + intervalMs).toISOString(),
            "Another request to this provider is still running",
          );
        await delay(Math.min(250, maxWait), undefined, {
          signal: options.signal,
        });
      }
    }
  }
  try {
    const state = await db.providerState.findUnique({ where: { key } });
    const wait = Math.max(
      0,
      (state?.nextRequestAt.getTime() || 0) - Date.now(),
    );
    if (wait > maxWait - (Date.now() - started))
      throw new ProviderCooldownError(state!.nextRequestAt.toISOString());
    if (wait) await delay(wait, undefined, { signal: options.signal });
    options.signal?.throwIfAborted();
    await providerCooldown(key, intervalMs);
    return await operation();
  } finally {
    // Spacing after completion is conservative and prevents overlapping public-service requests.
    try {
      await providerCooldown(key, intervalMs);
    } finally {
      await db.jobLock.deleteMany({ where: { key: lockKey, owner } });
    }
  }
}
