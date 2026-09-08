"use client";
import { useEffect, useState } from "react";
import { api, type Connection } from "@/lib/client";
import type { Filters, Listing, Workspace } from "@/lib/types";
import { LAKE_HOLIDAY } from "@/lib/lake-holiday";
import { drivingTime, routeMatches } from "@/lib/routing";
export function DrivingFilter({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (value: Filters) => void;
}) {
  return (
    <div className="filter-section">
      <h3>Driving time</h3>
      <label className="check-label">
        <input
          type="checkbox"
          checked={!!filters.driving}
          onChange={(e) =>
            onChange({
              ...filters,
              reference: filters.reference || LAKE_HOLIDAY,
              driving: e.target.checked
                ? { maxMinutes: 240, excludeUnknown: true }
                : undefined,
            })
          }
        />
        Limit estimated one-way drive
      </label>
      {filters.driving && (
        <>
          <label>
            Maximum drive hours
            <input
              aria-label="Maximum drive hours"
              type="number"
              min="0.25"
              max="96"
              step="0.25"
              value={filters.driving.maxMinutes / 60}
              onChange={(e) =>
                onChange({
                  ...filters,
                  driving: {
                    ...filters.driving!,
                    maxMinutes: Math.max(15, Number(e.target.value) * 60),
                  },
                })
              }
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={filters.driving.excludeUnknown}
              onChange={(e) =>
                onChange({
                  ...filters,
                  driving: {
                    ...filters.driving!,
                    excludeUnknown: e.target.checked,
                  },
                })
              }
            />
            Exclude missing, failed, or expired routes
          </label>
        </>
      )}
      <p className="small muted">
        Default: four hours from your selected distance reference, or Lake
        Holiday if none is selected. Calculate routes in Settings. Straight-line
        radius filters remain separate; no road time is guessed from mileage.
      </p>
    </div>
  );
}
export function RouteEvidence({ listing }: { listing: Listing }) {
  const route = listing.routeEstimate;
  if (!route)
    return (
      <p className="small muted">Road travel time has not been calculated.</p>
    );
  const valid = routeMatches(listing, {
    reference: route.origin,
    locationTarget: "boat",
  });
  return (
    <div className="notice">
      <strong>
        {route.status === "ready"
          ? `${drivingTime(route.durationMinutes || 0)} estimated drive · ${Math.round(route.distanceMiles || 0)} road miles${valid ? "" : " · expired or location changed"}`
          : `Route ${route.status}`}
      </strong>
      <p className="small">
        {route.provider} · calculated{" "}
        {new Date(route.computedAt).toLocaleString()} · expires{" "}
        {new Date(route.expiresAt).toLocaleDateString()}
      </p>
      <p className="small muted">
        From {route.origin.lat.toFixed(4)}, {route.origin.lng.toFixed(4)}. No
        live traffic, stops, or trailer restrictions. Approximate coordinates
        affect the estimate.
      </p>
      {route.error && <p className="error-text">{route.error}</p>}
    </div>
  );
}
export function RoutingReview({
  connection,
  listings,
  workspace,
  onRefresh,
}: {
  connection: Connection;
  listings: Listing[];
  workspace: Workspace;
  onRefresh: () => Promise<void>;
}) {
  const [config, setConfig] = useState<{
      configured: boolean;
      base: string;
      provider: string;
      cacheDays: number;
    } | null>(null),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [origin, setOrigin] = useState(LAKE_HOLIDAY),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void api<typeof config>(connection, "/admin/routing")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, [connection.url, connection.token]);
  const available = listings
    .filter(
      (l) =>
        l.lat != null &&
        l.lng != null &&
        `${l.title} ${l.city} ${l.state}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice(0, 30);
  return (
    <section className="settings-card">
      <h2>Road travel estimates</h2>
      <p>
        Choose up to 25 boats per batch. Requests send the chosen origin and
        boat coordinates to the configured provider, one at a time. Results are
        cached and can be screened with the optional four-hour drive filter.
      </p>
      <p className="notice">
        {config?.configured
          ? `${config.provider} · ${config.base} · cache ${config.cacheDays} days`
          : "No routing provider configured. Set ROUTING_URL to an OSRM-compatible managed or self-hosted endpoint. For a local server, explicitly list its origin in ROUTING_LOCAL_ORIGINS."}
      </p>
      <label>
        Drive from
        <select
          value={origin.name}
          onChange={(e) =>
            setOrigin(
              workspace.referencePoints.find(
                (point) => point.name === e.target.value,
              ) || LAKE_HOLIDAY,
            )
          }
        >
          {[
            LAKE_HOLIDAY,
            ...workspace.referencePoints.filter(
              (p) => p.name !== LAKE_HOLIDAY.name,
            ),
          ].map((point) => (
            <option key={point.name}>{point.name}</option>
          ))}
        </select>
      </label>
      <label>
        Find boats for routing
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Boat, city, or state"
        />
      </label>
      <div className="review-list">
        {available.map((l) => (
          <label className="check-label" key={l.id}>
            <input
              type="checkbox"
              disabled={
                busy || (!selected.includes(l.id) && selected.length >= 25)
              }
              checked={selected.includes(l.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, l.id]
                    : selected.filter((id) => id !== l.id),
                )
              }
            />
            {l.title} ·{" "}
            {l.locationOverride?.label || l.city || "Source coordinates"}
            {l.routeEstimate?.status === "ready"
              ? ` · ${drivingTime(l.routeEstimate.durationMinutes || 0)}`
              : ""}
          </label>
        ))}
      </div>
      <button
        className="button primary"
        disabled={!config?.configured || busy || !selected.length}
        onClick={async () => {
          setBusy(true);
          setError("");
          let failures = 0;
          try {
            for (const [index, id] of selected.entries()) {
              const response = await api<{
                estimate: { status: string; error?: string };
                cached: boolean;
              }>(connection, `/listings/${encodeURIComponent(id)}/route`, {
                origin,
                target: "boat",
              });
              if (response.estimate.status !== "ready") failures++;
              setMessage(
                `${index + 1}/${selected.length} completed · ${failures} unavailable routes${response.cached ? " · cache reused" : ""}`,
              );
            }
            await onRefresh();
          } catch (e) {
            setError((e as Error).message);
            await onRefresh().catch(() => {});
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Calculating…" : `Calculate ${selected.length} routes`}
      </button>
      <p className="small muted">
        Road-network estimates exclude live traffic and stops; this driving
        profile does not certify trailer clearance or towing suitability.
        Attribution:{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap contributors
        </a>{" "}
        ·{" "}
        <a href="https://project-osrm.org/" target="_blank" rel="noreferrer">
          OSRM
        </a>
        .
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </section>
  );
}
