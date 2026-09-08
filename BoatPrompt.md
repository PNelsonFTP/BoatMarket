# Cursor Opening Prompt — Boat Search Dashboard

Paste everything below the line into Cursor as your first message (Composer / Agent mode).

---

You are building **BoatScout**, a self-hosted web app that aggregates boats-for-sale listings from multiple sources into one searchable, filterable dashboard. Treat this as a production-quality project, not a demo. Ask me clarifying questions only where a wrong assumption would be expensive; otherwise make sensible decisions and document them in `DECISIONS.md`.

## 1. Goal

A single dashboard where I can:

- Search boats for sale across one or more geographic areas at once (e.g., "within 150 miles of Wheaton, IL" plus "within 100 miles of Lake Holiday, IL" plus "all of Wisconsin/Michigan/Indiana").
- Filter on every meaningful attribute a boat listing has (full list in §4).
- Save searches, get alerts on new/changed listings, track price history, favorite and compare boats, and see everything on a map.
- Keep it general-purpose. My personal use case (a fishing boat with a large outboard, or a MasterCraft-class inboard ski/wake boat, used on a small inland lake in Illinois) should be expressible as a **saved search profile**, not baked into the design. Anyone should be able to use this for any boat type.

## 2. Tech stack

- **Frontend/backend:** Next.js 15 (App Router, TypeScript, Server Components, Route Handlers), Tailwind, shadcn/ui.
- **Database:** PostgreSQL via Prisma. Use PostGIS (or a simple lat/lng + haversine fallback) for radius search.
- **Jobs/scheduling:** a worker process (BullMQ + Redis, or a simple cron-driven Node worker if you want fewer moving parts — pick one and justify it).
- **Scraping/ingestion:** Playwright for JS-heavy sites, plain `fetch` + Cheerio where HTML is static. Each source is an isolated **adapter** behind a common interface.
- **Maps:** Leaflet + OpenStreetMap tiles (no API key needed). Geocode with Nominatim (rate-limited, cached) or a pluggable geocoder.
- **Auth:** single-user by default (env-var password), but structure it so multi-user is a small change.
- **Deployment:** Docker Compose (app, worker, Postgres, Redis). Must run on a home server / VM.
- **Testing:** Vitest for units, Playwright for a few e2e smoke tests, fixture HTML files for each scraper adapter so tests don't hit live sites.

## 3. Data sources (adapters)

Build the adapter framework first, then implement sources in this order. Each adapter must: fetch listings for a search area, normalize to the canonical schema in §5, dedupe against existing records, and record a `source_url` and `last_seen_at`.

1. **Boat Trader** (boattrader.com) — largest US marketplace.
2. **YachtWorld** (yachtworld.com) — broker listings, larger boats.
3. **Craigslist** — boats category, by region; multiple regions per search area.
4. **Facebook Marketplace** — note: heavily bot-protected and ToS-restrictive; implement as an *optional* adapter that works from a user-supplied browser session/cookie export, and clearly flag it as such.
5. **Boats.com**, **iboats classifieds**, **eBay Motors (boats)**.
6. **Dealer sites** — a generic "dealer inventory page" adapter driven by a config file (URL + CSS selectors) so I can add local dealers without code changes.
7. **Manufacturer certified pre-owned** pages where they exist (e.g., MasterCraft CPO).

Rules for all adapters:

- Respect `robots.txt` where present, throttle requests, randomize timing, cache raw HTML for 24h, and fail gracefully (one broken adapter must never break a search).
- Store the **raw payload** alongside the normalized record so I can re-parse later when a site changes.
- Log a per-run summary: source, area, listings found, new, updated, removed, errors.

## 4. Filters (all must be supported in the UI and the API)

Every filter should support "any/unknown" so listings missing a field aren't silently excluded unless I check "exclude unknown".

