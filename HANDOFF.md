# BoatScout handoff

This is the engineering and operator handoff for the boat project. Start with [README.md](README.md) for installation and [OPERATIONS.md](OPERATIONS.md) for refresh, scheduling, backup and recovery procedures. [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md) records unfinished work and collection struggles. Dependency inventory and its limits are in [SBOM.md](SBOM.md).

The delivered inventory snapshot was generated **September 7, 2026 at 9:20:19 PM America/Chicago** (`2026-09-08T02:20:19.866Z`). Counts below were checked against that file and the current shared search implementation while preparing this handoff. They are a dated baseline, not a claim that the listings remain available or that collection ran again during documentation.

## Purpose and delivered scope

[BoatPrompt.md](BoatPrompt.md) is the original product brief: aggregate boat advertisements, expose comprehensive filters, compare boats, preserve private notes and favorites, track observed prices, and alert on saved-search changes. The subsequent user requests selected **Lake Holiday, Illinois** as the home location, preferred nearby premium fishing boats with larger motors, and added interest in MasterCraft and comparable ski boats that could fit the lake's requirements.

The application remains general-purpose. The Lake Holiday preferences are editable profiles layered over a shared filter catalog. The current website includes six quick searches, source-coverage explanations, list/grid/map views, listing details and galleries, comparison of up to six boats, market charts, saved searches, alerts, private workspace state, and collection/settings controls.

Important implementation choices that differ from the original brief:

- **Next.js exports a static frontend; Fastify runs the API separately.** GitHub Pages cannot execute a database, Node API, Next.js route handlers or a worker. The local backend can also serve the exported website from one address.
- **Prisma uses SQLite.** PostgreSQL/PostGIS and Redis/BullMQ were replaced with a local database, shared in-memory filtering and a periodic Node worker. A PostgreSQL switch would require an actual schema/migration/deployment change.
- **The project was completed beyond the original staged scaffold.** It includes the full application, local execution paths, deployment preparation, tests, live source integrations and two inventory research passes.
- **Facebook Marketplace accepts manual canonical JSON imports.** No cookie/session harvesting or login automation was implemented. Generic marketplace adapters are not evidence of working live integrations.
- **Cross-post grouping is conservative.** Perceptual image hashing, fuzzy-title-only grouping and a manual merge/split workflow were not delivered.
- **A sourced Lake Holiday screen is included following the user's later request.** It is preliminary and editable; it is not association registration approval.

The detailed rationale is in [DECISIONS.md](DECISIONS.md). [MuscleCarPrompt.md](MuscleCarPrompt.md) is a separate, portable brief for a future car project. No muscle-car application, collection source, schedule or dataset was integrated into BoatScout.

## Inventory baseline and how to interpret it

The first live pass collected 257 advertisements from three sources. The expanded pass delivered **1,538 advertisements from ten enabled sources**, of which **1,522 were active** and **16 were marked sold**. The published file contains **zero sample records and zero raw payloads**. There were **1,108 active ads with a usable location within 150 straight-line miles** of Lake Holiday. An ad is not necessarily a distinct vessel.

| Source | Ads in delivered snapshot |
|---|---:|
| Craigslist — 17 regional boards | 859 |
| OnlyInboards — IL, WI, IN, IA, MI | 386 |
| Ted's Boatarama | 62 |
| Bass Boat Central — selected five-state ads | 60 |
| Fox Lake Harbor | 44 |
| Gordy's Marine | 31 |
| Starved Rock Marina | 30 |
| Lake County Watersports | 27 |
| Miller's Sport Center | 22 |
| Bedford Sales & Outdoors | 17 |
| **Total** | **1,538** |

| Quick search | Matches in delivered snapshot |
|---|---:|
| Lake Holiday · nearby picks | 51 |
| Fishing · 200+ hp · nearby | 15 |
| MasterCraft & peers · under 21 ft | 29 |
| Wider search · within 250 mi | 67 |
| Include unknown lengths · verify first | 69 |
| All nearby ads · no lake screen | 1,108 |

