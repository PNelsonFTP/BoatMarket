# BoatScout delivery history

## October 30, 2026 — Reviewed inventory refresh and publication

Refreshed all twelve enabled sources through a durable two-pass session. Ten inventories passed and all 305 eligible detail checks succeeded. Huber’s and Gordy’s inventory endpoints returned HTTP 403; their retained ads keep their original dates. The reviewed snapshot contains **2,666 ads**, **82 new ads** and **29 price changes (25 decreases)**. The 77 active-to-stale transitions follow the existing age policy and do not imply sales. Private workspace records, source configuration, application dependencies and source SBOMs are unchanged. Committed, pushed and deployed the exact reviewed release to GitHub Pages. Public hashes/provenance and all 35 evidence shards match; desktop/mobile filters, images and layout passed. Local root and Pages production suites and the public suite each passed twelve checks. Windows, Ubuntu and both container jobs passed in the full hosted validation matrix. See LIVE_DATA.md and VALIDATION.md for release and test evidence.

## October 26, 2026 — Reviewed inventory refresh

Refreshed all twelve enabled sources with a durable two-pass session. Ten complete inventories passed; all 299 accepted-inventory eligible details completed. Huber’s supplied 26 partial summaries, including four new ads, while its pagination and 26 detail requests were denied; Gordy’s inventory remains HTTP 403. The reviewed snapshot contains 2,584 ads, 48 new ads, 19 price changes (16 drops), and explicit age/fresh-observation status transitions. Private workspace data and samples are preserved. Local tests, payload/equivalence checks, Pages build and twelve production browser checks passed. The reviewed release was published successfully and verified publicly on desktop/mobile, including all catalog evidence shards and the twelve-test production suite. Windows, Ubuntu and both container jobs passed in the final validation matrix. Application source, dependencies, source policies and source SBOMs remain unchanged. See LIVE_DATA.md and VALIDATION.md for publication evidence and scope.

## October 22, 2026 — Inventory refresh and reviewed publication

Refreshed all twelve enabled sources through a durable two-pass session. Ten accessible inventories passed; Huber’s and Gordy’s HTTP 403 gaps retain their original dated ads. All 304 eligible details completed, with no outstanding deferrals. The reviewed snapshot contains 2,536 ads, including 107 newly indexed ads and 34 price changes (27 decreases); 1,491 ads were observed this session. Local tests, the Pages build, exact release correspondence and all twelve production browser checks passed. The application fingerprint, dependencies and source configuration are unchanged. Pages deployment and public snapshot/catalog/build verification passed, followed by desktop/mobile preset/photo/layout checks and the public production suite. A Windows CLI-test timeout exposed a fixture coupled to the growing published graph; isolated its working directory while preserving every assertion and deadline. The final Windows/Ubuntu/container matrix is green. See LIVE_DATA.md and VALIDATION.md for the reviewed release, deployed commit and exact results.

## October 21, 2026 — Imports, refresh sessions, grouping, catalog and lifecycle

Implemented engineering-review items **1–7, 10 and 11**. Listing files now support 64 MiB while API chunks keep 12 MiB/1,000-record limits. Hull and motor make inference is separate; four evidence-backed historical Vexus ads were corrected without re-observation. Inventory acceptance has a durable configuration-specific baseline; strict captured-empty Craigslist detection avoids accepting arbitrary blank pages. Bounded refresh sessions defer export until explicit finalization; live progress explains phases, waits and cancellation. Market counts distinguish reviewed/HIN/unresolved records. A verified compact search catalog loads provenance lazily, retaining all shared filter inputs and full export compatibility. Archive packages, exact-hash retirement controls and concurrent bounded log rotation preserve recovery evidence. Root and Pages production browser suites replace make-dependent verification. Documentation and SBOM/advisory evidence were refreshed; no dependency version, service schedule or medium/low cleanup retirement changed. See IMPLEMENTATION_2026-10-21.md and VALIDATION.md for final checks and remaining limits.

Hosted Windows testing additionally exposed subprocess ESM-path portability and transient lock-sharing errors. File-URL imports and bounded Windows sharing retries preserve the full concurrent-record assertion. Unknown/malformed lock ownership now requires operator review regardless of age; valid dead-owner recovery retains PID/nonce checks.

## October 21, 2026 — Committed cleanup and second engineering review

- Committed and pushed the reviewed audit/cleanup documentation as `e3ec52e`; private raw audit evidence remains ignored and local.
- Re-reviewed implementation, runtime/deployment workflows, test coverage, current snapshot and remaining roadmap. Added [15 prioritized recommendations](IMPROVEMENT_REVIEW_2026-10-21.md) with evidence, effort, dependencies and acceptance checks.
- Reproduced full-inventory import size incompatibility and hull/engine make confusion. Retrieved failing hosted browser evidence; fresh local typecheck and 218 tests passed with one skip. No feature, inventory, dependency or publication change was made.

## October 20, 2026 — Owner-approved high-confidence cleanup

- Removed 271 approved files totaling 373,794,950 bytes (356.5 MiB), plus 48 empty build directories: `.next/`, `.next-dev/`, TypeScript incremental cache, Finder metadata and 14 expired unreferenced HTML cache files.
- Applied only the 14 approved cache entries through a fresh hash-bound retention subset; no backup or price-history pruning. Preserved database contents, historical evidence/releases, dependencies and `out/`.
- Verified protected hashes, logical database contents, SQLite/Git integrity and the existing exact reviewed release. Documented per-file removal receipts and remaining candidates in [CLEANUP_REVIEW.md](CLEANUP_REVIEW.md). No commit, push, inventory collection or deployment.

## October 20, 2026 — Project and cleanup review

