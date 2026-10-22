"use client";
import { useEffect, useState } from "react";
import { api, type Connection } from "@/lib/client";
import ledger from "@/config/source-access.json";
import type { sourceHealth } from "@/server/source-health";
import type { listRefreshSessions } from "@/server/refresh-session";
type Health = Awaited<ReturnType<typeof sourceHealth>>;
type Sessions = Awaited<ReturnType<typeof listRefreshSessions>>;
export function SourceHealth({
  connection,
}: {
  connection: Connection | null;
}) {
  const [health, setHealth] = useState<Health | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Sessions>([]);
  const load = async () => {
    if (!connection) return;
    try {
      setHealth(await api<Health>(connection, "/admin/source-health"));
      setSessions(await api<Sessions>(connection, "/admin/refresh-sessions"));
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void load();
    if (!connection) return;
    const timer = setInterval(() => void load(), 5000);
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
              disabled={
                busy ||
                sessions.some(
                  (session) =>
                    session.status === "running" && session.leaseLive,
                )
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await api<{
                    sessionId: string;
                    message: string;
                  }>(connection, "/admin/refresh-sessions", {});
                  setMessage(`${result.message}. Session ${result.sessionId}.`);
                  await load();
                } catch (error) {
                  setError(String(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Start reviewable refresh session
            </button>
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
          <p className="muted">
            A reviewable session keeps every recovery pass and preserves the
            current website while collecting. Continue only eligible work;
            inspect coverage, then explicitly finalize. Neither workflow
            publishes to GitHub.
          </p>
          {sessions.slice(0, 3).map((session) => (
            <div key={session.sessionId} className="notice">
              <p>
                <strong>Session {session.sessionId}</strong> · {session.status}{" "}
                · {session.collectionPasses}/{session.maxPasses} passes
              </p>
              <ul>
                {session.sources.map((source) => (
                  <li key={source.sourceId}>
                    {source.source}: inventory{" "}
                    {source.latestInventory?.status || "not observed"}
                    {source.currentInventoryAds != null
                      ? ` (${source.currentInventoryAds} ads)`
                      : ""}{" "}
                    · details {source.details.succeeded}/
                    {source.details.eligible} complete,{" "}
                    {source.details.remaining} remain ·{" "}
                    {source.observations.fetched} fetched /{" "}
                    {source.observations.cacheOnly} cache-only distinct
                    observations
                    {source.excludedReasons.length
                      ? ` · manual review: ${source.excludedReasons.join(", ")}`
                      : ""}
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <button
                  className="button"
                  disabled={busy || session.leaseLive || !session.canContinue}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await api<{ message: string }>(
                        connection,
                        `/admin/refresh-sessions/${session.sessionId}/continue`,
                        {},
                      );
                      setMessage(result.message);
                      await load();
                    } catch (error) {
                      setError(String(error));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Continue eligible work
                </button>
                <button
                  className="button"
                  disabled={
                    busy || session.leaseLive || session.status === "complete"
                  }
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await api<{ message: string }>(
                        connection,
                        `/admin/refresh-sessions/${session.sessionId}/finalize`,
                        { allowPartial: !session.readyForCompleteExport },
                      );
                      setMessage(result.message);
                      await load();
                    } catch (error) {
                      setError(String(error));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {session.readyForCompleteExport
                    ? "Finalize complete session"
                    : "Finalize with explicit partial coverage"}
                </button>
              </div>
              {!session.readyForCompleteExport && (
                <p className="muted">
                  Partial finalization retains unresolved source/detail warnings
                  in the exported refresh outcome. Inspect those gaps before
                  activating.
                </p>
              )}
              {session.errors.map((error, index) => (
                <p key={index}>{error}</p>
              ))}
            </div>
          ))}
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
          {health.refresh?.snapshot?.warnings?.map((warning, index) => (
            <p
              key={`snapshot-warning-${index}`}
              className="notice error"
              role="alert"
            >
              Snapshot follow-up: {warning}
            </p>
          ))}
          {health.alertEvaluation &&
            ["failed", "partial", "cancelled"].includes(
              health.alertEvaluation.status,
            ) && (
              <p className="notice error">
                {health.alertEvaluation.error} Run{" "}
                {health.alertEvaluation.runId}.
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
                      {s.progress && (
                        <small>
                          Live: {s.progress.phase}
                          {s.progress.wait
                            ? ` · waiting: ${s.progress.wait.reason}`
                            : ""}
                        </small>
                      )}
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
                      {s.metrics?.inventory && (
                        <small>
                          {s.metrics.inventory.status} · baseline{" "}
                          {s.metrics.inventory.baseline.count} (
                          {s.metrics.inventory.baseline.kind})
                          {s.metrics.inventory.capturedAt
                            ? ` · captured ${new Date(s.metrics.inventory.capturedAt).toLocaleString()}`
                            : ""}
                        </small>
                      )}
                    </td>
                    <td>
                      {s.metrics
                        ? `${s.metrics.detailPagesSucceeded}/${s.metrics.detailPagesEligible}${s.metrics.detailPagesSkippedLimit ? ` · ${s.metrics.detailPagesSkippedLimit} capped` : ""}`
                        : "—"}
                      {s.metrics?.detailPolicy && (
                        <small>
                          {s.metrics.detailPolicy} ·{" "}
                          {s.metrics.detailPagesDeferred || 0} planned later ·{" "}
                          {s.metrics.detailPagesBackoff || 0} retry backoff
                        </small>
                      )}
                      {s.metrics?.quality && (
                        <small>
                          Quality: {s.metrics.quality.status}
                          {s.metrics.quality.issues.length
                            ? ` · ${s.metrics.quality.issues.join("; ")}`
                            : ""}
                        </small>
                      )}
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
