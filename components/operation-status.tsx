"use client";
import { useEffect, useState } from "react";
import { api, type Connection } from "@/lib/client";
import type { CollectorProgress } from "@/server/collector-progress";
type Status = {
  locks: { key: string; owner: string; live: boolean; expiresAt: string }[];
  worker: { state?: string; nextRunAt?: string; instanceId?: string } | null;
  jobs: {
    runId?: string;
    status?: string;
    leaseLive: boolean;
    stage?: string;
    progress?: CollectorProgress | null;
    progressState?: string;
    cancelRequested?: boolean;
  }[];
};
export function OperationStatus({
  connection,
}: {
  connection: Connection | null;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [preview, setPreview] = useState<unknown>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    if (connection)
      setStatus(await api<Status>(connection, "/admin/operations"));
  };
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
    if (!connection) return;
    const timer = setInterval(
      () => void load().catch((e) => setMessage(e.message)),
      5000,
    );
    return () => clearInterval(timer);
  }, [connection?.url, connection?.token]);
  if (!connection) return null;
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card">
      <h2>Worker & job recovery</h2>
      <p className="muted">
        A live lease identifies the intended worker. A stale heartbeat or
        expired job needs review; recovery preserves its original report and
        checks snapshot activation.
      </p>
      {status && (
        <>
          <p>
            Worker:{" "}
            {status.locks.some((l) => l.key === "worker" && l.live)
              ? status.worker?.state || "running; awaiting heartbeat"
              : "not running (no live worker lease)"}{" "}
            · {status.locks.filter((l) => l.live).length} live leases
          </p>
          {status.jobs.map((job) => (
            <div key={job.runId} className="notice" role="status">
              <p>
                {job.runId} · {job.status} · {job.stage || "collection"} ·{" "}
                {job.leaseLive ? "lease live" : "no live lease"}{" "}
                <button
                  className="button"
                  disabled={busy || !job.leaseLive || job.cancelRequested}
                  onClick={() =>
                    void action(async () => {
                      await api(connection, "/admin/operations/cancel", {
                        runId: job.runId,
                      });
                      setMessage(
                        "Cancellation requested. Status changes when the job acknowledges it.",
                      );
                    })
                  }
                >
                  Cancel job
                </button>
              </p>
              {job.progress && (
                <p>
                  {job.progress.source || "Preparing collection"} ·{" "}
                  {job.progress.phase}
                  {` · source ${job.progress.sourceIndex}/${job.progress.sourceCount} · ${Math.round((Date.now() - Date.parse(job.progress.startedAt)) / 1000)}s elapsed`}
                  {job.progress.metrics &&
                    ` · inventory ${job.progress.metrics.inventoryPagesSucceeded}/${job.progress.metrics.inventoryPagesAttempted} pages (${job.progress.metrics.inventoryPagesDiscovered} discovered) · details ${job.progress.metrics.detailPagesAttempted}/${job.progress.metrics.detailPagesEligible} attempted, ${job.progress.metrics.detailPagesSucceeded} succeeded`}
                  {job.progress.lastSuccessfulCheckpointAt &&
                    ` · last successful checkpoint ${new Date(job.progress.lastSuccessfulCheckpointAt).toLocaleTimeString()}`}
                </p>
              )}
              {job.progressState === "waiting" && (
                <p>
                  Intentional wait: {job.progress?.wait?.reason} until{" "}
                  {job.progress?.wait &&
                    new Date(job.progress.wait.until).toLocaleTimeString()}
                  . Source crawl restrictions remain in effect.
                </p>
              )}
              {job.progressState === "possible-stall" && (
                <p>
                  Possible stall: no progress checkpoint for over two minutes
                  and no recorded source delay is active. A live lease shows
                  ownership; inspect the report before cancelling or recovering.
                </p>
              )}
              {job.progressState === "cancellation-pending" && (
                <p>
                  Cancellation requested; waiting for the current request or
                  cooperative checkpoint to acknowledge it.
                </p>
              )}
              {job.progressState === "interrupted" && (
                <p>
                  No live job lease. The last progress checkpoint is retained;
                  preview recovery before continuing.
                </p>
              )}
            </div>
          ))}
          <details>
            <summary>Lease details</summary>
            <pre className="review-evidence">
              {JSON.stringify(status.locks, null, 2)}
            </pre>
          </details>
        </>
      )}
      <div className="button-row">
        <button
          className="button"
          disabled={busy}
          onClick={() => void action(load)}
        >
          Reload operation status
        </button>
        <button
          className="button"
          disabled={
            busy || !status?.locks.some((l) => l.key === "worker" && l.live)
          }
          onClick={() =>
            void action(async () => {
              await api(connection, "/admin/operations/cancel", {});
              setMessage(
                "Worker stop requested; its current job will cancel cooperatively.",
              );
            })
          }
        >
          Stop this worker
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void action(async () =>
              setPreview(
                await api(connection, "/admin/operations/recover", {
                  apply: false,
                }),
              ),
            )
          }
        >
          Preview interrupted-job recovery
        </button>
      </div>
      {preview != null && (
        <>
          <pre className="review-evidence">
            {JSON.stringify(preview, null, 2)}
          </pre>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const result = await api(
                  connection,
                  "/admin/operations/recover",
                  { apply: true },
                );
                setPreview(result);
                setMessage(
                  "Recovery rechecked leases and recorded its outcome.",
                );
              })
            }
          >
            Recheck leases and recover interrupted jobs
          </button>
        </>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