These result counts use `searchListings` and its grouping rules. The searches overlap and must not be added together. Unknown-length review adds potential candidates; it does not establish eligibility. The main shortlist excludes reported lengths below 18 ft as well as lengths at or above 21 ft. Its 200-hp threshold allows unknown power; the dedicated fishing profile requires reported 200+ hp. Dedicated fishing and ski profiles have their own criteria and do not simply subdivide the main shortlist. No default price ceiling is imposed.

The larger inventory includes boats outside the user's preferred categories, boats that fail the length screen, unpriced boats, ads outside the nearby radius, and potentially repeated cross-posts. Source-reported active status is not a seller-confirmed availability check. First seen means first observed by BoatScout, not the seller's original publication date. Charts describe observed asking prices and tracked inventory, not sold prices or valuations.

See [LIVE_DATA.md](LIVE_DATA.md) for source-level proximity counts and examples, and [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) for exact collection scope, URLs, unsuccessful source prospects and limits. Do not infer nationwide collection from the presence of nationwide sites in the adapter catalog.

## Architecture and data flow

```text
Configured inventory URLs (config/sources.json)
    → collector: source isolation, lease, cache, robots and network checks
    → source adapter: summary parsing, supported pagination, selected details
    → normalization and existing city-cache enrichment
    → repository: stable source IDs, conservative grouping, price observations
    → Prisma / SQLite
        → authenticated Fastify API → connected browser workspace
        → alert evaluation / durable delivery records → configured destinations
        → explicit snapshot export → public/snapshot.json → Next static build
                                                    → out/ → GitHub Pages

Explicit city lookup → config/locations.json → enrichment of collected records
```

| Area | Primary files | Responsibility |
|---|---|---|
| Website | `app/page.tsx`, `app/globals.css`, `components/` | Search interface, coverage, map, comparison, details, charts and settings |
| Shared contract | `lib/types.ts`, `lib/catalog.ts`, `lib/search.ts` | Zod schemas, field catalog, filtering, sorting and result grouping |
| Client state | `lib/client.ts` | Data modes, API connection, browser persistence and serialized workspace saves |
| Lake profiles | `lib/lake-holiday.ts` | Home/reference point, sourced rule, six quick searches |
| API | `server/index.ts`, `server/app.ts` | Listener, session authentication, validation, rate limits, routes and optional static serving |
| Persistence | `prisma/schema.prisma`, `prisma/migrations/`, `server/repository.ts` | Relational storage, stable identity, observation history and workspace revisions |
| Collection | `server/collector.ts`, `server/network.ts` | Source configuration, per-page collection, network restrictions, cache and job lease |
| Extraction | `server/adapters/` | Shared structured data/selectors plus source-specific parsing and pagination |
| Geography | `server/locations.ts`, `scripts/geocode-collected.ts`, `config/locations.json` | Explicit bulk city lookup and approximate city-center enrichment |
| Background work | `server/worker.ts`, `server/alerts.ts` | Periodic/one-shot collection, saved-search baselines, alerts and delivery retries |
| Publication | `scripts/export-snapshot.ts`, `next.config.ts`, `scripts/postbuild.mjs`, `.github/workflows/pages.yml` | Public data export, static assets, repository base path and Pages deployment |
| Setup and launch | `scripts/setup.mjs`, `Start-BoatScout.command`, `Start-BoatScout.bat`, `.vscode/tasks.json`, `compose.yaml` | Local installation, terminal launchers and container deployment |

Frequently searched properties are indexed database columns. Canonical listing JSON stores the remaining validated specifications; engines, sellers and prices also have relational models. Personal state uses `User`, `SavedSearch`, `Favorite`, `Note`, `RuleSet` and `Alert`. Supporting models include `BoatGroup`, `IngestRun`, `GeocodeCache`, `JobLock` and `SearchArea`. Search areas used by saved searches currently live within their filter JSON; the separate `SearchArea` model is not the driver of marketplace URL generation.

The frontend and API share the same filter engine. Search areas are ORed; other active criteria are ANDed. Unknown-value behavior is explicit per field, globally, and in lake rules. The API currently loads the dataset and filters in memory rather than running a paginated search query in SQLite. This is a personal-scale architecture.

