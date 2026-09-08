# BoatScout handoff

This is the engineering and operator handoff for the boat project. Start with [README.md](README.md) for installation and [OPERATIONS.md](OPERATIONS.md) for refresh, scheduling, backup and recovery procedures. [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md) records unfinished work and collection struggles. Dependency inventory and its limits are in [SBOM.md](SBOM.md).

The inventory baseline below comes from the snapshot generated **September 7, 2026 at 9:20:19 PM America/Chicago** (`2026-09-08T02:20:19.866Z`). The subsequent improvement pass added reliable refresh reports, duplicate review, location review, workspace transfers and comparison packets. Consult [VALIDATION.md](VALIDATION.md) and the latest files in `data/refresh-runs/` for the final validation/export timestamps. Baseline counts do not establish current seller availability. Restricted sources were not freshly retested in this improvement pass; no Pages publication or daily/weekly schedule was installed.

## Purpose and delivered scope

[BoatPrompt.md](BoatPrompt.md) is the original product brief: aggregate boat advertisements, expose comprehensive filters, compare boats, preserve private notes and favorites, track observed prices, and alert on saved-search changes. The subsequent user requests selected **Lake Holiday, Illinois** as the home location, preferred nearby premium fishing boats with larger motors, and added interest in MasterCraft and comparable ski boats that could fit the lake's requirements.

The application remains general-purpose. The Lake Holiday preferences are editable profiles layered over a shared filter catalog. The current website includes six quick searches, source-coverage explanations, list/grid/map views, listing details and galleries, comparison of up to six boats with a downloadable inspection packet, market charts, saved searches, alerts, private workspace state, full-refresh/source-health controls, duplicate review, city-location review, and validated listing/workspace transfers.

Important implementation choices that differ from the original brief:

- **Next.js exports a static frontend; Fastify runs the API separately.** GitHub Pages cannot execute a database, Node API, Next.js route handlers or a worker. The local backend can also serve the exported website from one address.
- **Prisma uses SQLite.** PostgreSQL/PostGIS and Redis/BullMQ were replaced with a local database, shared in-memory filtering and a periodic Node worker. A PostgreSQL switch would require an actual schema/migration/deployment change.
- **The project was completed beyond the original staged scaffold.** It includes the full application, local execution paths, deployment preparation, tests, live source integrations and two inventory research passes.
- **Facebook Marketplace accepts manual canonical JSON imports.** No cookie/session harvesting or login automation was implemented. Generic marketplace adapters are not evidence of working live integrations.
- **Cross-post grouping is conservative and reversible.** Modern-format HIN matches can group automatically across sources or reposts despite metadata spelling differences. Matching photos/specifications rank review suggestions. Saved same/different decisions, undo, component-wide conflicts and a dry-run reindex command are delivered. Perceptual image hashing and fuzzy-title-only automatic grouping remain unimplemented.
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
        → validated atomic snapshot export → public/snapshot.json → Next static build
                                                    → out/ → GitHub Pages

Full refresh → consistent backup → collection and outcome report
             → optional bounded city enrichment → validated snapshot export