**Location**
- One or more search areas: city/ZIP + radius, state(s), or a drawn map bounding box.
- Distance from a reference point (I'll set defaults like "home" and "lake house").
- Seller location vs. boat location (they differ on broker listings).

**Price**
- Asking price min/max; price-per-foot; price drops (amount and %) over a window; "new listing" recency; "reduced" flag.

**Boat type / category**
- Bass, bay, center console, deep-V / multi-species fishing, walleye, aluminum vs. fiberglass fishing, jon, pontoon, tritoon, bowrider, deck boat, cuddy, runabout, ski/wake/surf (inboard), jet boat, cruiser, sailboat, PWC, other — plus a free-text "type as listed".
- Hull material (aluminum, fiberglass, composite, wood, inflatable).
- Hull shape (V, modified-V, flat, catamaran, tunnel).

**Make / model**
- Make (normalized: "MasterCraft", "Lund", "Ranger", "Tracker", "Alumacraft", "Crestliner", "Nitro", "Skeeter", "Malibu", "Nautique", etc.), model, model year min/max, trim.
- Model-year vs. hull year vs. engine year when the listing distinguishes them.

**Size**
- Length overall (ft/in), beam, draft, dry weight, passenger capacity, max HP rating.

**Engine / propulsion**
- Propulsion type: outboard, inboard, sterndrive (I/O), jet, electric, sail, trolling-only.
- Engine count, total HP, HP per engine, engine make/model, engine year, **engine hours**, fuel type (gas, diesel, electric), 2-stroke vs 4-stroke, shaft length, hydraulic steering, kicker/trolling motor present (make, thrust, spot-lock/GPS anchor).
- Fuel capacity.

**Condition & history**
- New / used / certified pre-owned; condition rating as listed; freshwater-only vs. saltwater history; title status; accident/repair disclosed; warranty remaining.

**Seller**
- Private party vs. dealer vs. broker; seller name; seller rating if the source has one; days on market; number of listings from the same seller (flag flippers).

**Included equipment** (multi-select, each tri-state include/exclude/any)
- Trailer (and trailer type/brand/brakes), fish finder / sonar (brand/model), GPS/chartplotter, live well count, rod storage, casting decks, bimini/tower, wakeboard tower, ballast system, surf system, stereo, cover, bow/stern thruster, shore power, head, galley, sleeping berths, batteries/charger, downriggers, anchor system.

**Lake/usage constraints** (user-defined rule sets)
- Let me define named rule sets (e.g., "Lake Holiday rules": max length, max HP, allowed propulsion types, no PWC, etc.) and apply them as a filter. Ship with an empty/generic rule set and let me fill in the numbers — do not hardcode any lake's rules.
- Towing constraint: trailer-loaded weight ≤ a tow-vehicle limit I set.

**Meta**
- Source(s), listing age, has photos (min count), has video, has price, listing text contains / doesn't contain keywords, listing status (active, sold, removed, stale).

## 5. Canonical listing schema

Design a `Listing` model with the fields implied by §4, plus: `id`, `source`, `source_listing_id`, `source_url`, `title`, `description`, `photos[]`, `lat/lng`, `first_seen_at`, `last_seen_at`, `removed_at`, `raw_payload`. Separate tables for `PriceHistory`, `Seller`, `Engine` (one-to-many), `SearchArea`, `SavedSearch`, `Alert`, `Favorite`, `Note`, `RuleSet`, `IngestRun`. Add a `normalization_confidence` score per field where parsing was heuristic.

Deduplication: same boat often appears on multiple sites. Match on (make, model, year, length, HP) ± fuzzy title similarity ± photo perceptual hash; link duplicates under a `BoatGroup` and show the lowest price / all sources in the UI.

## 6. Dashboard UI

- **Search page:** left filter rail (collapsible groups, chips for active filters, "save this search"), results as list/grid/map toggle, sort by price, price-per-foot, newest, distance, engine hours, model year, days on market.
- **Listing detail:** photo gallery, spec sheet, all source links, price history chart, distance to each of my reference points, seller info, my notes, "similar boats", "flag as bad data".
- **Compare view:** side-by-side of up to 6 boats with differences highlighted.
- **Map view:** clustered pins, filter-aware, click-through.
- **Saved searches & alerts:** per-search cadence, email + optional push/webhook (Pushover, ntfy, or generic webhook), digest mode.
- **Market overview page:** for the current filter set — price distribution, median price by year, listings over time, avg days on market, price-per-foot by make. Use Recharts.
- **Admin page:** adapter health, last run stats, manual re-run, dealer-config editor, rule-set editor, geocode cache.
- Dark mode, mobile-friendly, keyboard-navigable results, no external tracking.

## 7. Non-functional requirements

- Secrets only in `.env`; provide `.env.example`.
- Input validation on every route handler (zod). Parameterized queries only (Prisma handles this; don't bypass it).
- Rate limiting on the public routes even though it's single-user.
- Structured logging (pino). Errors to console + a `logs/` file in dev.
- Reasonable accessibility (labels, focus states, contrast).
- Write a `README.md` with setup, how to add a source adapter, how to add a rule set, and known limitations of each scraper.

## 8. Delivery plan

Work in phases and stop for my review at the end of each:

1. **Scaffold:** repo structure, Docker Compose, Prisma schema, migrations, seed script with ~50 realistic fake listings so the UI is testable without scrapers.
2. **Search UI + API:** all filters in §4 working against seed data; map; saved searches.
3. **Adapter framework + first two adapters** (Boat Trader, Craigslist) with fixture-based tests.
4. **Dedup, price history, alerts, market overview.**
5. **Remaining adapters, dealer-config adapter, admin page, polish.**

Start with Phase 1. Before writing code, give me a short summary of the folder structure and the Prisma schema you intend to create, then proceed.
