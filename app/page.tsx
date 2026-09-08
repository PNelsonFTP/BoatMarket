"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Anchor,
  Search,
  Heart,
  Bookmark,
  ChartNoAxesCombined,
  Settings2,
  LayoutGrid,
  List,
  Map,
  SlidersHorizontal,
  ArrowUpRight,
  Compass,
  X,
  Bell,
  Moon,
  Sun,
  GitCompareArrows,
  Share2,
  ChevronRight,
  Ship,
  RefreshCw,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  DEFAULT_FILTERS,
  filtersSchema,
  type BoatResult,
  type Filters,
} from "@/lib/types";
import { isActive, searchListings } from "@/lib/search";
import { FIELD_MAP } from "@/lib/catalog";
import { useBoatStore } from "@/lib/client";
import { money } from "@/lib/utils";
import {
  LAKE_HOLIDAY_FILTERS,
  LAKE_SEARCHES,
  LAKE_RULES_URL,
} from "@/lib/lake-holiday";
import { BoatCard } from "@/components/boat-card";
import { FilterRail } from "@/components/filters";
import { ListingDetail } from "@/components/listing-detail";
import { Compare } from "@/components/compare";
import { Market } from "@/components/market";
import { SavedSearches } from "@/components/saved-searches";
import { Settings } from "@/components/settings";
import { storageKey } from "@/lib/storage";
import { SourceCoverage } from "@/components/source-coverage";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
const BoatMap = dynamic(() => import("@/components/boat-map"), {
  ssr: false,
  loading: () => <div className="empty-state">Loading map…</div>,
});
type Tab =
  "discover" | "shortlist" | "saved" | "market" | "compare" | "settings";