Explicit city lookup → candidate review → config/locations.json → enrichment
Duplicate review → persistent pair decisions → constrained group reindex
```

| Area | Primary files | Responsibility |
|---|---|---|
| Website | `app/page.tsx`, `app/globals.css`, `components/` | Search interface, coverage, map, comparison, details, charts and settings |
| Shared contract | `lib/types.ts`, `lib/catalog.ts`, `lib/search.ts` | Zod schemas, field catalog, filtering, sorting and result grouping |
| Client state and transfer | `lib/client.ts`, `lib/storage.ts`, `lib/import-listings.ts`, `lib/import-workspace.ts`, `components/workspace-transfer.tsx` | Scoped persistence, serialized saves, import manifests, previews and explicit workspace restores |
| Lake profiles | `lib/lake-holiday.ts` | Home/reference point, sourced rule, six quick searches |
| API | `server/index.ts`, `server/app.ts` | Listener, session authentication, validation, rate limits, routes and optional static serving |
| Persistence | `prisma/schema.prisma`, `prisma/migrations/`, `server/repository.ts` | Relational storage, stable identity, observation history and workspace revisions |
| Collection | `server/collector.ts`, `server/network.ts` | Source configuration, per-page collection, network restrictions, cache and job lease |
| Refresh and source health | `server/refresh.ts`, `server/refresh-report.ts`, `server/lease.ts`, `server/source-health.ts`, `config/source-access.json` | Backup/export orchestration, outcome reports, renewable leases, current metrics and dated access ledger |
| Duplicate identity and review | `server/dedup.ts`, `server/duplicates.ts`, `lib/duplicates.ts`, `components/duplicate-review.tsx` | HIN normalization/indexing, ranked suggestions, saved decisions, transitive conflict checks and reversible grouping |
| Extraction | `server/adapters/` | Shared structured data/selectors plus source-specific parsing and pagination |
| Geography | `server/locations.ts`, `server/location-review.ts`, `lib/location-review.ts`, `scripts/geocode-collected.ts`, `components/location-review.tsx` | Candidate ranking, persisted reviewed city centers, evidence and approximate enrichment |
| Background work | `server/worker.ts`, `server/alerts.ts` | Periodic/one-shot collection, saved-search baselines, alerts and delivery retries |
| Publication | `scripts/export-snapshot.ts`, `next.config.ts`, `scripts/postbuild.mjs`, `.github/workflows/pages.yml` | Public data export, static assets, repository base path and Pages deployment |
| Buying packet | `components/compare.tsx`, `lib/comparison-export.ts` | Escaped standalone HTML comparison, observation dates and blank seller/inspection worksheets |
| Setup and launch | `scripts/setup.mjs`, `Start-BoatScout.command`, `Start-BoatScout.bat`, `.vscode/tasks.json`, `compose.yaml` | Local installation, terminal launchers and container deployment |

Frequently searched properties are indexed database columns. Canonical listing JSON stores the remaining validated specifications; engines, sellers and prices also have relational models. Personal state uses `User`, `SavedSearch`, `Favorite`, `Note`, `RuleSet` and `Alert`. Supporting models include `BoatGroup`, `DuplicateDecision`, `IngestRun`, `GeocodeCache`, `JobLock` and `SearchArea`. The additive `20260908010000_duplicate_review` migration adds the indexed nullable `Listing.identityHin` and pair decisions with listing foreign keys. Run migrations before the updated API/worker; existing ads and personal state are retained. Search areas used by saved searches currently live within their filter JSON; the separate `SearchArea` model is not the driver of marketplace URL generation.

The frontend and API share the same filter engine. Search areas are ORed; other active criteria are ANDed. Unknown-value behavior is explicit per field, globally, and in lake rules. The API currently loads the dataset and filters in memory rather than running a paginated search query in SQLite. This is a personal-scale architecture.

### API surface and session behavior

`GET /api/health` and `POST /api/login` are public. Other `/api/` routes require the bearer token issued by login. The backend uses an environment password, origin restrictions and rate limits; login has a stricter rate limit. Sessions live in API-process memory for up to 12 hours, and an API restart invalidates them. The browser keeps the token in session storage and the API URL in local storage; it does not persist the password.

The Fastify request-body limit is **12 MiB**. The general request limit is **120 per minute**, and login allows **five attempts per minute**. Schemas for listings, filters, geographic areas, rules and saved searches live in `lib/types.ts`; workspace restore validation lives in `lib/import-workspace.ts`, and source configuration is validated in `server/adapters/types.ts`. The API import accepts 1–1,000 listings per request; browser imports validate up to 10,000 unique listing/source identities and split connected imports by both item count and encoded byte size. Workspace limits include 5,000 favorites, 200 saved searches, 100 rules and 30 reference points. These are enforced bounds, not scalability guarantees. Use the schemas as the authoritative contract when adding fields or tooling.

| Routes | Purpose |
|---|---|
| `GET /api/listings`, `GET /api/listings/:id`, `POST /api/search` | Read real inventory and run shared filters |
| `GET /api/workspace`, `PUT /api/workspace` | Read/write private state with optimistic revision checks |
| `POST /api/import`, `POST /api/listings/:id/flag` | Import validated records or append a private data flag |
| `GET /api/admin`, `PUT /api/admin/sources`, `POST /api/admin/collect` | Read run/configuration status, edit sources and request collection |
| `POST /api/admin/refresh`, `GET /api/admin/jobs/:id`, `GET /api/admin/source-health` | Request a full backup/collect/export run, follow its outcome, and inspect source/worker health |
| `GET /api/duplicates`, `POST /api/duplicates/decisions` | Page ranked review candidates, inspect group members and saved decisions, save same/different/undo |
| `GET /api/admin/locations`, `PUT /api/admin/locations` | Inspect unresolved cities and save evidence-backed city-center corrections |
| `GET /api/geocode`, `DELETE /api/admin/geocodes` | Explicit place lookup and API geocode-cache maintenance |
| `POST /api/logout` | Revoke the current token |

Collection/refresh endpoints return HTTP 202 with a run ID and report URL before work finishes; a conflicting active job receives HTTP 409. Follow the job report to a terminal outcome. `/api/health` checks database readiness (`503` if unavailable), password configuration and heartbeat freshness. It does not itself establish that any marketplace inventory is current; source-health reports provide that separate evidence. Every authenticated session represents the same local user. The schema's user IDs are not a complete multi-user permission model.

`POST /api/import` returns accepted input IDs, a map to persisted source-record IDs, failed records and unattempted records. Each row has its own transaction; a later failure does not roll back accepted rows. The browser manifest distinguishes acknowledged writes from uncertain timeout outcomes. Source identity wins over an exported ad ID, and an unrelated ID collision is rejected. Review the manifest before retrying or restoring workspace references.

Duplicate decisions accept `{ leftId, rightId, decision: "same" | "different" | "undo" }`. Pairs are stored in canonical ID order. A conflicting valid HIN or a transitive different-vessel decision prevents a new same-vessel merge with HTTP 409. The review response includes every group member/source link, current decisions and blocked prior same-vessel decisions; suggestions are paginated after the complete candidate ranking rather than truncated by a 100-candidate database prefilter.

### Adapter contract

`server/adapters/types.ts` defines an adapter as an `id` plus the synchronous method `parse(html: string, url: string, config: SourceConfig): Listing[]`. The collector owns fetching, cache, jobs and persistence; parsers transform supplied content into canonical listings. `server/adapters/index.ts` registers adapters and dispatches dedicated source parsing before shared structured-data or selector fallbacks. `normalizeListing` in `server/adapters/normalize.ts` handles common conversion/provenance; `server/adapters/pagination.ts` discovers supported page links.

Configuration allows up to 50 sources with up to 30 initial URLs each. Defaults are collection disabled, rendering disabled, automatic pagination disabled, 40 maximum inventory pages and 80 maximum detail pages. Explicit caps can reach 100 inventory and 150 detail pages per source. `followDetails`, `detailMaxLength`, `detailMakes`, optional `cacheMaxAgeHours` and custom `selectors` are independent options. Cache age is bounded to 1–720 hours; source and run overrides do not bypass crawl rules. The descriptive `area` field is run metadata, not a remote-query compiler. Keep source names/IDs and source-listing IDs stable when editing integrations; persistence keys include source identity.

To extend a source, first establish a supported public URL or import path, then add parsing and pagination only where needed, preserve original ad identity/source URLs, validate canonical values, and add representative fixtures/regression tests. Unknown measurements remain null. Do not evaluate page-supplied JavaScript to read embedded data. Inspect a small run before enabling a broader inventory, and retain failure visibility when markup or access changes.

## Collection mechanics and lessons to preserve

- Sources are configured separately from dashboard searches. Editing a radius, make or saved search does not rewrite external search URLs or trigger broader collection.
- Current integrations use public HTML, structured metadata and page-embedded inventory data. Supported sources follow discovered same-origin pagination with explicit inventory-page caps. Detail enrichment is separately limited by configured makes, maximum length and detail-page count.
- Repeated source IDs are processed once per source run. This prevents alternate links to one inventory page from inflating counts or replacing an enriched record with its summary card. It does not solve cross-listing between different ad IDs.
- The HTML cache defaults to 24 hours and is checked before new network requests. Fresh requests verify robots rules, throttle with jitter and use the restricted public-network client. Access challenges, robots failures and failed requests are recorded; there is no access-control bypass. Source/run cache-age settings and actual cache/fetch counters appear in the collection report.
- Cache reuse preserves the page's observation timestamp. A new export timestamp or a successful cached collection run does not mean the source page was fetched again.
- Renewable leases are checked throughout detail work and fenced inside listing-write transactions. Lost ownership/cancellation stops writes; the next legitimate collector reconciles abandoned running records. Reports distinguish success, partial, failed, busy and cancelled outcomes and inventory/detail caps, successful pages, source observations, content versus metadata changes and price changes/drops.
- Failed or skipped detail enrichment retains prior successful detail fields and their original observation date, with an explicit retention reason. Summary price/status/location remain separately observed facts. General field-level quotations and conflicting-source resolution remain future work.
- Raw HTML is held locally in `data/cache/`; database payloads retain normalized evidence and cache references. The per-URL cache is overwritten when refetched, so it is **not an immutable archive of every historical page**. Price observations and first-seen dates are preserved separately.
- A bad/empty/challenged page does not imply all its boats were sold. Other sources continue. Active real records unobserved for 14 days become stale; a prolonged source failure can therefore make records stale without proving removal. Explicit sold/removed status remains recorded.
- Advertised specifications can be incomplete or rounded. Parsers distinguish installed horsepower from engine displacement, capacity ratings and trolling-motor ratings; accessory dimensions must not become hull length. Source claims still require verification when buying.
- Original-source photo URLs are used for real advertisements. They can expire or fail independently of the app. The locally licensed illustrative photos belong only to fictional samples; see [PHOTO_CREDITS.md](PHOTO_CREDITS.md).

### Duplicate policy and review limits

Automatic grouping now requires the same normalized **modern-format HIN**, independently of stored make/model/year and source. Normalization accepts case/spacing/hyphen variation and an explicit `US-` prefix, checks the 12-character structure, and keeps unsupported older/nonstandard values as visible evidence. It does not check the manufacturer's registry, title, ownership or the truth of a seller's reported HIN. The structure reference is [33 CFR 181.25](https://www.ecfr.gov/current/title-33/chapter-I/subchapter-S/part-181/subpart-C/section-181.25).

Different supported HINs veto automatic and manual group unions across all members. Explicit different-vessel pairs also veto transitive merges, so `A != C` prevents an `A = B = C` group. Same-source reposts, shared photo URLs, normalized model/title, city, price and seller evidence rank human-review suggestions. Stock photos and matching specifications are not automatic proof.

The September 7 snapshot has **144 supported modern-format HINs, 163 suggested pairs and zero repeated-HIN automatic groups**. Reindexing that baseline populates the identity index without inventing a reduction in ad counts. A suggestion is a pair, not a count of proven duplicates; multiple pairs can describe one candidate cluster. Matching rehosted/resized images, legacy HINs and regional reposts without enough evidence can still be missed.

`npm run duplicates:review` defaults to a dry-run plan. `npm run duplicates:review -- --apply` populates indexed HINs and rebuilds only strong-evidence/reviewed groups. Stable IDs are derived from exact component membership; adding/removing a group member can change its group ID. Advertisements, source URLs, prices, notes and favorites remain keyed by their original listing IDs. Apply from a backed-up database, then export a new snapshot to share the resulting groups. The incremental collector reconciles affected identity neighborhoods and respects saved separations.

In Settings, **Same vessel** saves a review override; **Different vessels** keeps that pair apart across future collection; **Undo decision** removes the override. Undoing a same-vessel decision can leave an independently matching HIN group intact; choose Different vessels for explicit separation. A later HIN correction can split a group and flag an older same-vessel decision as blocked. Listing details show saved notes on other advertisements read-only with their source links; the main editor changes only the displayed advertisement's note. This preserves visible context when a price change selects another representative ad. There is no destructive ad merge, perceptual-image hashing or claim that all display units are unique physical boats.

## Geographic and lake assumptions

The Lake Holiday reference is **41.6180404, -88.6682705**. Default nearby and wider radii are **150 and 250 great-circle miles**, not hours of driving. No route-time service is implemented. Crossing Lake Michigan is an obvious case where geographic proximity understates the drive.

Locations come from advertised coordinates or a city/dealer location. The delivered batch city cache contains 115 resolved locations, while 19 active ads in the dated snapshot have no usable location and are excluded from nearby searches. Dealer coordinates do not establish where an explicitly off-site vessel is stored. The improved geocoder matches city/state/country, considers suburb/neighbourhood locality types, uses available ZIP evidence and leaves tied/no-match candidates for review. Regression coverage includes the Allendale, Michigan ambiguity that previously selected the wrong county. Limited result sets, incomplete ZIP/county evidence and vague regions can still prevent a reliable location.

There are two different caches: interactive API lookups use SQLite `GeocodeCache`, while bulk listing enrichment uses `config/locations.json` (or `LOCATION_CONFIG`). Clearing geocodes in Settings clears the former only. `data/location-review.json` (or `LOCATION_REVIEW_FILE`) stores lookup candidates, outcomes and correction evidence. Settings city review requires a location label and explanation; reviewed city centers survive collection while exact advertised coordinates and explicitly off-site/unknown boat locations are preserved. Corrections apply at city scope, not to a private street address or an individual vessel. There is no dedicated city-override undo workflow yet.

`npm run geocode:listings` is an explicit, rate-limited operation for at most 100 previously uncached cities per run, supports US states, and stops a request batch on 403/429 responses. `npm run refresh -- --geocode` includes that step under the refresh lease. The worker only requests geocoding when both full-refresh export behavior and the explicit geocoding option are enabled. Inspect candidate evidence before relying on new distances; no routing provider or real drive-time filter was added.

The included screen uses the association-authored [public 2024 rulebook](https://swansonrealestate.net/wp-content/uploads/2025/06/Rules-Regs-2024-Lake-Holiday.pdf): non-pontoons must be strictly below 21 ft, with molded platforms counted; pontoons have a separate 28-ft rule; engines must stay within the boat's rating. The document prohibits wakesurfing and use of wake-enhancing devices. The current preferred fishing/ski searches use the under-21-ft screen, not a blanket rule for all boat types. No universal horsepower cap is invented.

The official association portal prevented verification of a current 2026 revision. Confirm current rules, measured hull/platform length, capacity plate and registration eligibility with the association before buying. The app's rounded listing length or a model name cannot provide that approval. Saved searches retain their saved rule settings; editing a rule does not retroactively rewrite every saved search.

## Data ownership, publication and preservation

| Mode or location | What it contains | Persistence and exposure |
|---|---|---|
| Sample mode | 52 fictional browser-generated boats | Separate browser sample workspace; no scheduled collection |
| Snapshot mode | Published or session-imported canonical listings | Separate browser snapshot workspace; a session-imported file is not automatically published |
| Connected mode | Real listings and private workspace from API | SQLite, available while backend is reachable |
| `data/boatscout.db` | Local listings, prices, notes, favorites, saved searches, rules, alerts, duplicate decisions and run history | Private local database; ignored by Git |
| `data/cache/`, `data/research/`, `logs/` | Cached source evidence, research artifacts and operational logs | Private local artifacts; ignored by Git |
| `data/refresh-runs/`, `data/location-review.json`, `data/backups/` | Run reports/worker heartbeat, location evidence and consistent backups | Private local operational state; ignored by Git |
| `.env` | Password, database location, network and optional delivery settings | Private; never publish or copy into frontend configuration |
| `config/sources.json`, `config/locations.json` | Source URLs/settings and city enrichment cache | Durable configuration; review before committing |
| `public/snapshot.json`, `public/data-mode.json` | Public inventory export and default-mode switch | Copied into the static build and exposed if published |
| `out/` | Generated website, including exported public assets | Rebuildable; ignored by Git |

The original 52 database seed rows were retained separately rather than substituted for real inventory. Normal API listing reads, alert evaluation and the command-line public export exclude samples. `npm run db:seed` is optional demonstration setup, not a refresh requirement. The browser's Settings snapshot export can contain samples if they are part of the current dataset; review it rather than assuming it has the command-line export's real-only policy.

The command-line snapshot exporter validates canonical records, rejects duplicate IDs/credential-bearing URLs, excludes samples/raw payloads/private workspace fields, rejects an accidental empty snapshot, records observation ranges and atomically replaces the target. A full-refresh export also records the run outcome and whether partial publication was explicitly allowed. It still publishes descriptions, locations, source URLs, photo URLs and other source-derived listing fields. Treat that artifact as public data and review it before a push; schema validation is not a review of every seller's free text.

An **Export workspace** download contains private notes and should not be committed with the public site. Browser-only workspace changes do not silently transfer into the connected database. Storage keys are scoped by deployment path, sample/snapshot mode and normalized backend identity, so multiple Pages projects or backends do not silently share notes/tokens. Legacy unscoped workspace keys are preserved and offered for review rather than automatically adopted. Disconnect restores the prior browser dataset/workspace.

Settings supports validated workspace restore with merge or explicit replacement previews, skipped unknown listing references, preservation of conflicting existing edits in a merge, a downloaded pre-restore copy and revision-conflict handling. Connected listing imports are chunked and emit a downloadable per-row result manifest; browser listing imports merge by source identity by default and offer explicit dataset replacement. Loading listings does not erase private notes/favorites. Browser-imported inventory remains session data; export it before closing if it is not otherwise saved.

`npm run backup` creates a consistent SQLite `VACUUM INTO` backup, checks database integrity and writes a file/hash manifest with the related snapshot/configuration. Full refresh creates a backup before collecting. Backup output must stay outside `public/`, `out/` and `.git/`; it includes private workspace data. Environment secrets are intentionally excluded, so preserve `.env` separately along with any browser-only workspace exports. Retain cache/research evidence if parser repair or auditability matters; automatic raw-page/history pruning is not implemented. Never use a reset/reseed/delete command to repair a collector issue. Docker uses its **named volume**, not the host `data/` database; preserve and back up the correct store. `docker compose down` preserves the volume; adding `-v` deletes it.

### Downloadable comparison and inspection packet

In Compare, **Download comparison packet** exports all selected boats to standalone HTML with a side-by-side table, source links/prices, reported specifications, source observation times, uncertainty warnings and twelve blank seller/inspection checklist entries per boat. Open the file in a browser and use Print to save a PDF. The packet deliberately omits saved workspace notes and remote images/scripts; source strings are HTML-escaped, links accept only HTTP(S), and a restrictive content policy prevents executable page data.

The checklist covers availability/ownership, HIN/title evidence, measured hull/platform length, capacity plate/installed motor, association confirmation, mechanical/hull inspection, trailer paperwork/condition and travel arrangements. Blank fields are not completed inspections. Packet generation does not refresh sources, establish eligibility or mechanically certify a boat. The HTML supports narrow screens and print styling; it is a buying worksheet, not a signed report or PDF-generation service.

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
npm run refresh
npm run build
```

