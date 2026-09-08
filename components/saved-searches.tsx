"use client";
import { Bookmark, Search, Trash2, Bell } from "lucide-react";
import type { Filters, Workspace, SavedSearch } from "@/lib/types";
import { searchListings } from "@/lib/search";
import type { Listing } from "@/lib/types";
import {
  ALERT_EVENT_TYPES,
  ALERT_EVENT_LABELS,
  DEFAULT_ALERT_EVENTS,
} from "@/lib/alert-events";
export function SavedSearches({
  workspace,
  listings,
  onChange,
  onApply,
  live,
}: {
  workspace: Workspace;
  listings: Listing[];
  onChange: (fn: (w: Workspace) => Workspace) => void;
  onApply: (f: Filters) => void;
  live: boolean;
}) {
  function update(id: string, change: Partial<SavedSearch>) {
    onChange((w) => ({
      ...w,
      savedSearches: w.savedSearches.map((s) =>
        s.id === id ? { ...s, ...change } : s,
      ),
    }));
  }
  return (
    <>
      <div className="notice">
        <Bell size={17} />
        {live
          ? "Alerts are checked while your local worker is running. The first check establishes a baseline; later new or changed matches create alerts."
          : "Searches are saved in this browser. Connect your backend and save a search there to enable scheduled alerts."}
      </div>
      {workspace.savedSearches.length ? (
        <div className="saved-grid">
          {workspace.savedSearches.map((s) => (
            <section className="saved-card" key={s.id}>
              <div className="section-heading">
                <span className="saved-icon">
                  <Bookmark size={20} />
                </span>
                <button
                  className="icon-button"
                  aria-label={`Delete saved search ${s.name}`}
                  onClick={() =>
                    onChange((w) => ({
                      ...w,
                      savedSearches: w.savedSearches.filter(
                        (x) => x.id !== s.id,
                      ),
                    }))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <h2>{s.name}</h2>
              <p>
                {searchListings(listings, s.filters).length} matching boats ·{" "}
                {s.filters.areas.length || "All"} search areas
              </p>
              <div className="saved-criteria">
                {Object.keys(s.filters.criteria)
                  .filter((k) => k !== "status")
                  .map((k) => (
                    <span key={k}>{k.replace(/([A-Z])/g, " $1")}</span>
                  ))}
              </div>
              <label className="field-label">
                Check for updates
                <select
                  aria-label={`Alert cadence for ${s.name}`}
                  value={s.cadence}
                  disabled={!live}
                  onChange={(e) =>
                    update(s.id, {
                      cadence: e.target.value as SavedSearch["cadence"],
                    })
                  }
                >
                  <option value="off">Off</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <div className="channel-options">
                {(["in-app", "email", "webhook"] as const).map((c) => (
                  <label className="check-label" key={c}>
                    <input
                      type="checkbox"
                      disabled={!live}
                      checked={s.channels.includes(c)}
                      onChange={(e) =>
                        update(s.id, {
                          channels: e.target.checked
                            ? [...s.channels, c]
                            : s.channels.filter((x) => x !== c),
                        })
                      }
                    />
                    {c === "in-app"
                      ? "In app"
                      : c === "email"
                        ? "Email"
                        : "Webhook"}
                  </label>
                ))}
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={s.digest}
                  disabled={!live}
                  onChange={(e) => update(s.id, { digest: e.target.checked })}
                />
                Combine changes into a digest
              </label>
              <fieldset className="field-label">
                <legend>Notify me about</legend>
                {ALERT_EVENT_TYPES.map((kind) => (
                  <label className="check-label" key={kind}>
                    <input
                      type="checkbox"
                      disabled={!live}
                      checked={(s.eventTypes ?? DEFAULT_ALERT_EVENTS).includes(
                        kind,
                      )}
                      onChange={(event) =>
                        update(s.id, {
                          eventTypes: event.target.checked
                            ? [...(s.eventTypes ?? DEFAULT_ALERT_EVENTS), kind]
                            : (s.eventTypes ?? DEFAULT_ALERT_EVENTS).filter(
                                (item) => item !== kind,
                              ),
                        })
                      }
                    />
                    {ALERT_EVENT_LABELS[kind]}
                  </label>
                ))}
                <small>
                  Status changes also cover a previously matching boat becoming
                  sold or removed. Changing events or filters starts a new
                  baseline.
                </small>
              </fieldset>
              <button
                className="button primary full"
                onClick={() => onApply(s.filters)}
              >
                <Search size={15} />
                Open search
              </button>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Bookmark size={38} />
          <h2>Keep a good search going</h2>
          <p>Set your filters in Discover, then choose Save this search.</p>
        </div>
      )}
    </>
  );
}