### API surface and session behavior

`GET /api/health` and `POST /api/login` are public. Other `/api/` routes require the bearer token issued by login. The backend uses an environment password, origin restrictions and rate limits; login has a stricter rate limit. Sessions live in API-process memory for up to 12 hours, and an API restart invalidates them. The browser keeps the token in session storage and the API URL in local storage; it does not persist the password.

The Fastify request-body limit is **12 MiB**. The general request limit is **120 per minute**, and login allows **five attempts per minute**. Schemas for listings, filters, geographic areas, rules and saved searches live in `lib/types.ts`; the workspace request schema is in `server/app.ts`, and source configuration is validated in `server/adapters/types.ts`. The API import accepts 1–1,000 listings per request; browser snapshot import allows up to 10,000 unique listing IDs. Workspace limits include 5,000 favorites, 200 saved searches, 100 rules and 30 reference points. These are enforced bounds, not scalability guarantees. Use the schemas as the authoritative contract when adding fields or tooling.

| Routes | Purpose |
|---|---|
| `GET /api/listings`, `GET /api/listings/:id`, `POST /api/search` | Read real inventory and run shared filters |
| `GET /api/workspace`, `PUT /api/workspace` | Read/write private state with optimistic revision checks |
| `POST /api/import`, `POST /api/listings/:id/flag` | Import validated records or append a private data flag |
| `GET /api/admin`, `PUT /api/admin/sources`, `POST /api/admin/collect` | Read run/configuration status, edit sources and request collection |
| `GET /api/geocode`, `DELETE /api/admin/geocodes` | Explicit place lookup and API geocode-cache maintenance |
| `POST /api/logout` | Revoke the current token |

The collection endpoint returns HTTP 202 when work is requested, before it finishes. Inspect run history afterward. `/api/health` proves the listener responds and reports whether a password is configured; it does **not** verify database connectivity, source health, freshness or worker operation. Every authenticated session represents the same local user. The schema's user IDs are not a complete multi-user permission model.

### Adapter contract

`server/adapters/types.ts` defines an adapter as an `id` plus the synchronous method `parse(html: string, url: string, config: SourceConfig): Listing[]`. The collector owns fetching, cache, jobs and persistence; parsers transform supplied content into canonical listings. `server/adapters/index.ts` registers adapters and dispatches dedicated source parsing before shared structured-data or selector fallbacks. `normalizeListing` in `server/adapters/normalize.ts` handles common conversion/provenance; `server/adapters/pagination.ts` discovers supported page links.

Configuration allows up to 50 sources with up to 30 initial URLs each. Defaults are collection disabled, rendering disabled, automatic pagination disabled, 40 maximum inventory pages and 80 maximum detail pages. Explicit caps can reach 100 inventory and 150 detail pages per source. `followDetails`, `detailMaxLength`, `detailMakes` and custom `selectors` are independent options. The descriptive `area` field is run metadata, not a remote-query compiler. Keep source names/IDs and source-listing IDs stable when editing integrations; persistence keys include source identity.

To extend a source, first establish a supported public URL or import path, then add parsing and pagination only where needed, preserve original ad identity/source URLs, validate canonical values, and add representative fixtures/regression tests. Unknown measurements remain null. Do not evaluate page-supplied JavaScript to read embedded data. Inspect a small run before enabling a broader inventory, and retain failure visibility when markup or access changes.

## Collection mechanics and lessons to preserve

