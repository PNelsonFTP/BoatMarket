"use client";
import { useEffect, useState } from "react";
import { api, downloadJson, type Connection } from "@/lib/client";
import type { VesselTimeline as Timeline } from "@/lib/duplicates";

export function VesselTimeline({
  connection,
  id,
  initiallyOpen = false,
}: {
  connection: Connection | null;
  id: string;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen),
    [data, setData] = useState<Timeline | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    setError("");
  }, [id, connection]);
  useEffect(() => {
    if (!open || !connection || data) return;
    let stopped = false;
    setBusy(true);
    api<Timeline>(connection, `/vessels/${encodeURIComponent(id)}?limit=200`)
      .then((result) => {
        if (!stopped) setData(result);
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      })
      .finally(() => {
        if (!stopped) setBusy(false);
      });
    return () => {
      stopped = true;
    };
  }, [open, connection, id, data]);
  async function more() {
    if (!connection || !data) return;
    setBusy(true);
    try {
      const next = await api<Timeline>(
        connection,
        `/vessels/${encodeURIComponent(id)}?offset=${data.events.length}&limit=200`,
      );
      setData({ ...next, events: [...data.events, ...next.events], offset: 0 });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not read vessel history",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="detail-section"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Vessel history</summary>
      <p className="small muted">
        Persistent research identity with original advertisements and observed
        asking prices/statuses. Reviews can be corrected; these are not verified
        sales or ownership records.
      </p>
      {!connection ? (
        <p>
          Connect to the backend to inspect the complete private review/history
          ledger.
        </p>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          {busy && !data && <p role="status">Loading vessel history…</p>}
          {data && (
            <>
              <p>
                <strong>{data.vesselId}</strong>
                <br />
                {data.identityBasis}
              </p>
              {data.requestedId !== data.vesselId &&
                data.aliases.includes(data.requestedId) && (
                  <p>
                    This earlier identity now resolves to the retained vessel
                    identity above.
                  </p>
                )}
              <h4>Current advertisements ({data.members.length})</h4>
              <ul>
                {data.members.map((ad) => (
                  <li key={ad.id}>
                    <a href={ad.url} target="_blank" rel="noopener noreferrer">
                      {ad.source}: {ad.title}
                    </a>{" "}
                    · {ad.status} ·{" "}
                    {ad.price == null
                      ? "Price unknown"
                      : `$${ad.price.toLocaleString()}`}
                  </li>
                ))}
              </ul>
              {data.historicalAds.length > 0 && (
                <>
                  <h4>Earlier associated ads ({data.historicalAds.length})</h4>
                  <p className="small muted">
                    These ads left this identity and remain visible for audit;
                    their current prices/statuses are not attributed to this
                    vessel.
                  </p>
                  <ul>
                    {data.historicalAds.map((ad) => (
                      <li key={ad.id}>
                        <a
                          href={ad.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {ad.source}: {ad.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <ol>
                {data.events.map((event) => (
                  <li key={event.id}>
                    <time dateTime={event.at}>
                      {new Date(event.at).toLocaleString()}
                    </time>
                    {event.source ? ` · ${event.source}` : ""}
                    <p
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {event.detail}
                    </p>
                  </li>
                ))}
              </ol>
              <p>
                {data.events.length} of {data.totalEvents} recorded events
              </p>
              {data.events.length < data.totalEvents && (
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void more()}
                >
                  Load older history
                </button>
              )}
              <button
                className="button"
                type="button"
                onClick={() =>
                  downloadJson(`boatscout-vessel-${data.vesselId}.json`, data)
                }
              >
                Download loaded vessel history
              </button>
            </>
          )}
        </>
      )}
    </details>
  );
}
