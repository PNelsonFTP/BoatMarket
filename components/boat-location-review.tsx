"use client";
import { useEffect, useState } from "react";
import { api, type Connection } from "@/lib/client";
import type { Listing } from "@/lib/types";
type Row = {
  id: string;
  title: string;
  city: string | null;
  state: string | null;
  sourceUrl: string;
  lat: number | null;
  lng: number | null;
  offsite: boolean;
  precision: string | null;
  sourceLocation: Listing["sourceLocation"] | null;
  override: Listing["locationOverride"] | null;
  revision: number;
};
export function BoatLocationReview({
  connection,
  onRefresh,
}: {
  connection: Connection;
  onRefresh: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [lat, setLat] = useState(""),
    [lng, setLng] = useState(""),
    [label, setLabel] = useState(""),
    [evidence, setEvidence] = useState(""),
    [sourceUrl, setSourceUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reverting, setReverting] = useState(false),
    [history, setHistory] = useState<unknown>(null);
  const load = async () =>
    setRows(
      (await api<{ listings: Row[] }>(connection, "/admin/locations/listings"))
        .listings,
    );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [connection.url, connection.token]);
  async function finish(action: () => Promise<{ message: string }>) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      setMessage(result.message);
      setSelected(null);
      await load();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <h2>Actual boat location</h2>
      <p>
        Use source or seller confirmation to correct one boat, including an
        offsite boat. The original coordinates remain available and every
        correction can be reverted. The address label and evidence stay private
        in the connected backend; ordinary public exports use the original
        source location.
      </p>
      <label>
        Find a boat to locate
        <input
          aria-label="Find a boat to locate"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Boat title, city, or state"
        />
      </label>
      <div className="review-list">
        {rows
          .filter((row) =>
            `${row.title} ${row.city} ${row.state}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .slice(0, 30)
          .map((row) => (
            <button
              className="button"
              type="button"
              key={row.id}
              onClick={() => {
                setSelected(row);
                setLat(row.lat?.toString() || "");
                setLng(row.lng?.toString() || "");
                setLabel(
                  row.override?.label ||
                    `${row.city || ""}, ${row.state || ""}`,
                );
                setEvidence("");
                setSourceUrl(row.sourceUrl);
                setHistory(null);
                setReverting(false);
                setError("");
                setMessage("");
              }}
            >
              {row.title} ·{" "}
              {row.override
                ? "corrected"
                : row.offsite
                  ? "offsite / needs location"
                  : row.lat == null
                    ? "unlocated"
                    : row.precision || "source coordinates"}
            </button>
          ))}
      </div>
      {selected && (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void finish(() =>
              api(
                connection,
                `/admin/locations/listings/${encodeURIComponent(selected.id)}`,
                {
                  lat: Number(lat),
                  lng: Number(lng),
                  label,
                  evidence,
                  ...(sourceUrl ? { sourceUrl } : {}),
                  revision: selected.revision,
                },
                "PUT",
              ),
            );
          }}
        >
          <h3>{selected.title}</h3>
          <p className="small">
            Source location:{" "}
            {selected.sourceLocation
              ? `${selected.sourceLocation.lat ?? "unknown"}, ${selected.sourceLocation.lng ?? "unknown"} · ${selected.sourceLocation.precision || "reported"}`
              : `${selected.lat ?? "unknown"}, ${selected.lng ?? "unknown"}`}
          </p>
          <div className="form-row">
            <label>
              Actual boat latitude
              <input
                type="number"
                min="-90"
                max="90"
                step="any"
                required
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label>
              Actual boat longitude
              <input
                type="number"
                min="-180"
                max="180"
                step="any"
                required
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </label>
          </div>
          <label>
            Private location label
            <input
              required
              maxLength={500}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Seller-confirmed pickup location"
            />
          </label>
          <label>
            Evidence for actual boat location
            <textarea
              required
              minLength={5}
              maxLength={4000}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="What was checked, who confirmed the boat location, and when"
            />
          </label>
          <label>
            Source or confirmation URL (optional)
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              Save actual boat location
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
            {selected.override && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setReverting(true)}
              >
                Review revert to source location
              </button>
            )}
            <button
              type="button"
              className="button"
              onClick={async () => {
                try {
                  setHistory(
                    await api(
                      connection,
                      `/admin/locations/listings/${encodeURIComponent(selected.id)}/history`,
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Show location review history
            </button>
          </div>
          {reverting && (
            <div className="notice">
              <p>
                This restores the original source coordinates. An offsite boat
                may become unlocated again. Private review history remains.
              </p>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() =>
                  void finish(() =>
                    api(
                      connection,
                      `/admin/locations/listings/${encodeURIComponent(selected.id)}`,
                      { revision: selected.revision },
                      "DELETE",
                    ),
                  )
                }
              >
                Confirm location revert
              </button>
            </div>
          )}
          {history != null && (
            <details open>
              <summary>Private correction history</summary>
              <pre className="review-evidence">
                {JSON.stringify(history, null, 2)}
              </pre>
            </details>
          )}
        </form>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </section>
  );
}