- Sources are configured separately from dashboard searches. Editing a radius, make or saved search does not rewrite external search URLs or trigger broader collection.
- Current integrations use public HTML, structured metadata and page-embedded inventory data. Supported sources follow discovered same-origin pagination with explicit inventory-page caps. Detail enrichment is separately limited by configured makes, maximum length and detail-page count.
- Repeated source IDs are processed once per source run. This prevents alternate links to one inventory page from inflating counts or replacing an enriched record with its summary card. It does not solve cross-listing between different ad IDs.
- The 24-hour HTML cache is checked before new network requests. Fresh requests verify robots rules, throttle with jitter and use the restricted public-network client. Access challenges, robots failures and failed requests are recorded; there is no access-control bypass.
- Cache reuse preserves the page's observation timestamp. A new export timestamp or a successful cached collection run does not mean the source page was fetched again.
- Raw HTML is held locally in `data/cache/`; database payloads retain normalized evidence and cache references. The per-URL cache is overwritten when refetched, so it is **not an immutable archive of every historical page**. Price observations and first-seen dates are preserved separately.
- A bad/empty/challenged page does not imply all its boats were sold. Other sources continue. Active real records unobserved for 14 days become stale; a prolonged source failure can therefore make records stale without proving removal. Explicit sold/removed status remains recorded.
- Advertised specifications can be incomplete or rounded. Parsers distinguish installed horsepower from engine displacement, capacity ratings and trolling-motor ratings; accessory dimensions must not become hull length. Source claims still require verification when buying.
- Original-source photo URLs are used for real advertisements. They can expire or fail independently of the app. The locally licensed illustrative photos belong only to fictional samples; see [PHOTO_CREDITS.md](PHOTO_CREDITS.md).

Automatic duplicate candidate lookup currently considers up to 100 other-source records with the same stored make, model and year. Grouping then requires a matching HIN, or matching core specifications and seller plus a shared original photo URL. Rehosted/cropped photos, missing HINs, different parsing and different seller names all reduce matching. Same-source regional reposts are outside this grouping path. The UI's vessel count may therefore still contain duplicates; do not delete ads or merge on a similar title alone.

## Geographic and lake assumptions

The Lake Holiday reference is **41.6180404, -88.6682705**. Default nearby and wider radii are **150 and 250 great-circle miles**, not hours of driving. No route-time service is implemented. Crossing Lake Michigan is an obvious case where geographic proximity understates the drive.

Locations come from advertised coordinates or a city/dealer location. The delivered batch city cache contains 115 resolved locations, while 19 active ads in the dated snapshot have no usable location and are excluded from nearby searches. Dealer coordinates do not establish where an explicitly off-site vessel is stored. Ambiguous names and postal-code mismatches need review; one ambiguous Allendale, Michigan result was manually corrected to the Ottawa County locality. The general geocoder still needs better disambiguation.

There are two different caches: interactive API lookups use SQLite `GeocodeCache`, while bulk listing enrichment uses `config/locations.json`. Clearing geocodes in Settings clears the former only. The worker reads the city file but does not perform bulk lookups. `npm run geocode:listings` is an explicit, rate-limited operation for previously unknown cities; inspect its results before relying on new distances.