`refresh` performs consistent backup → collection → outcome validation → snapshot export. Add `--geocode` for bounded unknown-city enrichment. A partial, failed, busy or cancelled collection preserves the existing snapshot by default; `--allow-partial` is an explicit operator choice after inspecting errors. Building/deploying remains a separate action. The lower-level `collect`, `geocode:listings` and `export:snapshot` commands remain available for staged operation. A standalone export must be preceded by a review of source outcomes because it is not itself a collector.

In connected Settings, collection and full-refresh controls return a durable job ID; source health shows current metrics, last results, worker heartbeat and the dated blocked/unconfigured-source ledger. Refresh data reloads connected records. Exporting updates the local snapshot; an already-built site still needs a new build/deployment. HTTP 202 acknowledges a job, not successful completion.

CLI exit codes are now meaningful: success `0`, failed `1`, partial `2`, busy `3`, cancelled `130`; `collect --skip-busy` intentionally treats busy as success. Still inspect the report's page counts, caps, cache reuse and observation times because a successful permitted run is not complete market coverage. Do not clear job locks while an owner may still be working.

The worker performs collection and alert evaluation after successful cycles, waits `WORKER_INTERVAL_MINUTES` (default 30) after completion, and repeats while its process is running. Set `WORKER_AUTO_EXPORT=true` for the full backed-up refresh/export workflow and `WORKER_AUTO_GEOCODE=true` to include bounded geocoding; both are opt-in. `npm run collect` remains a low-level one-shot collection even if daemon auto-export is configured. Heartbeats report liveness and next/last cycle state. The default is **not a fresh scrape every 30 minutes**, because pages remain cached for 24 hours. The worker is not a system-installed service merely because it was started in a development session.

