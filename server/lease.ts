import { db } from "./db";

export class CollectorLeaseLostError extends Error {
  code = "COLLECTOR_LEASE_LOST";
  constructor(
    message = "Collector lease lost; this owner stopped without further listing writes",
  ) {
    super(message);
    this.name = "CollectorLeaseLostError";
  }
}

export function isCollectionAbort(error: unknown, signal?: AbortSignal) {
  return (
    signal?.aborted ||
    (error as { code?: string })?.code === "COLLECTOR_LEASE_LOST"
  );
}

/** Renew only a still-live lease. An expired owner must never revive itself. */
export function startCollectorLease(
  owner: string,
  options: {
    key?: string;
    ttlMs?: number;
    signal?: AbortSignal;
    renew?: () => Promise<boolean>;
  } = {},
) {
  const ttlMs = options.ttlMs ?? 60 * 60 * 1000;
  const controller = new AbortController();
  const abort = () =>
    controller.abort(
      options.signal?.reason ?? new Error("Collection cancelled"),
    );
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const renew =
    options.renew ??
    (async () => {
      const now = new Date();
      const result = await db.jobLock.updateMany({
        where: {
          key: options.key ?? "collector",
          owner,
          expiresAt: { gt: now },
        },
        data: { expiresAt: new Date(now.getTime() + ttlMs) },
      });
      return result.count === 1;
    });
  let renewing: Promise<void> | undefined;
  async function checkpoint() {
    controller.signal.throwIfAborted();
    if (!renewing) {
      renewing = (async () => {
        try {
          if (!(await renew())) throw new CollectorLeaseLostError();
        } catch (error) {
          controller.abort(
            error instanceof CollectorLeaseLostError
              ? error
              : new CollectorLeaseLostError(
                  "Collector lease renewal failed; stopping collection",
                ),
          );
        }
      })().finally(() => {
        renewing = undefined;
      });
    }
    await renewing;
    controller.signal.throwIfAborted();
  }
  const timer = setInterval(
    () => {
      void checkpoint().catch(() => {});
    },
    Math.max(10, Math.floor(ttlMs / 3)),
  );
  timer.unref?.();
  return {
    signal: controller.signal,
    checkpoint,
    async stop() {
      clearInterval(timer);
      options.signal?.removeEventListener("abort", abort);
      await renewing;
    },
  };
}
