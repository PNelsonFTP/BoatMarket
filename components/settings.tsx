"use client";
import { useEffect, useState } from "react";
import {
  Cable,
  Download,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Database,
  Play,
  MapPin,
} from "lucide-react";
import { api, downloadJson, type Connection } from "@/lib/client";
import {
  type Workspace,
  type RuleSet,
  ruleSchema,
  listingSchema,
  type Listing,
} from "@/lib/types";
import { PROPULSIONS, CATEGORIES } from "@/lib/catalog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { asset } from "@/lib/utils";
import { DuplicateReview } from "./duplicate-review";
import { LocationReview } from "./location-review";
import { SourceHealth } from "./source-health";
import { WorkspaceTransfer } from "./workspace-transfer";
import { type ImportChunkResult } from "@/lib/import-listings";
type AdminData = {
  sources: {
    id: string;
    name: string;
    adapter: string;
    enabled: boolean;
    urls: string[];
  }[];
  runs: {
    id: string;
    source: string;
    status: string;
    startedAt: string;
    found: number;
    new: number;
    updated: number;
    removed: number;
    errors: string[];
  }[];
  geocodes: { query: string; createdAt: string }[];
  counts: { listings: number; samples: number };
  failedDeliveries: {
    id: string;
    title: string;
    deliveryError: string;
    attempts: number;
  }[];
};
export function Settings({
  connection,
  onConnect,
  onDisconnect,
  onImport,
  onRefresh,
  workspace,
  onChange,
  mode,
  listings,
}: {
  connection: Connection | null;
  onConnect: (url: string, password: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onImport: (value: unknown) => void;
  onRefresh: () => Promise<void>;
  workspace: Workspace;
  onChange: (f: (w: Workspace) => Workspace) => void | Promise<boolean>;
  mode: string;
  listings: Listing[];
}) {
  const [url, setUrl] = useState(
    connection?.url ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://127.0.0.1:4310",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [config, setConfig] = useState("");
  const [editing, setEditing] = useState(false);
  const [rule, setRule] = useState<RuleSet | null>(null);
  const [manual, setManual] = useState(false);
  const [refName, setRefName] = useState("");
  const [refLat, setRefLat] = useState("");
  const [refLng, setRefLng] = useState("");
  async function load() {
    if (!connection) return;
    const a = await api<AdminData>(connection, "/admin");
    setAdmin(a);
    setConfig(JSON.stringify(a.sources, null, 2));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [connection]);
  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-page">
      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={17} />
          {error}
        </div>
      )}
      {message && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={17} />
          {message}
        </div>
      )}
      <section className="settings-card">
        <div className="section-heading">
          <h2>
            <Cable size={20} />
            Your backend
          </h2>
          <span className={`connection-pill ${connection ? "connected" : ""}`}>
            {connection
              ? "Connected"
              : mode === "snapshot"
                ? "Snapshot mode"
                : "Sample mode"}
          </span>
        </div>
        <p>
          Your local backend stores real listings, keeps your notes, and checks
          sources for updates.
        </p>
        {connection ? (
          <>
            <div className="notice">Connected to {connection.url}</div>
            <div className="button-row">
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await onRefresh();
                    await load();
                  }, "Workspace refreshed")
                }
              >
                <RefreshCw size={15} />
                Refresh data
              </button>
              <button
                className="button"
                onClick={() =>
                  action(
                    onDisconnect,
                    "Disconnected. Your backend data is preserved.",
                  )
                }
              >
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await onConnect(url, password);
                setPassword("");
              }, "Connected to your backend");
            }}
          >
            <div className="form-row">
              <label>
                Backend address
                <input
                  required
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <label>
                Backend password
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="From your .env file"
                />
              </label>
            </div>
            <button className="button primary" disabled={busy} type="submit">
              {busy ? "Connecting…" : "Connect backend"}
            </button>
            <details className="setup-help">
              <summary>First-time setup & GitHub Pages</summary>
              <p>
                In the project terminal, run <code>npm install</code>,{" "}
                <code>npm run setup</code>, then <code>npm run dev</code>. Find
                your generated password under BOATSCOUT_PASSWORD in .env.
              </p>
              <p>
                A GitHub Pages site can connect to a reachable HTTPS backend, or
                load an exported snapshot. Browsers may block a public HTTPS
                page from connecting to localhost. If that happens, use the
                local website at{" "}
                <a href="http://127.0.0.1:3000">127.0.0.1:3000</a>. For a hosted
                backend, add your Pages origin to ALLOWED_ORIGINS and use an
                HTTPS address.
              </p>
              <p>
                Sample and snapshot notes stay in separate browser workspaces
                for this website deployment. Connecting opens the separate
                backend workspace. Earlier shared browser workspaces can be
                reviewed under Your data.
              </p>
            </details>
          </form>
        )}
      </section>
      <div className="settings-columns">
        <section className="settings-card">
          <div className="section-heading">
            <h2>
              <Database size={19} />
              Your data
            </h2>
          </div>
          <p>
            Import canonical listing JSON or keep a portable copy of this
            workspace.
          </p>
          <div className="button-row">
            <button className="button" onClick={() => setManual(true)}>
              <Plus size={15} />
              Add a boat
            </button>
            <button
              className="button"
              onClick={() =>
                downloadJson("boatscout-listings.json", {
                  version: 1,
                  generatedAt: new Date().toISOString(),
                  listings: listings.map(({ rawPayload, ...l }) => l),
                })
              }
            >
              <Download size={15} />
              Export listings
            </button>
            <button
              className="button"
              onClick={() =>
                downloadJson("boatscout-workspace.json", workspace)
              }
            >
              <Download size={15} />
              Export workspace
            </button>
          </div>
          <WorkspaceTransfer
            connection={connection}
            listings={listings}
            workspace={workspace}
            mode={mode}
            onImport={onImport}
            onRefresh={async () => {
              await onRefresh();
              await load();
            }}
            onChange={onChange}
          />
          <p className="small muted">
            Listings export excludes private notes and raw source payloads.
            Workspace export includes your private notes. Imported snapshots are
            held for this session; publish snapshot.json for a persistent Pages
            dataset.
          </p>
          <a
            className="text-button"
            href={asset("/import-example.json")}
            download
          >
            Download a listing import example
          </a>
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <h2>Lake & towing rules</h2>
            <button
              className="button"
              onClick={() =>
                setRule({
                  id: crypto.randomUUID(),
                  name: "",
                  excludeUnknown: false,
                })
              }
            >
              <Plus size={14} />
              Add rule set
            </button>
          </div>
          <p>
            Screening limits help narrow results. Verify current association
            rules and boat measurements before buying.
          </p>
          {workspace.rules.map((r) => (
            <div className="settings-row" key={r.id}>
              <button className="rule-link" onClick={() => setRule(r)}>
                <strong>{r.name}</strong>
                <small>
                  {[
                    r.maxLength
                      ? `${r.maxLengthExclusive ? "<" : "≤"} ${r.maxLength} ft`
                      : null,
                    r.maxHp ? `≤ ${r.maxHp} hp` : null,
                    r.maxLoadedWeight
                      ? `≤ ${r.maxLoadedWeight.toLocaleString()} lb towing`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No limits set"}
                </small>
              </button>
              <button
                className="icon-button"
                aria-label={`Delete rule ${r.name}`}
                onClick={() =>
                  onChange((w) => ({
                    ...w,
                    rules: w.rules.filter((x) => x.id !== r.id),
                  }))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </section>
      </div>
      <section className="settings-card">
        <div className="section-heading">
          <h2>
            <MapPin size={19} />
            Reference places
          </h2>
        </div>
        <p>
          Use these places to calculate distances and sort your search results.
        </p>
        {workspace.referencePoints.map((p) => (
          <div className="settings-row" key={p.name}>
            <strong>{p.name}</strong>
            <span className="small muted">
              {p.lat}, {p.lng}
            </span>
            <button
              className="icon-button"
              aria-label={`Delete reference ${p.name}`}
              onClick={() =>
                onChange((w) => ({
                  ...w,
                  referencePoints: w.referencePoints.filter(
                    (x) => x.name !== p.name,
                  ),
                }))
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <form
          className="form-row reference-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (workspace.referencePoints.some((r) => r.name === refName)) {
              setError("A reference place with that name already exists");
              return;
            }
            onChange((w) => ({
              ...w,
              referencePoints: [
                ...w.referencePoints,
                { name: refName, lat: Number(refLat), lng: Number(refLng) },
              ],
            }));
            setRefName("");
            setRefLat("");
            setRefLng("");
          }}
        >
          <label>
            Name
            <input
              required
              maxLength={100}
              value={refName}
              onChange={(e) => setRefName(e.target.value)}
              placeholder="Home or lake house"
            />
          </label>
          <label>
            Latitude
            <input
              required
              type="number"
              min="-90"
              max="90"
              step="any"
              value={refLat}
              onChange={(e) => setRefLat(e.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              required
              type="number"
              min="-180"
              max="180"
              step="any"
              value={refLng}
              onChange={(e) => setRefLng(e.target.value)}
            />
          </label>
          <button className="button" type="submit">
            <Plus size={15} />
            Add place
          </button>
        </form>
      </section>
      <section className="settings-card">
        <div className="section-heading">
          <h2>Sources & collection</h2>
          {connection && (
            <div className="button-row">
              <button
                className="button"
                disabled={busy}
                onClick={() => action(load, "Source status refreshed")}
              >
                <RefreshCw size={14} />
                Refresh status
              </button>
              <button className="button" onClick={() => setEditing(!editing)}>
                Edit configuration
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await api(connection, "/admin/collect", {});
                    await load();
                  }, "Collection requested. Refresh status to see the results.")
                }
              >
                <Play size={14} />
                Run enabled sources
              </button>
            </div>
          )}
        </div>
        <p>
          Sources start disabled. Add your inventory search URLs, then enable
          collection. Marketplace adapters parse available structured data;
          source restrictions or markup changes may require configuration
          updates.
        </p>
        {!connection ? (
          <div className="notice">
            Connect the backend to configure adapters, view run history, and
            manage the geocode cache.
          </div>
        ) : (
          <>
            {admin && (
              <div className="source-grid">
                {admin.sources.map((s) => {
                  const run = admin.runs.find((r) => r.source === s.name);
                  return (
                    <div className="source-status" key={s.id}>
                      <div>
                        <strong>{s.name}</strong>
                        <span className={`badge ${s.enabled ? "reduced" : ""}`}>
                          {s.enabled
                            ? "Enabled"
                            : s.adapter === "facebook"
                              ? "Import only"
                              : "Disabled"}
                        </span>
                      </div>
                      <small>
                        {run
                          ? `${run.found} found · ${run.new} new · ${run.updated} updated`
                          : "No collection runs yet"}
                      </small>
                      <p className="small muted">
                        {s.urls.length} inventory URL
                        {s.urls.length === 1 ? "" : "s"}
                        {run
                          ? ` · ${new Date(run.startedAt).toLocaleString()}`
                          : ""}
                      </p>
                      {run && run.errors.length > 0 && (
                        <p className="error-text">{run.errors.join("; ")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {editing && (
              <div className="config-editor">
                <label htmlFor="source-config">
                  Source configuration (JSON)
                </label>
                <textarea
                  id="source-config"
                  spellCheck={false}
                  rows={20}
                  value={config}
                  onChange={(e) => setConfig(e.target.value)}
                />
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api(
                          connection,
                          "/admin/sources",
                          JSON.parse(config),
                          "PUT",
                        );
                        await load();
                        setEditing(false);
                      }, "Source configuration saved")
                    }
                  >
                    Save configuration
                  </button>
                  <button className="button" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
                <p className="small muted">
                  Each source accepts URLs and optional CSS selectors: item,
                  title, link, price, image, location. Facebook supports
                  manually exported listing JSON. See README for adapter
                  details.
                </p>
              </div>
            )}
            {admin && (
              <>
                <details className="admin-details">
                  <summary>
                    Recent collection runs ({admin.runs.length})
                  </summary>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Source</th>
                          <th>Started</th>
                          <th>Status</th>
                          <th>Found</th>
                          <th>New</th>
                          <th>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {admin.runs.map((r) => (
                          <tr key={r.id}>
                            <td>{r.source}</td>
                            <td>{new Date(r.startedAt).toLocaleString()}</td>
                            <td>{r.status}</td>
                            <td>{r.found}</td>
                            <td>{r.new}</td>
                            <td>{r.updated}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <details className="admin-details">
                  <summary>Geocode cache ({admin.geocodes.length})</summary>
                  {admin.geocodes.map((g) => (
                    <p key={g.query}>
                      {g.query} · {new Date(g.createdAt).toLocaleDateString()}
                    </p>
                  ))}
                  <button
                    className="button"
                    onClick={() =>
                      action(async () => {
                        await api(
                          connection,
                          "/admin/geocodes",
                          undefined,
                          "DELETE",
                        );
                        await load();
                      }, "Location cache cleared")
                    }
                  >
                    Clear geocode cache
                  </button>
                </details>
                {admin.failedDeliveries.length > 0 && (
                  <details className="admin-details">
                    <summary>
                      Alert delivery errors ({admin.failedDeliveries.length})
                    </summary>
                    {admin.failedDeliveries.map((a) => (
                      <p className="error-text" key={a.id}>
                        {a.title}: {a.deliveryError} ({a.attempts}/5 attempts)
                      </p>
                    ))}
                  </details>
                )}
              </>
            )}
          </>
        )}
      </section>
      <SourceHealth connection={connection} />
      {connection && (
        <DuplicateReview connection={connection} onRefresh={onRefresh} />
      )}
      {connection && (
        <LocationReview connection={connection} onRefresh={onRefresh} />
      )}
      <footer className="settings-footer">
        BoatScout · Personal boat search workspace ·{" "}
        <a href={asset("/photo-credits.txt")} target="_blank" rel="noreferrer">
          Photo credits & licenses
        </a>
      </footer>
      <Dialog
        open={!!rule}
        onOpenChange={(open) => {
          if (!open) setRule(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{rule?.name || "New rule set"}</DialogTitle>
          <DialogDescription>
            Leave a limit blank to allow any value.
          </DialogDescription>
          {rule && (
            <RuleEditor
              key={rule.id}
              rule={rule}
              onSave={(r) => {
                onChange((w) => ({
                  ...w,
                  rules: w.rules.some((x) => x.id === r.id)
                    ? w.rules.map((x) => (x.id === r.id ? r : x))
                    : [...w.rules, r],
                }));
                setRule(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={manual} onOpenChange={setManual}>
        <DialogContent>
          <DialogTitle>Add a boat</DialogTitle>
          <DialogDescription>
            Keep a listing you found elsewhere in your search workspace.
          </DialogDescription>
          <ManualBoat
            onSave={async (l) => {
              if (connection) {
                const result = await api<ImportChunkResult>(
                  connection,
                  "/import",
                  { listings: [l] },
                );
                if (
                  result.failed?.length ||
                  !result.acceptedIds?.includes(l.id)
                )
                  throw new Error(
                    result.failed?.[0]?.error ||
                      "The backend did not confirm this listing was imported. Refresh before retrying.",
                  );
                await onRefresh();
              } else
                onImport({
                  generatedAt: new Date().toISOString(),
                  listings: [...listings, l],
                });
              setManual(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
function RuleEditor({
  rule,
  onSave,
}: {
  rule: RuleSet;
  onSave: (r: RuleSet) => void;
}) {
  const [draft, setDraft] = useState(rule);
  const [error, setError] = useState("");
  return (
    <form
      className="stack-form"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = ruleSchema.safeParse(draft);
        if (parsed.success) onSave(parsed.data);
        else setError(parsed.error.issues.map((i) => i.message).join("; "));
      }}
    >
      <label>
        Name
        <input
          required
          maxLength={120}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <div className="form-row">
        {(["maxLength", "maxHp", "maxLoadedWeight"] as const).map((key, i) => (
          <label key={key}>
            {["Max length (ft)", "Max power (hp)", "Tow limit (lb)"][i]}
            <input
              type="number"
              step="any"
              min="0.1"
              value={draft[key] ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [key]: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>
        ))}
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.maxLengthExclusive || false}
          onChange={(e) =>
            setDraft({ ...draft, maxLengthExclusive: e.target.checked })
          }
        />
        Require length strictly below the limit
      </label>
      <h3>Allowed propulsion (none selected = any)</h3>
      <div className="checkbox-grid">
        {PROPULSIONS.map((p) => (
          <label className="check-label" key={p}>
            <input
              type="checkbox"
              checked={draft.allowedPropulsion?.includes(p) || false}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  allowedPropulsion: e.target.checked
                    ? [...(draft.allowedPropulsion || []), p]
                    : draft.allowedPropulsion?.filter((v) => v !== p),
                })
              }
            />
            {p}
          </label>
        ))}
      </div>
      <label>
        Exclude boat categories
        <select
          multiple
          value={draft.excludedCategories || []}
          onChange={(e) =>
            setDraft({
              ...draft,
              excludedCategories: [...e.target.selectedOptions].map(
                (o) => o.value,
              ),
            })
          }
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.excludeUnknown}
          onChange={(e) =>
            setDraft({ ...draft, excludeUnknown: e.target.checked })
          }
        />
        Exclude boats missing a required specification
      </label>
      {error && <p className="error-text">{error}</p>}
      <button className="button primary" type="submit">
        Save rule set
      </button>
    </form>
  );
}
function ManualBoat({ onSave }: { onSave: (l: Listing) => Promise<void> }) {
  const [draft, setDraft] = useState({
    title: "",
    sourceUrl: "",
    price: "",
    make: "",
    model: "",
    year: "",
    length: "",
    horsepower: "",
    engineHours: "",
    city: "",
    state: "",
    category: "",
    propulsion: "",
    description: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const now = new Date().toISOString();
          const l = listingSchema.parse({
            ...draft,
            id: crypto.randomUUID(),
            source: "Manual",
            sourceListingId: draft.sourceUrl,
            firstSeenAt: now,
            lastSeenAt: now,
            ...Object.fromEntries(
              ["price", "year", "length", "horsepower", "engineHours"].map(
                (k) => [
                  k,
                  draft[k as keyof typeof draft]
                    ? Number(draft[k as keyof typeof draft])
                    : null,
                ],
              ),
            ),
            category: draft.category || null,
            propulsion: draft.propulsion || null,
          });
          await onSave(l);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-row">
        <label>
          Listing title
          <input
            required
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label>
          Original listing URL
          <input
            required
            type="url"
            value={draft.sourceUrl}
            onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
          />
        </label>
      </div>
      <div className="form-row wrap">
        {(
          [
            "make",
            "model",
            "year",
            "price",
            "length",
            "horsepower",
            "engineHours",
            "city",
            "state",
          ] as const
        ).map((k) => (
          <label key={k}>
            {(
              {
                price: "Price ($)",
                length: "Length (ft)",
                horsepower: "Power (hp)",
                engineHours: "Engine hours",
              } as Record<string, string>
            )[k] || k.charAt(0).toUpperCase() + k.slice(1)}
            <input
              type={
                [
                  "year",
                  "price",
                  "length",
                  "horsepower",
                  "engineHours",
                ].includes(k)
                  ? "number"
                  : "text"
              }
              step="any"
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="form-row">
        <label>
          Boat type
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            <option value="">Unknown</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Propulsion
          <select
            value={draft.propulsion}
            onChange={(e) => setDraft({ ...draft, propulsion: e.target.value })}
          >
            <option value="">Unknown</option>
            {PROPULSIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description
        <textarea
          rows={3}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" type="submit" disabled={busy}>
        {busy ? "Adding…" : "Add boat"}
      </button>
    </form>
  );
}
