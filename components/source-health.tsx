"use client";
import { useEffect, useState } from "react";
import { api, type Connection } from "@/lib/client";
import ledger from "@/config/source-access.json";
import type { sourceHealth } from "@/server/source-health";
type Health = Awaited<ReturnType<typeof sourceHealth>>;
export function SourceHealth({
  connection,
}: {
  connection: Connection | null;
}) {
  const [health, setHealth] = useState<Health | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    if (!connection) return;
    try {
      setHealth(await api<Health>(connection, "/admin/source-health"));
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void load();
    if (!connection) return;
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [connection?.url, connection?.token]);
  return (
    <section className="settings-card">
      <h2>Source health & refresh</h2>
      <p className="muted">
        Coverage means what configured pages exposed. Ads and cache hits are not
        proof of every available boat.
      </p>
      {connection && (
        <>
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await api<{ message: string; runId: string }>(
                    connection,
                    "/admin/refresh",
                    {},
                  );
                  setMessage(`${r.message} Run ${r.runId}.`);
                  await load();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Refresh data & snapshot
            </button>
            <button className="button" onClick={() => void load()}>
              Reload status
            </button>
          </div>
          <p className="muted">
            Backs up the database, collects configured sources and exports only
            after success. Uses source cache settings. The report identifies any
            partial result. This does not publish to GitHub.
          </p>
        </>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {health && (
        <>
          <p>
            Worker:{" "}
            <strong>
              {health.workerFresh
                ? health.worker?.state
                : "not reporting a recent heartbeat"}
            </strong>
            {health.worker?.nextRunAt
              ? ` · next cycle ${new Date(health.worker.nextRunAt).toLocaleString()}`
              : ""}
          </p>
          <p>
            Latest full refresh:{" "}
            <strong>
              {health.refresh?.status || "No recorded full refresh"}
            </strong>
            {health.refresh
              ? ` · ${health.refresh.stage} · ${new Date(health.refresh.startedAt).toLocaleString()}`
              : ""}
          </p>
          {health.refresh?.errors.map((e, i) => (
            <p key={i} className="notice">
              {e}
            </p>
          ))}
          {health.alertEvaluation?.status === "failed" && (
            <p className="notice error">
              {health.alertEvaluation.error} Run {health.alertEvaluation.runId}.
            </p>
          )}
          <div className="table-scroll">
            <table className="data-table source-health-table">
              <thead>
                <tr>
                  <th>Configured source</th>
                  <th>Latest run</th>
                  <th>Inventory pages</th>
                  <th>Details</th>
                  <th>Cache / fetched</th>
                </tr>
              </thead>
              <tbody>
                {health.sources.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      <small>{s.enabled ? "Enabled" : "Disabled"}</small>
                    </td>
                    <td>
                      {s.latestRun?.status || "Not collected"}
                      <small>
                        {s.latestRun?.startedAt
                          ? new Date(s.latestRun.startedAt).toLocaleString()
                          : ""}
                      </small>
                    </td>
                    <td>
                      {s.metrics
                        ? `${s.metrics.inventoryPagesSucceeded}/${s.metrics.inventoryPagesAttempted}${s.metrics.inventoryPageLimitReached ? " · capped" : ""}`
                        : "—"}
                    </td>
                    <td>
                      {s.metrics
                        ? `${s.metrics.detailPagesSucceeded}/${s.metrics.detailPagesEligible}${s.metrics.detailPagesSkippedLimit ? ` · ${s.metrics.detailPagesSkippedLimit} capped` : ""}`
                        : "—"}
                    </td>
                    <td>
                      {s.metrics
                        ? `${s.metrics.cacheHits} / ${s.metrics.fetchedPages}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Full latest collection report</summary>
            <pre className="review-evidence">
              {JSON.stringify(health.collection, null, 2)}
            </pre>
          </details>
        </>
      )}
      <details>
        <summary>
          Known coverage gaps · {ledger.sources.length} sources and services
        </summary>
        <p className="muted">{ledger.note}</p>
        {ledger.sources.map((s) => (
          <div className="coverage-gap" key={s.name}>
            <strong>
              {s.name} · {s.status}
            </strong>
            <p>
              {s.observation} <small>Observed {s.observedOn}</small>
            </p>
            <p className="muted">Next: {s.nextAction}</p>
          </div>
        ))}
      </details>
    </section>
  );
}
