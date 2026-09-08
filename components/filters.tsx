"use client";
import { useState } from "react";
import {
  ChevronDown,
  MapPin,
  Plus,
  SlidersHorizontal,
  X,
  Anchor,
} from "lucide-react";
import { FIELDS, type Field, GROUPS } from "@/lib/catalog";
import {
  DEFAULT_FILTERS,
  type Filters,
  type Criterion,
  type Workspace,
  type SearchArea,
  areaSchema,
} from "@/lib/types";
import { isActive } from "@/lib/search";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { api, type Connection } from "@/lib/client";
export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: Criterion;
  onChange: (c: Criterion) => void;
}) {
  return (
    <div className="field-control">
      <label className="field-label" htmlFor={`filter-${field.key}`}>
        {field.label}
        {field.unit && <span>{field.unit}</span>}
      </label>
      {field.kind === "number" ? (
        <div className="range-inputs">
          <input
            id={`filter-${field.key}`}
            type="number"
            aria-label={`Minimum ${field.label}`}
            placeholder="Min"
            value={value.min ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                min: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
          <span>–</span>
          <input
            type="number"
            aria-label={`Maximum ${field.label}`}
            placeholder="Max"
            value={value.max ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                max: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </div>
      ) : field.kind === "select" ? (
        <>
          <select
            id={`filter-${field.key}`}
            multiple={false}
            value=""
            onChange={(e) =>
              onChange({
                ...value,
                values: e.target.value
                  ? [...new Set([...(value.values || []), e.target.value])]
                  : [],
              })
            }
          >
            <option value="">
              {value.values?.length
                ? "Add another…"
                : "Any — select one or more"}
            </option>
            {field.options?.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <div className="filter-value-chips">
            {value.values?.map((v) => (
              <button
                key={v}
                type="button"
                aria-label={`Remove ${v} filter`}
                onClick={() =>
                  onChange({
                    ...value,
                    values: value.values?.filter((x) => x !== v),
                  })
                }
              >
                {v}
                <X size={10} />
              </button>
            ))}
          </div>
        </>
      ) : field.kind === "boolean" ? (
        <select
          id={`filter-${field.key}`}
          value={value.bool == null ? "any" : String(value.bool)}
          onChange={(e) =>
            onChange({
              ...value,
              bool:
                e.target.value === "any"
                  ? undefined
                  : e.target.value === "true",
            })
          }
        >
          <option value="any">Any / unknown</option>
          <option value="true">Include / yes</option>
          <option value="false">Exclude / no</option>
        </select>
      ) : (
        <input
          id={`filter-${field.key}`}
          placeholder="Any"
          value={value.text ?? ""}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
      )}
      {field.kind === "text" && !!value.values?.length && (
        <div className="filter-value-chips">
          {value.values.map((v) => (
            <button
              key={v}
              type="button"
              aria-label={`Remove ${v} filter`}
              onClick={() =>
                onChange({
                  ...value,
                  values: value.values?.filter((x) => x !== v),
                })
              }
            >
              {v}
              <X size={10} />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...value, values: [] })}
          >
            Any {field.label.toLowerCase()}
          </button>
        </div>
      )}
      <label className="unknown-check">
        <input
          type="checkbox"
          checked={!!value.excludeUnknown}
          onChange={(e) =>
            onChange({ ...value, excludeUnknown: e.target.checked })
          }
        />
        Exclude unknown
      </label>
      {value.min != null && value.max != null && value.min > value.max && (
        <small className="error-text">Minimum exceeds maximum</small>
      )}
    </div>
  );
}
export function FilterRail({
  filters,
  setFilters,
  workspace,
  connection,
  onMap,
  close,
  sources = [],
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  workspace: Workspace;
  connection: Connection | null;
  onMap: () => void;
  close?: () => void;
  sources?: string[];
}) {
  const [areaOpen, setAreaOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  function criterion(key: string, c: Criterion) {
    const criteria = { ...filters.criteria };
    if (isActive(c)) criteria[key] = c;
    else delete criteria[key];
    setFilters({ ...filters, criteria });
  }
  return (
    <>
      <div className="filter-heading">
        <SlidersHorizontal size={16} />
        <strong>Refine your search</strong>
        <button
          className="text-button"
          onClick={() => setFilters({ ...DEFAULT_FILTERS, q: filters.q })}
        >
          Reset
        </button>
        {close && (
          <button
            className="icon-button mobile-only"
            aria-label="Close filters"
            onClick={close}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className="filter-section">
        <h3>Search areas</h3>
        {filters.areas.length === 0 ? (
          <p className="small muted">Anywhere in the United States</p>
        ) : (
          filters.areas.map((a) => (
            <div className="area-chip" key={a.id}>
              <MapPin size={12} />
              <span>
                {a.name}
                {a.kind === "radius" ? ` · ${a.radius} mi` : ""}
              </span>
              <button
                aria-label={`Remove ${a.name}`}
                onClick={() =>
                  setFilters({
                    ...filters,
                    areas: filters.areas.filter((x) => x.id !== a.id),
                  })
                }
              >
                <X size={12} />
              </button>
            </div>
          ))
        )}
        <button
          className="button full subtle"
          onClick={() => setAreaOpen(true)}
        >
          <Plus size={14} />
          Add a search area
        </button>
        <label className="field-label spaced" htmlFor="location-target">
          Search by location of
        </label>
        <select
          id="location-target"
          value={filters.locationTarget}
          onChange={(e) =>
            setFilters({
              ...filters,
              locationTarget: e.target.value as "boat" | "seller",
            })
          }
        >
          <option value="boat">Boat</option>
          <option value="seller">Seller</option>
        </select>
        <label className="unknown-check">
          <input
            type="checkbox"
            checked={filters.excludeUnknownLocation}
            onChange={(e) =>
              setFilters({
                ...filters,
                excludeUnknownLocation: e.target.checked,
              })
            }
          />
          Exclude unknown locations
        </label>
        <label className="field-label spaced" htmlFor="reference">
          Distance from
        </label>
        <select
          id="reference"
          value={filters.reference?.name || ""}
          onChange={(e) =>
            setFilters({
              ...filters,
              reference: workspace.referencePoints.find(
                (r) => r.name === e.target.value,
              ),
            })
          }
        >
          <option value="">No reference point</option>
          {workspace.referencePoints.map((r) => (
            <option key={r.name}>{r.name}</option>
          ))}
        </select>
      </div>
      <div className="filter-section">
        <h3>Lake & towing rules</h3>
        <select
          aria-label="Apply rule set"
          value={filters.ruleSet?.id || ""}
          onChange={(e) =>
            setFilters({
              ...filters,
              ruleSet: workspace.rules.find((r) => r.id === e.target.value),
            })
          }
        >
          <option value="">No rule set</option>
          {workspace.rules.map((r) => (
            <option value={r.id} key={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-section">
        <label className="check-label">
          <input
            type="checkbox"
            checked={filters.excludeUnknown}
            onChange={(e) =>
              setFilters({ ...filters, excludeUnknown: e.target.checked })
            }
          />
          Exclude unknowns in active filters
        </label>
        <input
          className="full"
          aria-label="Find a filter"
          placeholder="Find a filter…"
          value={fieldSearch}
          onChange={(e) => setFieldSearch(e.target.value)}
        />
      </div>
      {GROUPS.map((group) => {
        const fields = FIELDS.filter(
          (f) =>
            f.group === group &&
            (!fieldSearch ||
              `${f.label} ${group}`
                .toLowerCase()
                .includes(fieldSearch.toLowerCase())),
        );
        if (!fields.length) return null;
        const count = fields.filter((f) =>
          isActive(filters.criteria[f.key] || {}),
        ).length;
        return (
          <details
            className="filter-group"
            key={group + (fieldSearch ? "search" : "")}
            open={fieldSearch ? true : undefined}
          >
            <summary>
              {group}
              {count > 0 && <span className="count-pill">{count}</span>}
              <ChevronDown size={14} />
            </summary>
            <div>
              {fields.map((f) => (
                <FieldInput
                  key={f.key}
                  field={
                    f.key === "source"
                      ? {
                          ...f,
                          options: [
                            ...new Set([...(f.options || []), ...sources]),
                          ],
                        }
                      : f
                  }
                  value={filters.criteria[f.key] || {}}
                  onChange={(c) => criterion(f.key, c)}
                />
              ))}
              {group === "Price & timing" && (
                <label className="field-control">
                  Price drop window
                  <select
                    value={filters.dropWindowDays}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        dropWindowDays: Number(e.target.value),
                      })
                    }
                  >
                    {[7, 30, 90, 365].map((v) => (
                      <option key={v} value={v}>
                        {v} days
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </details>
        );
      })}
      <div className="rail-note">
        <Anchor size={22} />
        <strong>Make room for the unknown.</strong>
        <p>
          Missing specs stay in your results unless you choose to exclude them.
        </p>
      </div>
      <Dialog open={areaOpen} onOpenChange={setAreaOpen}>
        <DialogContent>
          <DialogTitle>Add a search area</DialogTitle>
          <DialogDescription>
            Areas are combined: a boat can match any one of them.
          </DialogDescription>
          <AreaForm
            connection={connection}
            onMap={() => {
              onMap();
              setAreaOpen(false);
            }}
            onAdd={(a) => {
              setFilters({ ...filters, areas: [...filters.areas, a] });
              setAreaOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
const PRESETS = [
  { name: "Wheaton, IL", lat: 41.8661, lng: -88.107 },
  { name: "Lake Holiday, IL", lat: 41.6153, lng: -88.6727 },
  { name: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
  { name: "Madison, WI", lat: 43.0731, lng: -89.4012 },
  { name: "Grand Rapids, MI", lat: 42.9634, lng: -85.6681 },
];
function AreaForm({
  connection,
  onAdd,
  onMap,
}: {
  connection: Connection | null;
  onAdd: (a: SearchArea) => void;
  onMap: () => void;
}) {
  const [kind, setKind] = useState("radius");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("Wheaton, IL");
  const [lat, setLat] = useState("41.8661");
  const [lng, setLng] = useState("-88.107");
  const [radius, setRadius] = useState("150");
  const [states, setStates] = useState("WI, MI, IN");
  const [results, setResults] = useState<typeof PRESETS>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const area = areaSchema.parse({
            id: crypto.randomUUID(),
            name: kind === "states" ? states.toUpperCase() : name,
            kind,
            ...(kind === "radius"
              ? { lat: Number(lat), lng: Number(lng), radius: Number(radius) }
              : {
                  states: states
                    .toUpperCase()
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
          });
          onAdd(area);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Check your search area");
        }
      }}
    >
      <div className="segmented">
        <button
          type="button"
          className={kind === "radius" ? "active" : ""}
          onClick={() => setKind("radius")}
        >
          City + radius
        </button>
        <button
          type="button"
          className={kind === "states" ? "active" : ""}
          onClick={() => setKind("states")}
        >
          States
        </button>
        <button type="button" onClick={onMap}>
          Draw on map
        </button>
      </div>
      {kind === "radius" ? (
        <>
          <label>
            Quick location
            <select
              value={PRESETS.some((p) => p.name === name) ? name : ""}
              onChange={(e) => {
                const p = PRESETS.find((p) => p.name === e.target.value);
                if (p) {
                  setName(p.name);
                  setLat(String(p.lat));
                  setLng(String(p.lng));
                }
              }}
            >
              <option value="">Custom location</option>
              {PRESETS.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            Find a city or ZIP
            <div className="inline-input">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="City, state or ZIP"
              />
              <button
                type="button"
                className="button"
                disabled={!connection || busy || query.length < 2}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const data = await api<{ results: typeof PRESETS }>(
                      connection!,
                      "/geocode?q=" + encodeURIComponent(query),
                    );
                    setResults(data.results);
                    setError(data.results.length ? "" : "No locations found");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Finding…" : "Find"}
              </button>
            </div>
          </label>
          {!connection && (
            <p className="small muted">
              Connect your backend for place lookup, or enter coordinates below.
            </p>
          )}
          {results.map((r) => (
            <button
              type="button"
              className="location-result"
              key={r.name}
              onClick={() => {
                setName(r.name.slice(0, 120));
                setLat(String(r.lat));
                setLng(String(r.lng));
                setResults([]);
              }}
            >
              {r.name}
            </button>
          ))}
          <label>
            Area name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Latitude
              <input
                required
                type="number"
                step="any"
                min="-90"
                max="90"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label>
              Longitude
              <input
                required
                type="number"
                step="any"
                min="-180"
                max="180"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </label>
            <label>
              Radius (miles)
              <input
                required
                type="number"
                min="1"
                max="12500"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </label>
          </div>
        </>
      ) : (
        <label>
          State abbreviations, separated by commas
          <input
            required
            value={states}
            onChange={(e) => setStates(e.target.value)}
            placeholder="WI, MI, IN"
          />
        </label>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" type="submit">
        Add area
      </button>
    </form>
  );
}
