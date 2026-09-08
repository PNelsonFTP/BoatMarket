"use client";
import { useEffect, useState } from "react";
import { api, type Connection } from "@/lib/client";
import type { alertDiagnostics, AlertEvaluationResult } from "@/server/alerts";
type Diagnostics = Awaited<ReturnType<typeof alertDiagnostics>>;
export function AlertOperations({
  connection,
}: {
  connection: Connection | null;
}) {
  const [data, setData] = useState<Diagnostics | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    if (connection) {
      const next = await api<Diagnostics>(connection, "/admin/alerts");
      if (!next || !Array.isArray(next.alerts) || !next.destinations)
        throw new Error(
          "Alert diagnostics unavailable; restart the updated local backend",
        );
      setData(next);
    }
  };
  useEffect(() => {
    void load().catch((error) => setError(String(error)));
  }, [connection?.url, connection?.token]);
  if (!connection) return null;
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card">
      <h3>Alert delivery & recovery</h3>
      <p className="muted">
        Saved-search events and external delivery have separate outcomes from
        source collection. Pending retries use backoff; a running worker checks
        due retries between source refreshes.
      </p>
      <div className="button-row">
        <button
          className="button"
          disabled={busy}
          onClick={() => void perform(load)}
        >
          Reload delivery status
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const result = await api<AlertEvaluationResult>(
                connection,
                "/admin/alerts/run",
                {},
              );
              setMessage(
                `Alert check ${result.status}: ${result.alertsCreated} created, ${result.delivered} delivered, ${result.failed} failed. ${result.errors.join("; ")}`,
              );
            })
          }
        >
          Check events & deliver due alerts
        </button>
      </div>
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
      {data && (
        <>
          <p>
            Email:{" "}
            {data.destinations.emailConfigured
              ? "configured"
              : "not configured"}{" "}
            · Webhook:{" "}
            {data.destinations.webhookConfigured
              ? "configured"
              : "not configured"}{" "}
            · Maximum attempts: {data.maximumAttempts}.
          </p>
          <p className="muted">{data.semantics}</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Delivery</th>
                  <th>Next attempt</th>
                  <th>Recovery</th>
                </tr>
              </thead>
              <tbody>
                {data.alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      {alert.title}
                      <small>
                        {new Date(alert.createdAt).toLocaleString()}
                      </small>
                    </td>
                    <td>
                      {alert.state} · {alert.attempts} attempts
                      {alert.deliveryError && (
                        <small>{alert.deliveryError}</small>
                      )}
                    </td>
                    <td>
                      {alert.nextAttemptAt
                        ? new Date(alert.nextAttemptAt).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      {!alert.deliveredAt && alert.attempts > 0 && (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() =>
                            void perform(async () => {
                              const result = await api<{ message: string }>(
                                connection,
                                `/admin/alerts/${encodeURIComponent(alert.id)}/retry`,
                                {},
                              );
                              setMessage(result.message);
                            })
                          }
                        >
                          Retry remaining channels
                        </button>
                      )}
                      <details>
                        <summary>Delivery history</summary>
                        <pre className="review-evidence">
                          {JSON.stringify(alert.deliveryHistory, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.alerts.length && (
            <p>
              No alerts have been created. The first enabled-search check
              establishes a baseline.
            </p>
          )}
        </>
      )}
    </section>
  );
}