const TABS = [
  { id: "discover", label: "Discover", icon: Compass },
  { id: "shortlist", label: "Shortlist", icon: Heart },
  { id: "saved", label: "Saved searches", icon: Bookmark },
  { id: "market", label: "Market", icon: ChartNoAxesCombined },
] as const;
export default function Page() {
  const store = useBoatStore();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [tab, setTab] = useState<Tab>("discover");
  const [view, setView] = useState<"grid" | "list" | "map">("grid");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<BoatResult | null>(null);
  const [limit, setLimit] = useState(12);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState("");
  const [draw, setDraw] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const appliedHome = useRef(false);
  useEffect(() => {
    if (store.ready && !appliedHome.current) {
      appliedHome.current = true;
      if (
        store.mode !== "sample" &&
        !new URLSearchParams(location.search).has("f")
      )
        setFilters(LAKE_HOLIDAY_FILTERS);
    }
  }, [store.ready, store.mode]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      if (p.has("f")) setFilters(filtersSchema.parse(JSON.parse(p.get("f")!)));
      const hash = location.hash.slice(1);
      if (
        [
          "discover",
          "shortlist",
          "saved",
          "market",
          "compare",
          "settings",
        ].includes(hash)
      )
        setTab(hash as Tab);
      const d =
        localStorage.getItem(storageKey("preferences", "theme")) === "dark";
      setDark(d);
      document.documentElement.dataset.theme = d ? "dark" : "light";
    } catch {
      /* invalid shared filters revert to defaults */
    }
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setTab("discover");
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    setLimit(12);
  }, [filters, tab]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const documentWithContext = document as Document & {
      modelContext?: {
        registerTool: (
          tool: unknown,
          options: { signal: AbortSignal },
        ) => unknown;
      };
    };
    const context = documentWithContext.modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "set_boat_search_filters",
            title: "Set boat search filters",
            description:
              "Validate and apply BoatScout filters to the visible Discover page.",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
                maxPrice: { type: "number", minimum: 0 },
                minHorsepower: { type: "number", minimum: 0 },
              },
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input: unknown) {
              if (!input || typeof input !== "object")
                throw new Error("Expected an object");
              const p = input as {
                query?: string;
                maxPrice?: number;
                minHorsepower?: number;
              };
              if (
                Object.keys(p).some(
                  (k) => !["query", "maxPrice", "minHorsepower"].includes(k),
                )
              )
                throw new Error("Unknown input");
              if (
                (p.maxPrice != null &&
                  (!Number.isFinite(p.maxPrice) || p.maxPrice < 0)) ||
                (p.minHorsepower != null &&
                  (!Number.isFinite(p.minHorsepower) || p.minHorsepower < 0))
              )
                throw new Error("Expected non-negative numeric limits");
              const next = filtersSchema.parse({
                ...filtersRef.current,
                q: p.query ?? filtersRef.current.q,
                criteria: {
                  ...filtersRef.current.criteria,
                  ...(p.maxPrice == null ? {} : { price: { max: p.maxPrice } }),
                  ...(p.minHorsepower == null
                    ? {}
                    : { horsepower: { min: p.minHorsepower } }),
                },
              });
              setFilters(next);
              setTab("discover");
              return { applied: true, query: next.q };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  const filtered = useMemo(
    () => searchListings(store.listings, filters),
    [store.listings, filters],
  );
  const results = useMemo(
    () =>
      tab === "shortlist" || favoriteOnly
        ? filtered.filter((b) =>
            b.sourceLinks.some((l) => store.workspace.favorites.includes(l.id)),
          )
        : filtered,
    [filtered, tab, favoriteOnly, store.workspace.favorites],
  );
  const allBoats = useMemo(
    () => searchListings(store.listings, { ...DEFAULT_FILTERS, criteria: {} }),
    [store.listings],
  );
  const compareBoats = useMemo(
    () =>
      compareIds
        .map((id) =>
          allBoats.find(
            (b) => b.id === id || b.sourceLinks.some((l) => l.id === id),
          ),
        )
        .filter((b): b is BoatResult => !!b),
    [allBoats, compareIds],
  );
  const unread = store.workspace.alerts.filter((a) => !a.read).length;
  const countFilters =
    Object.values(filters.criteria).filter(isActive).length +
    filters.areas.length +
    (filters.ruleSet ? 1 : 0);
  const showSearch = ["discover", "shortlist", "market"].includes(tab);
  function navigate(next: Tab) {
    setTab(next);
    setMobileFilters(false);
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}#${next}`,
    );
  }
  function favorite(id: string) {
    const boat = allBoats.find((b) => b.sourceLinks.some((l) => l.id === id));
    const members = boat?.sourceLinks.map((l) => l.id) || [id];
    const has = members.some((member) =>
      store.workspace.favorites.includes(member),
    );
    store.updateWorkspace((w) => ({
      ...w,
      favorites: has
        ? w.favorites.filter((x) => !members.includes(x))
        : [...w.favorites, id],
    }));
    setToast(has ? "Removed from your shortlist" : "Saved to your shortlist");
  }
  function compare(id: string) {
    id = allBoats.find((b) => b.sourceLinks.some((l) => l.id === id))?.id || id;
    setCompareIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length === 6) {
        setToast("Compare up to six boats at a time");
        return ids;
      }
      return [...ids, id];
    });
  }
  function apply(f: Filters) {
    setFilters(f);
    setFavoriteOnly(false);
    navigate("discover");
  }
  async function share() {
    const u = new URL(location.href);
    u.search = "";
    u.searchParams.set("f", JSON.stringify(filters));
    u.hash = "discover";
    try {
      await navigator.clipboard.writeText(u.href);
      setToast("Search link copied");
    } catch {
      setToast(
        "Could not copy automatically. The search link is now in your address bar.",
      );
      history.replaceState(null, "", u.href);
    }
  }
  function reset() {
    setFilters(DEFAULT_FILTERS);
    setFavoriteOnly(false);
  }
  const titles: Record<Tab, [string, string, string]> = {
    discover: [
      "YOUR NEXT CHAPTER, ON THE WATER",
      "Find your next boat",
      "A wider search. A clearer picture. One place to decide.",
    ],
    shortlist: [
      "THE ONES WORTH REMEMBERING",
      "Your shortlist",
      "Keep the contenders close. Take a closer look when you’re ready.",
    ],
    saved: [
      "LET A GOOD SEARCH KEEP GOING",
      "Saved searches",
      "Your criteria, ready whenever you are.",
    ],
    market: [
      "A LITTLE CONTEXT GOES A LONG WAY",
      "The market, in view",
      "Understand the boats and asking prices in your current search.",
    ],
    compare: [
      "LOOK BEYOND THE FIRST IMPRESSION",
      "Compare your boats",
      "Put the details side by side, up to six boats at a time.",
    ],
    settings: [
      "SET UP YOUR SEARCH WORKSPACE",
      "Make BoatScout yours",
      "Connect your data, define your places, and set your limits.",
    ],
  };
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to results
      </a>
      <header className="topbar">
        <a
          className="brand"
          href="#discover"
          onClick={(e) => {
            e.preventDefault();
            navigate("discover");
          }}
          aria-label="BoatScout home"
        >
          <span className="brand-mark">
            <Anchor size={23} />
          </span>
          boat<span>scout</span>
        </a>
        <nav aria-label="Main navigation">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "nav-active" : ""}
              onClick={() => navigate(t.id)}
              title={t.label}
              aria-label={t.label}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <t.icon size={17} />
              {t.label}
              {t.id === "shortlist" && store.workspace.favorites.length > 0 && (
                <span className="nav-count">
                  {store.workspace.favorites.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="icon-button notification-button"
            aria-label={`Alerts${unread ? `, ${unread} unread` : ""}`}
            onClick={() => setAlertsOpen(true)}
          >
            <Bell size={18} />
            {unread > 0 && <i />}
          </button>
          <button
            className="icon-button theme-button"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => {
              const value = !dark;
              setDark(value);
              document.documentElement.dataset.theme = value ? "dark" : "light";
              localStorage.setItem(
                storageKey("preferences", "theme"),
                value ? "dark" : "light",
              );
            }}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className={`icon-button ${tab === "settings" ? "active" : ""}`}
            aria-label="Settings"
            title="Settings"
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <button className="mode-banner" onClick={() => navigate("settings")}>
        <span className="status-dot" />
        {store.mode === "live"
          ? "Connected workspace"
          : store.mode === "snapshot"
            ? "Snapshot workspace"
            : "Sample workspace"}
        <span>
          {store.mode === "live"
            ? `${store.listings.length} listings · ${store.syncing ? "Saving changes…" : "Your local backend is connected"}${store.listings.some((l) => l.isSample) ? " · includes sample records" : ""}`
            : store.mode === "snapshot"
              ? `${store.listings.length} listings · ${store.updatedAt ? `Updated ${new Date(store.updatedAt).toLocaleDateString()}` : "Imported snapshot"}`
              : "Explore fictional listings. Connect your backend to collect real boats."}
        </span>
        <ArrowUpRight size={14} />
      </button>
      <main id="main" className="workspace">
        {store.mode !== "sample" && tab === "discover" && (
          <section
            className="lake-context"
            aria-label="Lake Holiday search preferences"
          >
            <div>
              <strong>Lake Holiday is home.</strong> Nearby boats first ·
              straight-line miles from approximate city locations.
            </div>
            <div className="lake-presets">
              {LAKE_SEARCHES.map((s) => (
                <button
                  key={s.id}
                  className="chip"
                  onClick={() => setFilters(s.filters)}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <p>
              The Lake Holiday shortlist screens for boats under 21 ft; molded
              platforms count. Broader views include unscreened boats. Published
              rules prohibit wakesurfing and use of wake-enhancing devices.
              Confirm current rules, hull measurement and rated motor capacity
              with the association before buying.{" "}
              <a href={LAKE_RULES_URL} target="_blank" rel="noreferrer">
                2024 rulebook ↗
              </a>
            </p>
            <SourceCoverage listings={store.listings} onSelect={setFilters} />
          </section>
        )}
        <div className="page-heading">
          <div>
            <div className="eyebrow">{titles[tab][0]}</div>
            <h1>
              {titles[tab][1]}
              <span>.</span>
            </h1>
            <p>{titles[tab][2]}</p>
          </div>
          {showSearch && (
            <div className="heading-actions">
              <button
                className="button"
                aria-label="Share current search"
                title="Share current search"
                onClick={share}
              >
                <Share2 size={15} />
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setSearchName("");
                  setSaveOpen(true);
                }}
              >
                <Bookmark size={16} />
                Save this search
              </button>
            </div>
          )}
        </div>
        {store.error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} />
            <span>{store.error}</span>
            <button
              className="text-button"
              onClick={() => {
                void store.refresh().catch((e) => store.setError(e.message));
              }}
            >
              Retry
            </button>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => store.setError("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {showSearch && (
          <>
            <div className="search-bar">
              <Search size={20} />
              <input
                ref={searchRef}
                aria-label="Search boats"
                placeholder="Search make, model, or keyword…"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              />
              {filters.q && (
                <button
                  className="icon-button"
                  aria-label="Clear keyword search"
                  onClick={() => setFilters({ ...filters, q: "" })}
                >
                  <X size={15} />
                </button>
              )}
              <span className="keyboard-hint">⌘ K</span>
            </div>
            <div className="quick-searches">
              <button
                className={
                  !filters.criteria.category?.values?.length ? "active" : ""
                }
                onClick={reset}
              >
                All boats
              </button>
              {[
                {
                  label: "Fishing boats",
                  values: [
                    "Bass",
                    "Deep-V / multi-species",
                    "Walleye",
                    "Aluminum fishing",
                    "Fiberglass fishing",
                  ],
                },
                { label: "Ski & wake", values: ["Ski / wake / surf"] },
                { label: "Pontoons", values: ["Pontoon", "Tritoon"] },
                { label: "Cruisers", values: ["Cruiser"] },
              ].map((p) => (
                <button
                  className={
                    JSON.stringify(filters.criteria.category?.values) ===
                    JSON.stringify(p.values)
                      ? "active"
                      : ""
                  }
                  key={p.label}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      criteria: {
                        ...filters.criteria,
                        category: { values: p.values },
                      },
                    })
                  }
                >
                  {p.label}
                </button>
              ))}
              <button
                className={
                  filters.criteria.priceDrop?.min === 1 ? "active" : ""
                }
                onClick={() => {
                  const criteria = { ...filters.criteria };
                  if (criteria.priceDrop) delete criteria.priceDrop;
                  else criteria.priceDrop = { min: 1, excludeUnknown: true };
                  setFilters({ ...filters, criteria });
                }}
              >
                Price drops <ArrowUpRight size={11} />
              </button>
            </div>
          </>
        )}
        {!store.ready ? (
          <div className="empty-state" role="status">
            <RefreshCw className="spin" size={26} />
            <h2>Opening your workspace…</h2>
          </div>
        ) : showSearch ? (
          <div className="search-layout">
            <aside
              className={`filter-rail ${mobileFilters ? "mobile-open" : ""}`}
              aria-label="Search filters"
            >
              <FilterRail
                sources={[...new Set(store.listings.map((l) => l.source))]}
                filters={filters}
                setFilters={setFilters}
                workspace={store.workspace}
                connection={store.connection}
                onMap={() => {
                  setView("map");
                  setDraw(true);
                  setMobileFilters(false);
                }}
                close={() => setMobileFilters(false)}
              />
            </aside>
            <section className="results-panel" aria-label="Search results">
              <div className="results-toolbar">
                <div aria-live="polite">
                  <strong>{results.length} boats</strong>
                  <span>
                    {tab === "shortlist"
                      ? " in your shortlist"
                      : " worth a closer look"}
                  </span>
                </div>
                <div className="toolbar-controls">
                  <button
                    className="button mobile-only filter-toggle"
                    onClick={() => setMobileFilters(true)}
                  >
                    <SlidersHorizontal size={15} />
                    Filters {countFilters}
                  </button>
                  <select
                    aria-label="Sort boats"
                    value={filters.sort}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        sort: e.target.value as Filters["sort"],
                      })
                    }
                  >
                    <option value="newest">Newest first</option>
                    <option value="price-asc">Price: low to high</option>
                    <option value="price-desc">Price: high to low</option>
                    <option value="distance">Nearest first</option>
                    <option value="hours">Lowest engine hours</option>
                    <option value="year">Newest model year</option>
                    <option value="days">Fewest days on market</option>
                    <option value="price-per-foot">
                      Lowest price per foot
                    </option>
                  </select>
                  {tab !== "market" && (
                    <div
                      className="view-toggle"
                      role="group"
                      aria-label="Results view"
                    >
                      {[
                        { value: "grid", icon: LayoutGrid },
                        { value: "list", icon: List },
                        { value: "map", icon: Map },
                      ].map((v) => (
                        <button
                          key={v.value}
                          className={view === v.value ? "active" : ""}
                          onClick={() => {
                            setView(v.value as typeof view);
                            setDraw(false);
                          }}
                          aria-label={`${v.value[0].toUpperCase() + v.value.slice(1)} view`}
                          aria-pressed={view === v.value}
                        >
                          <v.icon size={16} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {Object.entries(filters.criteria).some(
                ([k, c]) => k !== "status" && isActive(c),
              ) || filters.ruleSet ? (
                <div className="active-filters">
                  {Object.entries(filters.criteria)
                    .filter(([k, c]) => k !== "status" && isActive(c))
                    .map(([k, c]) => (
                      <button
                        key={k}
                        onClick={() => {
                          const criteria = { ...filters.criteria };
                          delete criteria[k];
                          setFilters({ ...filters, criteria });
                        }}
                      >
                        {FIELD_MAP[k]?.label}:{" "}
                        {(c.values && c.values.length > 3
                          ? `${c.values.length} selected`
                          : c.values?.join(", ")) ||
                          c.text ||
                          (c.bool != null
                            ? c.bool
                              ? "Yes"
                              : "No"
                            : [
                                c.min != null
                                  ? `≥ ${c.min.toLocaleString()}`
                                  : "",
                                c.max != null
                                  ? `≤ ${c.max.toLocaleString()}`
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")) ||
                          "Known only"}
                        <X size={12} />
                      </button>
                    ))}
                  {filters.ruleSet && (
                    <button
                      onClick={() =>
                        setFilters({ ...filters, ruleSet: undefined })
                      }
                    >
                      {filters.ruleSet.name}
                      <X size={12} />
                    </button>
                  )}
                </div>
              ) : null}
              {tab === "market" ? (
                <Market boats={results} />
              ) : view === "map" ? (
                <BoatMap
                  key={draw ? "draw" : "map"}
                  boats={results}
                  onOpen={setDetail}
                  drawInitially={draw}
                  onArea={(a) =>
                    setFilters((f) => ({ ...f, areas: [...f.areas, a] }))
                  }
                />
              ) : results.length === 0 ? (
                <div className="empty-state">
                  <Ship size={40} />
                  <h2>
                    {tab === "shortlist"
                      ? "Your next boat could be one save away"
                      : "No boats match this search"}
                  </h2>
                  <p>
                    {tab === "shortlist"
                      ? "Save a boat with the heart button. Check your filters if saved boats are hidden."
                      : store.mode === "live" && !store.listings.length
                        ? "Add a boat or configure your sources in Settings to begin."
                        : "Try widening your area, adjusting a limit, or including unknown specifications."}
                  </p>
                  <button
                    className="button"
                    onClick={
                      store.mode === "live" && !store.listings.length
                        ? () => navigate("settings")
                        : reset
                    }
                  >
                    {store.mode === "live" && !store.listings.length
                      ? "Set up sources"
                      : "Reset filters"}
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className={
                      view === "list" ? "boat-grid list-view" : "boat-grid"
                    }
                  >
                    {results.slice(0, limit).map((boat) => (
                      <BoatCard
                        key={boat.id}
                        boat={boat}
                        favorite={boat.sourceLinks.some((l) =>
                          store.workspace.favorites.includes(l.id),
                        )}
                        compared={boat.sourceLinks.some((l) =>
                          compareIds.includes(l.id),
                        )}
                        onFavorite={() => favorite(boat.id)}
                        onCompare={() => compare(boat.id)}
                        onOpen={() => setDetail(boat)}
                      />
                    ))}
                  </div>
                  <div className="results-footer">
                    <span>
                      Showing {Math.min(limit, results.length)} of{" "}
                      {results.length} boats
                    </span>
                    {limit < results.length && (
                      <button
                        className="button"
                        onClick={() => setLimit(limit + 12)}
                      >
                        Show more boats
                        <ChevronRight size={15} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        ) : tab === "saved" ? (
          <SavedSearches
            workspace={store.workspace}
            listings={store.listings}
            onChange={store.updateWorkspace}
            onApply={apply}
            live={store.mode === "live"}
          />
        ) : tab === "compare" ? (
          <Compare boats={compareBoats} onRemove={compare} onOpen={setDetail} />
        ) : tab === "settings" ? (
          <Settings
            connection={store.connection}
            onConnect={store.connect}
            onDisconnect={store.disconnect}
            onImport={store.importSnapshot}
            onRefresh={store.refresh}
            workspace={store.workspace}
            onChange={store.updateWorkspace}
            mode={store.mode}
            listings={store.listings}
          />
        ) : null}
      </main>
      {compareIds.length > 0 && (
        <div className="compare-tray">
          <span className="compare-tray-icon">
            <GitCompareArrows size={20} />
          </span>
          <div>
            <strong>
              {compareIds.length} boat{compareIds.length === 1 ? "" : "s"} to
              compare
            </strong>
            <small>Up to six, side by side</small>
          </div>
          <button className="text-button" onClick={() => setCompareIds([])}>
            Clear
          </button>
          <button
            className="button primary"
            onClick={() => navigate("compare")}
          >
            Compare boats
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      <ListingDetail
        boat={detail}
        onClose={() => setDetail(null)}
        workspace={store.workspace}
        onFavorite={favorite}
        onNote={(id, text) =>
          store.updateWorkspace((w) => ({
            ...w,
            notes: { ...w.notes, [id]: text },
          }))
        }
        onCompare={compare}
        compared={
          !!detail && detail.sourceLinks.some((l) => compareIds.includes(l.id))
        }
        similar={allBoats.filter(
          (b) => b.id !== detail?.id && b.category === detail?.category,
        )}
        onOpen={setDetail}
      />
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogTitle>Save this search</DialogTitle>
          <DialogDescription>
            Keep your areas, filters, sort order, and lake rules together.
          </DialogDescription>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = filtersSchema.safeParse(filters);
              if (!parsed.success) {
                setToast(
                  "Check your filters: minimums must not exceed maximums.",
                );
                return;
              }
              store.updateWorkspace((w) => ({
                ...w,
                savedSearches: [
                  ...w.savedSearches,
                  {
                    id: crypto.randomUUID(),
                    name: searchName.trim(),
                    filters: parsed.data,
                    cadence: "off",
                    channels: ["in-app"],
                    digest: true,
                  },
                ],
              }));
              setSaveOpen(false);
              setToast("Search saved. Manage its alerts in Saved searches.");
            }}
          >
            <label>
              Search name
              <input
                autoFocus
                required
                maxLength={120}
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="e.g. Summer fishing boat"
              />
            </label>
            <p className="small muted">
              {results.length} matches right now.{" "}
              {store.mode === "live"
                ? "Enable a cadence in Saved searches to receive updates."
                : "Saved in this browser’s sample or snapshot workspace."}
            </p>
            <button
              className="button primary"
              disabled={!searchName.trim()}
              type="submit"
            >
              <Bookmark size={16} />
              Save search
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={alertsOpen} onOpenChange={setAlertsOpen}>
        <DialogContent>
          <DialogTitle>Your alerts</DialogTitle>
          <DialogDescription>
            {store.mode === "live"
              ? "New matches and listing changes from your saved searches."
              : "Connect a backend and enable a saved search cadence to receive alerts."}
          </DialogDescription>
          {store.workspace.alerts.length ? (
            <>
              <button
                className="text-button spaced"
                onClick={() =>
                  store.updateWorkspace((w) => ({
                    ...w,
                    alerts: w.alerts.map((a) => ({ ...a, read: true })),
                  }))
                }
              >
                Mark all as read
              </button>
              {store.workspace.alerts.map((a) => (
                <article
                  className={`alert-item ${a.read ? "" : "unread"}`}
                  key={a.id}
                >
                  <h3>{a.title}</h3>
                  <small>{new Date(a.createdAt).toLocaleString()}</small>
                  <p>{a.body}</p>
                  <div className="button-row">
                    {a.listingIds.slice(0, 6).map((id) => {
                      const boat = allBoats.find((b) => b.id === id);
                      return boat ? (
                        <button
                          className="button"
                          key={id}
                          onClick={() => {
                            setAlertsOpen(false);
                            setDetail(boat);
                            store.updateWorkspace((w) => ({
                              ...w,
                              alerts: w.alerts.map((x) =>
                                x.id === a.id ? { ...x, read: true } : x,
                              ),
                            }));
                          }}
                        >
                          {boat.title}
                        </button>
                      ) : null;
                    })}
                  </div>
                </article>
              ))}
            </>
          ) : (
            <div className="empty-state compact">
              <Bell size={30} />
              <h2>You’re all caught up</h2>
              <p>
                Updates will appear here after your saved searches find new or
                changed boats.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