**No daily or weekly assistant automation, operating-system schedule or Pages-publication job was installed.** The improved commands/options support daily or weekly operation once an operator configures the schedule and machine availability. The delivered profiles default to cadence off; saved-search alert cadence is different from collector frequency. External email/webhook delivery needs configured destinations and enabled channels. First alert evaluation establishes a baseline; delivery retries are at least once. Alert delivery leases/retries remain a separate area to harden. Do not assume an old terminal, API, worker or browser session is still running when resuming work.

The project is now versioned in the private [PNelsonFTP/BoatMarket](https://github.com/PNelsonFTP/BoatMarket) repository with local `origin` configured. For GitHub Pages, export/review the snapshot, push to `main`, enable Pages, select **GitHub Actions** as the Pages build source, and set the repository Actions variable `BOATSCOUT_ENABLE_PAGES=true`. The included workflow checks types/tests, builds with the Pages repository path, uploads `out/` and deploys it. It does not collect live data. The directory originally had no Git repository; it was initialized during the repository handoff. Pages publication remains disabled. A separate validation workflow runs on main-branch pushes and pull requests. A public HTTPS website may be unable to connect directly to a local HTTP backend; use snapshots, the local website, or a deliberately configured reachable HTTPS backend with its exact frontend origin in `ALLOWED_ORIGINS`.

## Verification baseline and remaining uncertainty

[VALIDATION.md](VALIDATION.md) is the dated verification record and authoritative source for final test totals/results. The original collection build had 45 Vitest tests and eight desktop/mobile browser tests. The improvement pass added isolated duplicate/database tests, HTML-export injection/content tests, import/storage/default tests, refresh/backup/cache/lease/outcome tests and workspace-transfer browser coverage. The comparison packet was also rendered in Chromium and exercised through browser print-to-PDF. Original Docker/live-source successes are historical evidence unless the validation record explicitly records a fresh run.

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
4. Use Duplicate review to adjudicate the ranked cross-list/repost pairs while retaining source evidence and personal state. The original baseline has no repeated supported HINs, so automatic grouping alone cannot remove those repeats. Export after saving decisions; consider better original-image identity and legacy HIN support later.
5. Address collection gaps through supported feeds, dealer cooperation, public integrations or manual import. Recorded restrictions include Boat Trader and multiple nearby dealer sites; Facebook remains manual-only. Never equate a search result with a currently active ad or solve a denial by bypassing access controls.
6. Configure a daily/weekly schedule and an authorized publication step only if the user requests them. Full-refresh jobs, worker health, meaningful exit/status reporting and geocoding review are now implemented; durable OS service installation, missed-run catch-up and alert-delivery hardening remain. Keep research for new sources distinct from routine re-collection.
7. Improve drive-time ranking, length/power provenance, rule revision tracking and freshness/availability confidence before widening to national scale. Plan query/pagination and database changes before treating the app as an unbounded warehouse.

`npm run configure:lake-holiday` now adds only missing built-in profiles, rule and home reference by default. Existing user edits and cadence settings are preserved. The optional `--reset-existing` flag explicitly resets built-in defaults; review/export customized searches before using it. This setup command is not a routine inventory refresh step.

The priority list and source-specific blocked/unimplemented work are expanded in [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md). The next engineer should preserve the separation between publicly publishable inventory, privately owned workspace data and the independent future car project.

### Final operational notes from the integration audit

Connected workspace state also caches a deployment/backend-scoped browser backup; SQLite remains authoritative and cached state is never silently restored over it. Import manifests/ID maps remain in Settings memory until downloaded. Download them before leaving the page after a partial result. Grouped detail views expose each other ad’s note read-only while editing only the representative ad.

API-triggered alert evaluation writes a separate per-run outcome; an alert failure cannot overwrite a successful collection/full-refresh result. Source metrics are displayed only for the matching ingest run. City query aggregation preserves ZIP evidence and queues conflicting ZIPs instead of choosing the last record. See VALIDATION.md for the final 106 unit/integration and 18 desktop/mobile checks.
