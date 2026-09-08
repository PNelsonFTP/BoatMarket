"use client";
import { useEffect, useState } from "react";
import { api, type Connection } from "@/lib/client";
type Status = {
  locks: { key: string; owner: string; live: boolean; expiresAt: string }[];
  worker: { state?: string; nextRunAt?: string; instanceId?: string } | null;
  jobs: {
    runId?: string;
    status?: string;
    leaseLive: boolean;
    stage?: string;
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
      15000,
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
            <p key={job.runId}>
              {job.runId} · {job.status} · {job.stage || "collection"} ·{" "}
              {job.leaseLive ? "lease live" : "no live lease"}{" "}
              <button
                className="button"
                disabled={busy || !job.leaseLive}
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
