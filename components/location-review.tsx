"use client";
import { useEffect, useState } from "react";
import { api, type Connection } from "@/lib/client";
type City = {
  key: string;
  city: string;
  state: string;
  ads: number;
  unknown: number;
  offsite: number;
  point: { lat: number; lng: number; label: string; reviewed?: boolean } | null;
  review: unknown;
};
export function LocationReview({
  connection,
  onRefresh,
}: {
  connection: Connection;
  onRefresh: () => Promise<void>;
}) {
  const [cities, setCities] = useState<City[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<City | null>(null),
    [lat, setLat] = useState(""),
    [lng, setLng] = useState(""),
    [label, setLabel] = useState(""),
    [evidence, setEvidence] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const result = await api<{ cities: City[] }>(
        connection,
        "/admin/locations",
      );
      setCities(result.cities);
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void load();
  }, [connection.url, connection.token]);
  return (
    <section className="settings-card">
      <h2>Location review</h2>
      <p className="muted">
        Review city centers used for approximate straight-line distance. Offsite
        boats stay unlocated. Exact source coordinates are preserved. A reviewed
        city center is still an estimate.
      </p>
      <label>
        Find a city
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="City or state"
        />
      </label>
      <div className="review-list">
        {cities
          .filter((c) =>
            `${c.city} ${c.state}`.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 30)
          .map((c) => (
            <button
              type="button"
              className="button"
              key={c.key}
              onClick={() => {
                setSelected(c);
                setLat(c.point?.lat.toString() || "");
                setLng(c.point?.lng.toString() || "");
                setLabel(c.point?.label || `${c.city}, ${c.state}`);
                setEvidence("");
                setMessage("");
              }}
            >
              {c.city}, {c.state} · {c.ads} ads · {c.unknown} unlocated
              {c.point?.reviewed ? " · reviewed" : ""}
            </button>
          ))}
      </div>
      {selected && (
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await api<{ message: string }>(
                connection,
                "/admin/locations",
                {
                  city: selected.city,
                  state: selected.state,
                  lat: Number(lat),
                  lng: Number(lng),
                  label,
                  evidence,
                },
                "PUT",
              );
              setMessage(result.message);
              setSelected(null);
              await load();
              await onRefresh();
            } catch (error) {
              setError(String(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h4>
            Correct {selected.city}, {selected.state}
          </h4>
          <label>
            Latitude
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              required
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="any"
              min="-180"
              max="180"
              required
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </label>
          <label>
            Place label
            <input
              required
              maxLength={500}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label>
            Evidence for this correction
            <textarea
              required
              minLength={5}
              maxLength={2000}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Map/source checked and why this is the right city. Kept in local review records."
            />
          </label>
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              Save reviewed city center
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
          </div>
          {!!selected.review && (
            <details>
              <summary>Previous lookup evidence</summary>
              <pre className="review-evidence">
                {JSON.stringify(selected.review, null, 2)}
              </pre>
            </details>
          )}
        </form>
      )}
      {message && <p className="notice">{message}</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </section>
  );
}
