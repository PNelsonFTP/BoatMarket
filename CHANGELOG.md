# BoatScout delivery history

## 2026-09-08 — Reliability, review and buying tools

- Added HIN indexing, reversible same/different/undo duplicate review and conflict protection; retained 163 suggested pairs in the current real inventory without speculative automatic merges.
- Added protected full refresh, honest CLI/API outcomes, durable reports, collector heartbeat/cancellation/fencing, stale-run recovery and meaningful-change/cache/page/detail metrics.
- Preserved detail enrichment on failures and used observation timestamps for summary/detail price and availability conflicts.
- Added database/worker health, structured dated source-gap ledger, source dashboard, city/ZIP/suburb ambiguity handling and reviewed city-center correction.
- Added full-dataset chunked import, failure/retry manifests, scoped browser storage, deliberate legacy migration, previewed workspace restore and safe preset initialization.
- Added consistent private backups, integrity/hash verification and documented restore; comparison packets include printable inspection checklists.
- Completed all-platform bundled-package inventory and CycloneDX schema validation without adding application dependencies.
- Updated README, handoff, operations, source/data notes, SBOM, decisions, validation and remaining roadmap. Tests use isolated databases/fixtures; dated blocked-source observations remain identified as such.


This is a record of delivered work and decisions, not a Git commit history. The supplied workspace had no Git repository. Dates below use America/Chicago; UTC timestamps can fall on September 8 for work done during the September 7 evening.

## September 7, 2026 — Initial application

- Built the boat-search workspace from [BoatPrompt.md](BoatPrompt.md), with a responsive nautical interface, grid/list/map search, a full attribute catalog, comparison, favorites, notes, saved searches, market charts, and collection settings.
- Split the static Next.js frontend from an authenticated Fastify API and a local Node worker so the website can be exported to GitHub Pages. Chose SQLite/Prisma and a simple leased worker for the local single-user workload.
- Added schema validation, session authentication, origin/rate checks, DNS-checked public fetching, source adapters, raw-evidence references, price history, conservative grouping, and alert delivery infrastructure.
- Added local setup, migrations, macOS/Windows/editor launchers, Docker support, repository-subpath static builds, and a GitHub Actions Pages workflow. Prepared deployment without publishing to an unspecified repository.
- Added 52 explicitly fictional sample records and licensed illustrative photos, separated from real API/export records and real alert evaluation.
- Verified unit/integration and browser workflows, static exports, local API operation, Docker startup, and the initial dependency audit. [VALIDATION.md](VALIDATION.md) distinguishes those historical checks from later ones.

## September 7, 2026 — Lake Holiday live data

- Set Lake Holiday, Illinois as the reference for nearby searches and added preferred fishing brands, a reported-200+ hp fishing preset, and MasterCraft/comparable ski-brand presets.
- Added preliminary strict-under-21-ft screening from the public association-authored 2024 rulebook, with nominal-measurement and current-rule limitations visible in the UI.
- Implemented dedicated Bedford Sales, OnlyInboards, and Miller's parsers and collected an initial 257 ads; recorded failures for other attempted sources.
- Preserved source photos, unknown/quote-only prices, original observation dates, actual boat versus seller locations, and visible warnings for conflicting power or implausible dimensions.
- Published the local real-data snapshot into the development/static website. No external GitHub deployment occurred.

## September 7, 2026 — Expanded source research

- Expanded collection to ten sources and 1,538 ads, including 17 Craigslist regions and additional five-state marketplace/dealer inventory. The final dated pool contains 1,522 active and 16 sold ads.
- Added Dealer Spike, Gordy's, Bass Boat Central, Starved Rock, and modern Craigslist parsing; broadened OnlyInboards geographic coverage.
- Added supported pagination and per-run stable-ID suppression so repeated page links do not inflate counts or replace enriched details with summaries.
- Corrected card/structured-data joins, current asking-price selection, named-engine horsepower extraction, inappropriate accessory-length inference, and generic dealer-catalog misclassification.
- Improved recent-cache handling while retaining original observation times and checking access rules before new outgoing page requests.
- Expanded the city cache to 115 locations, corrected Allendale, Michigan's locality, and retained unresolved/off-site locations as unknown.
- Added source coverage, an all-nearby view, and a view that includes missing lengths for review. The main preset now has an 18-ft lower bound; existing user-saved definitions can differ.
- Verified 45 tests across seven files, eight desktop/mobile browser tests, real-data coverage views, authenticated backend connection, and root/repository-path static exports. These are ad/filter counts; cross-posts remain unresolved.

## September 7, 2026 — Portable car-project prompt and refresh guidance

- Created [MuscleCarPrompt.md](MuscleCarPrompt.md) as a self-contained prompt to copy into a separate future project. It specifies Wheaton, four-hour driving searches, classic Mustangs/Camaros/Corvettes, and optional specialty Mustangs. No car application, database, or collection was integrated into BoatScout.
- Explained manual collection, connected refresh, snapshot export, daily/weekly worker intervals, and the distinction between collection and alert cadence.
- Recommended a daily full refresh and weekly broader research pass. No new fixed daily/weekly automation was created; the existing local worker configuration remains 30 minutes with a 24-hour page cache.

## Documentation and dependency inventory handoff

- Expanded the README navigation and operational guidance; added [OPERATIONS.md](OPERATIONS.md), [HANDOFF.md](HANDOFF.md), and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).
- Added reproducible software inventories and dated audit/provenance records described in [SBOM.md](SBOM.md). Its scope limits distinguish locked dependencies, optional bundled dependencies, runtime/build dependencies, and components outside npm.
- Audited open limitations against code, including conservative duplicate grouping, source blocks, partial-run reporting, snapshot scheduling, location/rule uncertainty, and import/deployment constraints. This documentation pass records those issues; it does not silently claim they were fixed.

## Repository handoff

- Initialized this project on `main` and created the private [PNelsonFTP/BoatMarket](https://github.com/PNelsonFTP/BoatMarket) repository under the owner's account.
- Included application source, tests, launchers, configuration examples, reviewed public inventory, documentation, and SBOM artifacts. Private environment files, databases, caches/research, logs, builds, and test reports remain ignored.
- Enabled the validation workflow for pushes to `main` as well as pull requests. Made Pages jobs opt-in through the `BOATSCOUT_ENABLE_PAGES` repository Actions variable; the website remains unpublished.
- Updated setup and handoff documentation for cloning the repository and maintaining it.