- Inventoried hidden, ignored and tracked files, imports, dynamic assets, configuration, backup protection and duplicate evidence; documented exact cleanup candidates and non-overlapping space estimates in [CLEANUP_REVIEW.md](CLEANUP_REVIEW.md).
- Corrected stale deployment/source-count-gate descriptions and separated configured startup from actual process availability. Verified existing release/lock/SBOM hashes without regenerating inventory or dependency artifacts.
- Proposed cleanup for owner approval; no deletion, collection, commit, push or deployment was performed.

## October 19, 2026 — Inventory baseline correction and refreshed release

- Changed automatic inventory count comparison to the last completed successful source ingestion, preserving drop thresholds, historical field checks and failed/running-baseline protections. Added four regression tests; all 218 local tests passed.
- Refreshed to 2,429 real ads (1,615 active, 19 sold, 795 stale). All ten accessible sources passed; Huber’s and Gordy’s HTTP 403 gaps remain explicit. Cached recovery preserved capture dates and completed deferred OnlyInboards details.
- Deployed commit `2b69f12` through successful Pages run `39257842442`; exact reviewed snapshot/build and public desktop/mobile verification passed. See [LIVE_DATA.md](LIVE_DATA.md) and [VALIDATION.md](VALIDATION.md) for dated evidence.

## September 12–October 17, 2026 — Recorded inventory releases

- Repeated reviewed refreshes, retained coverage gaps and observation dates, and manually deployed matching approved snapshots. Complete dated release/run/count evidence is preserved in [LIVE_DATA.md](LIVE_DATA.md), [HANDOFF.md](HANDOFF.md) and [VALIDATION.md](VALIDATION.md).

## September 10, 2026 — Public repository and live Pages deployment

- Made PNelsonFTP/BoatMarket public at the owner's explicit request after inspecting committed history and pending files for private data.
- Enabled GitHub Pages with Actions builds and HTTPS at https://pnelsonftp.github.io/BoatMarket/; retained the exact-hash manual release workflow.
- Committed and pushed the refreshed 1,636-ad snapshot as `e0970f6`, then deployed it in successful Pages run `34547047357`. Public desktop/mobile checks confirmed the exact snapshot/build hashes, images and filters with no runtime or missing-asset errors. See VALIDATION.md.
- Kept the backend/database, raw captures, credentials and workspace data local. Repository visibility does not change the `UNLICENSED` first-party license or npm `private: true` setting.

## September 10, 2026 — Fresh inventory and bounded classification repair

- Completed all twelve configured inventory quality gates with 363 fresh pages and no cache hits or budget deferrals. Two Huber detail access failures remain explicit; the collection is partial and neither restriction was bypassed.
- Retained 1,636 ads, including 1,619 active and 17 sold; 1,557 were observed this run and 79 retain earlier observations. Indexed 43 new ads, recorded 33 asking-price changes (32 drops) and one active-to-sold change.
- Corrected `Tiger`/`TIGER` versus `Tige` inference and gave explicit PWC/jet-ski/WaveRunner labels priority over generic ski terms, preserving genuine compact Tige names and ordinary jet boats. Applied eight narrow current-capture record repairs under a verified backup and exact fingerprint checks.
- Passed 34 focused tests across five files and typecheck. Broader engine-brand and ambiguous accessory/PWC inference remains review work; no dependency versions changed.
- Activated a separately reviewed partial snapshot locally. Production build, exact reviewed-release verification, desktop/mobile checks and the final HTTP/database audit passed; served bytes match the reviewed snapshot. This was initially a local-only review; the subsequent public Pages decision is recorded above. Evidence is recorded in VALIDATION.md and LIVE_DATA.md.
- Finalized the interrupted September 8 CI handoff: all four hosted jobs passed for `5b8c05c`. That historical validation and its immutable image inventories predate this parser correction.

## September 8, 2026 — P1/P2 implementation goal

- Added permanent vessel identities/timelines, reviewed known duplicate examples, canonical/local perceptual image evidence and queue filters.
- Added actual-location corrections with undo, field provenance, configured road routes/four-hour filtering and shared geocoder rate/backoff control.
- Found and reviewed the official December 2, 2025 Lake Holiday rulebook; updated untouched factory screens to inclusive 21.0 ft while preserving custom searches.
- Added renewable alert/worker supervision, cooperative cancellation, interrupted-job recovery, service tooling, configurable event types and channel retry diagnostics.
- Added rotating detail checkpoints, immutable source evidence, staged quality gates, redacted fixture capture and reviewed parser repair.
- Added reviewed retention, free-space checks and verified restore into a new directory.
- Added immutable snapshot activation, privacy/source/SBOM/build release review and manual Pages deployment/rollback.
- Pruned container runtime dependencies, added optional rendered image and OS/native/browser inventories, pinned actions/base image, and added Windows CI.
- Clarified advertisement/grouped research counts, fixed inclusive 21-foot detail eligibility and Huber's Nautique category, and added suite-wide temporary-database isolation.
- Fixed fresh-clone snapshot/backup handling and Windows native path, generated service path and line-ending portability after the first hosted validation run exposed those gaps. Private publication journals remain private; imported generations retain integrity checks without claiming a local collection run.
- Corrected the Windows backup destination preflight to reject public/build/Git folders before any SQL, with regression coverage for each root and nested destination.
- Wound down further feature work at the owner's request; the owner reviewed the local website and then authorized the final commit/push. Market grouping-basis classification remains explicitly deferred.
- Fresh permitted source research and documentation are tracked in SOURCE_COVERAGE.md; all requirement mappings and verification are in P1_P2_IMPLEMENTATION.md and VALIDATION.md.


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