The included screen uses the association-authored [public 2024 rulebook](https://swansonrealestate.net/wp-content/uploads/2025/06/Rules-Regs-2024-Lake-Holiday.pdf): non-pontoons must be strictly below 21 ft, with molded platforms counted; pontoons have a separate 28-ft rule; engines must stay within the boat's rating. The document prohibits wakesurfing and use of wake-enhancing devices. The current preferred fishing/ski searches use the under-21-ft screen, not a blanket rule for all boat types. No universal horsepower cap is invented.

The official association portal prevented verification of a current 2026 revision. Confirm current rules, measured hull/platform length, capacity plate and registration eligibility with the association before buying. The app's rounded listing length or a model name cannot provide that approval. Saved searches retain their saved rule settings; editing a rule does not retroactively rewrite every saved search.

## Data ownership, publication and preservation

| Mode or location | What it contains | Persistence and exposure |
|---|---|---|
| Sample mode | 52 fictional browser-generated boats | Separate browser sample workspace; no scheduled collection |
| Snapshot mode | Published or session-imported canonical listings | Separate browser snapshot workspace; a session-imported file is not automatically published |
| Connected mode | Real listings and private workspace from API | SQLite, available while backend is reachable |
| `data/boatscout.db` | Local listings, prices, notes, favorites, saved searches, rules, alerts and run history | Private local database; ignored by Git |
| `data/cache/`, `data/research/`, `logs/` | Cached source evidence, research artifacts and operational logs | Private local artifacts; ignored by Git |
| `.env` | Password, database location, network and optional delivery settings | Private; never publish or copy into frontend configuration |
| `config/sources.json`, `config/locations.json` | Source URLs/settings and city enrichment cache | Durable configuration; review before committing |
| `public/snapshot.json`, `public/data-mode.json` | Public inventory export and default-mode switch | Copied into the static build and exposed if published |
| `out/` | Generated website, including exported public assets | Rebuildable; ignored by Git |

The original 52 database seed rows were retained separately rather than substituted for real inventory. Normal API listing reads, alert evaluation and the command-line public export exclude samples. `npm run db:seed` is optional demonstration setup, not a refresh requirement. The browser's Settings snapshot export can contain samples if they are part of the current dataset; review it rather than assuming it has the command-line export's real-only policy.

The command-line snapshot exporter excludes raw payloads and all private workspace state. It still publishes listing descriptions, locations, source URLs, photo URLs and other source-derived listing fields. Treat that artifact as public data and review it before a push. An **Export workspace** download contains private notes and should not be committed with the public site. Browser-only workspace changes do not silently transfer into the connected database.

Back up the database consistently while API/worker writes are stopped, together with private `.env`, source/city configuration and any browser workspace exports. Retain cache/research evidence if future parser repairs or auditability matter. Never use a reset/reseed/delete command to repair a collector issue. Docker uses its **named volume**, not the host `data/` database; preserve and back up the correct store. `docker compose down` preserves the volume; adding `-v` deletes it.

## Starting, refreshing and deploying

Use **Node.js 22 LTS, at least 22.12**, with the committed lockfile. The original local verification also used Node.js 26.7 on macOS; Docker used Node.js 22. Exact dependency versions and inventory generation instructions belong to [SBOM.md](SBOM.md).

For a new installation:

```bash
npm ci
npm run setup
npm run dev
```

`setup` preserves existing `.env` and data, generates Prisma and applies committed migrations. `dev` starts the website at `http://127.0.0.1:3000`, API at `http://127.0.0.1:4310`, and a worker. The supplied checkout has already been initialized, so ordinary use starts with `npm run dev`. Check for existing processes first to avoid duplicate listeners. Launchers and Cursor/VS Code tasks invoke these same scripts; Cursor is not a server dependency.

Open **Settings → Your backend**, enter the API URL and the password from the private `.env`, then connect. Reconnect after an API restart. To run a built website and API at one local address, use `npm run build` followed by `npm start`, then open port 4310. `npm start` does not start a worker; use a separate `npm run worker` process if periodic collection is wanted. Container operation uses `docker compose up --build -d` after setup; the two services share the container database volume. Optional browser-rendered sources require a Chromium installation that is not included in the default runtime image.

A complete manual refresh is:

```bash
npm run collect
npm run geocode:listings
npm run export:snapshot
npm run build
```

Inspect collection and geocoding results before exporting; geocoding is needed only when new cities require it. In the connected UI, **Run enabled sources** requests collection, **Refresh status** shows its progress/results, and **Refresh data** reloads the database listings. Neither that action nor the worker exports the public snapshot. A development-page reload reads the new published snapshot; an already-built static site needs a new build/deployment.

**Do not use exit code alone as collection success.** The collector records per-source errors and continues; the one-shot worker also catches/logs a top-level cycle failure. Inspect each `IngestRun`, source counts and observation times. A locked collector can report busy rather than perform a second run. Avoid concurrent manual and scheduled runs, and do not clear job locks while an owner may still be working.

The worker performs collection and then alert evaluation, waits `WORKER_INTERVAL_MINUTES` (default 30), and repeats while its process is running. Its default is **not a fresh scrape every 30 minutes**, because pages remain cached for 24 hours. It is not a system-installed service merely because it was started during a development session.

**No daily or weekly assistant automation, operating-system schedule or full-refresh publication job was created in the conversation.** Daily/weekly operation was discussed as a future option. The delivered profiles default to cadence off; saved-search alert cadence is different from collector frequency. External email/webhook delivery needs configured destinations and enabled channels. First alert evaluation establishes a baseline; delivery retries are at least once. Do not assume an old terminal, API, worker or browser session is still running when resuming work.

The project is now versioned in the private [PNelsonFTP/BoatMarket](https://github.com/PNelsonFTP/BoatMarket) repository with local `origin` configured. For GitHub Pages, export/review the snapshot, push to `main`, enable Pages, select **GitHub Actions** as the Pages build source, and set the repository Actions variable `BOATSCOUT_ENABLE_PAGES=true`. The included workflow checks types/tests, builds with the Pages repository path, uploads `out/` and deploys it. It does not collect live data. The directory originally had no Git repository; it was initialized during the repository handoff. Pages publication remains disabled. A separate validation workflow runs on main-branch pushes and pull requests. A public HTTPS website may be unable to connect directly to a local HTTP backend; use snapshots, the local website, or a deliberately configured reachable HTTPS backend with its exact frontend origin in `ALLOWED_ORIGINS`.

## Verification baseline and remaining uncertainty

[VALIDATION.md](VALIDATION.md) is the dated verification record. The September 7, 2026 work recorded 45 Vitest tests across seven files, eight desktop/mobile Playwright tests, type checking, root and `/BoatMarket/` static exports, and real-snapshot browser checks including source coverage, profiles, photos and overflow. The original build also verified Docker startup and a production-dependency audit. Those successes are historical evidence, not a claim that every command was rerun during this documentation task.

For meaningful code changes, the normal baseline is:

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Install Playwright Chromium first if needed. `node scripts/verify-live-data.mjs` additionally checks the current real snapshot against the running local website/API. For Pages paths, build with `NEXT_PUBLIC_BASE_PATH=/BoatMarket`, run `node scripts/verify-pages.mjs`, then rebuild without that variable to restore a root-address export. Test details, browser prerequisites and output locations are documented in [VALIDATION.md](VALIDATION.md).

Unverified or incomplete areas include actual GitHub deployment, authenticated restricted marketplaces, optional browser-rendered ingestion, native WebMCP availability, external email/webhook delivery and continued marketplace markup compatibility. External images, tiles, geocoding and source inventory can fail independently. Unit fixtures are parser regression tests, not live access guarantees.

## Resume checklist and next actions

1. Read this handoff, [OPERATIONS.md](OPERATIONS.md), [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md). Inspect current configuration, snapshot age and recent runs rather than relying on the dated counts above.
2. Preserve the database and private workspace before changes. Check current listeners and workers, then start only the missing processes. Identify whether the user is viewing sample, snapshot or connected data.
3. Refresh configured sources when authorized, inspect per-source failures and coverage, review new geography, export the public snapshot and validate the resulting website. Keep the user informed about partial coverage or cached observations.
4. Improve duplicate handling with reviewable candidates and manual merge/split support while retaining source evidence, separate asking prices and personal state. Address same-source reposts and the current candidate-query limitations.
5. Address collection gaps through supported feeds, dealer cooperation, public integrations or manual import. Recorded restrictions include Boat Trader and multiple nearby dealer sites; Facebook remains manual-only. Never equate a search result with a currently active ad or solve a denial by bypassing access controls.
6. Add explicit full-refresh scheduling, observable worker health, robust failure exit/status reporting, geocoding review and a publication step if the user chooses daily/weekly operation. Keep research for new sources distinct from routine re-collection.
7. Improve drive-time ranking, length/power provenance, rule revision tracking and freshness/availability confidence before widening to national scale. Plan query/pagination and database changes before treating the app as an unbounded warehouse.

`scripts/configure-lake-holiday.ts` can initialize the six profiles and named rule in a fresh workspace, but it **replaces those named profiles and rule**, including resetting their alert cadence to off. It preserves unrelated profiles and personal listings/notes, but it is not a routine refresh step. Review or export user-customized searches before running it.

The priority list and source-specific blocked/unimplemented work are expanded in [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md). The next engineer should preserve the separation between publicly publishable inventory, privately owned workspace data and the independent future car project.
