# Verification record

September 8, 2026 evidence, America/Chicago; final hosted CI completion was confirmed and this handoff record finalized on September 10. The inventory counts below remain the historical September 8 scan results. Local checks used Node 26.7/npm 11.19 on macOS; the supported minimum remains Node 22.12. Captured Docker runtime checks used Node 22.23.2 on Linux ARM64. This document records actual checks, not a guarantee of marketplace completeness.

The owner requested winding down enhancements, reviewed the local website, and then authorized the final commit/push. The completed repository/deployment checkpoint is recorded below. The original P1 Market criterion for reviewed-versus-HIN grouping classification remains explicitly deferred. Current ad/group counts and the limitation are visible in Market and documented in [P1_P2_IMPLEMENTATION.md](P1_P2_IMPLEMENTATION.md).

## Integrated results

| Check | Result |
|---|---|
| TypeScript | `npm run typecheck` passed |
| Unit/integration suite | Final macOS run: **210 tests across 35 files passed**, with one Windows-only alias test skipped; includes fresh-clone backup/restore, private-backup preflight and release-fingerprint regressions |
| Desktop/mobile browser suite | **20 tests passed** in Chromium, including advertisement/grouped-record counts |
| Root production export | `npm run build` passed; root output restored for the local website |
| GitHub Pages subpath | `/BoatMarket/` build and browser verification passed: search, images and public assets; zero runtime errors or missing local assets |
| Actual review panels | Desktop 1440×1000 and mobile 390×844 passed against the local authenticated API; duplicate queue loaded; zero runtime errors or horizontal overflow |
| Final live snapshot | Desktop/mobile verified 1,593 ads across twelve sources, 75 shortlist results, 1,157 grouped nearby results and 93 results when unknown lengths are included; real API login passed; zero page errors |
| Visual inspection | Actual desktop duplicate queue and mobile parser-maintenance screenshots inspected; fields, evidence, HIN conflicts and controls readable |
| Migration and data preservation | Verified pre-change backup; additive identity/location/alert migration applied; six reviewed identity decisions and six factory lake-profile corrections applied |
| Backup/recovery | SQLite integrity, file hashes and isolated restore tests passed; source/workspace/history records preserved |
| npm SBOM | Three CycloneDX 1.5 schema/graph/evidence checks passed; 255 production, 319 required full-tree and 441 all-platform package instances |
| npm advisory checks | Full and production registry audits at 17:01:49 UTC reported zero advisories; exact scope/limitations in [SBOM.md](SBOM.md) |
| Actual Docker targets | Both local ARM64 and final hosted AMD64 targets passed non-root startup, migration, authentication, listing queries and native-dependency checks; rendered targets also passed a JavaScript browser fixture |
| Docker snapshot permissions | An isolated copy/read probe reproduced `EACCES` for a root-owned `0600` pointer and passed after copying ownership to UID1000. The existing captured runtime also passed the expanded website/pointer/selected-snapshot HTTP smoke |
| Runtime image inventories | Retained exact-image CycloneDX records cover 3,955/5,290 components for local ARM64 runtime/rendered and 3,956/5,269 for final hosted AMD64; hashes/schema validated and overlapping counts must not be added |
| Cleanup | Changed TypeScript/TSX/JavaScript files pass Prettier; `git diff --check` passes; scratch reports/backups remain under ignored `data/` |
| Exact release/build | Final release review `b924a8e2b60e57090785dfa4c85e80f9a4ab2cb87ae33fd0baaf37b57d26962f` verified against the final root build, unchanged reviewed snapshot and three current SBOMs |

Tests use fixture responses and temporary databases for mutations. The actual review-panel check logs into the local API but makes no listing, duplicate-decision or workspace changes. Screenshots and detailed logs are under ignored `data/p1p2/`.

## Final inventory scan

The final scan is run `33a33a91-bbd8-4642-86ee-a50c33581938`, started at `2026-09-08T17:12:55.717Z` with `npm run refresh -- --cache-hours=1`. This requests fresh older inventory/detail pages while allowing captures less than one hour old to be reused. Robots checks, source delays, page limits and rotating detail budgets remain enforced.

Completed at **17:50:23.512 UTC**: all twelve inventories passed quality gates, with no inventory caps. Eleven sources completed fully; Huber supplied 31 accepted records but one detail returned HTTP 403. The run fetched **352 pages**, reused **15 recent captures**, completed **76 inventory pages and 291 detail pages**, and intentionally deferred three OnlyInboards details. It added **55 records**, recorded **10 asking-price changes**, and recorded zero removals. The 37-minute run ended partial and correctly preserved the prior snapshot.

After inspecting the bounded detail failure, a separately backed-up reviewed export activated **1,593 real ads** at **17:51:33 UTC**, preserving `partial: true` and the fresh scan ID. The denied endpoint was not retried. The new dataset has **1,577 active ads**, **1,162 active nearby ads**, and **75 grouped nearby shortlist results**. Three multi-ad groups contain nine ads; one newly matched HIN group complements the two reviewed groups. See [LIVE_DATA.md](LIVE_DATA.md) for exact source/preset counts and snapshot hash. The original pipeline report and separate `data/p1p2/reviewed-partial-export.json` remain truthful, distinct records.

## Test-isolation incident and correction

An earlier attempt, run `81951f9a-953e-45fe-9d57-1eb26bfec47b`, was interrupted around 17:02 UTC. A new publication test imported a database client before selecting its temporary database; its job-lock fixture cleanup removed the live collector lease. The collector detected the lost lease, stopped, and preserved the prior website snapshot.

Read-only comparisons with verified start/pre-refresh backups confirmed **1,590 listing rows (1,538 real and 52 samples), eight saved searches and 1,497 price-history rows** remained intact, with no notes/favorites lost. The six deliberately reviewed identity decisions remained. Only job-lock records were affected by that test. The successor scan reconciled the abandoned ingest run.

The fix now assigns isolated temporary databases before test modules import, captures the approved URL at client construction, and validates ORM and migration subprocess paths. Live/workspace paths and symlink escapes are rejected in test context. The new suites also assert the actual attached SQLite path. The full 198-test suite passed with this guard. The interrupted run is retained as failure evidence and is not counted as a successful inventory scan.

## Coverage of the checks

- Filters, unknown values, radii, lake limits, active/sold semantics, prices and sample separation; inclusive 21-foot eligibility before detail collection and Huber's Nautique preset classification.
- Source pagination, field ambiguity, sale versus MSRP, quote-only prices, offsite locations, robots/network limits, retained-detail observation precedence, staging quality gates and rotating/backoff state.
- HIN normalization/conflicts, reviewed same/different decisions, stable vessel identity through merge/split/alias changes, preserved ad-level notes/history and local image evidence.
- Field provenance, actual-boat override/undo and stale-write protection; route cache/expiry/provider restrictions; shared geocoder spacing/backoff and lake-rule evidence invalidation.
- Worker singleton/heartbeat/fencing, cancellation, CLI exit codes, interrupted-report recovery, alert baselines/events/per-channel retry and API shutdown during delivery.
- Reviewed parser captures/diffs and exact-hash apply; stale parser/config/database rejection and preserved apply manifests.
- Retention hash/reference/symlink protections, protected backups/evidence, first/latest price preservation, free-space checks, and verified restore into a new directory.
- Snapshot privacy whitelisting, immutable body/pointer integrity, renewable publication leases, committed-pointer recovery, legacy alias preservation, release approval/source/SBOM/build correspondence and rollback preconditions.
- Browser-scoped workspaces, revision-aware merge/replace, chunked imports/failure manifests and escaped comparison exports.

## Repository and deployment checkpoint

The owner reviewed the local site and authorized committing/pushing. GitHub Pages creation was attempted with workflow builds in the existing private repository. GitHub returned **HTTP 422: “Your current plan does not support GitHub Pages for this repository.”** Repository visibility was preserved. The available website is **http://127.0.0.1:4310**; the approved exact-hash release is prepared for a later Pages-compatible account/repository decision.

The main implementation was committed and pushed as `fa8a04c`. [Its first hosted validation run](https://github.com/PNelsonFTP/BoatMarket/actions/runs/34260064907) passed both Linux AMD64 container builds, exact-image inventories and smoke checks, including rendered-browser execution. Application tests failed on Ubuntu and Windows: fresh checkouts correctly omit the private publication journal, which the snapshot reader had incorrectly required; Windows also exposed short-path canonicalization, line-ending hash and generated target-path errors.

The compatibility correction in `3ed053f` validates imported public generations independently, preserves their verified snapshot/pointer in backups, and never fabricates a local activation record. Corrupt present journals and changed generation bytes remain errors. Native Windows canonical paths retain strict temporary-database containment; service templates use their target platform's paths; Git preserves LF for hashed text. Release fingerprints now include deployment/build configuration and normalize paths before ordering. CI verifies the committed approved release before regenerating SBOMs.

[The second hosted run](https://github.com/PNelsonFTP/BoatMarket/actions/runs/34261106388) passed Ubuntu's unit/SBOM/browser checks and both AMD64 container jobs. Windows passed 209 tests, including the native alias regression, but exposed one remaining backup destination preflight that compared native paths with a literal forward slash. The final correction uses native relative-path containment and tests all three forbidden roots and their descendants before any SQL executes.

[Final hosted run 34261682769](https://github.com/PNelsonFTP/BoatMarket/actions/runs/34261682769), for commit `5b8c05c89de2a098405b05cf598a8cae307678f6`, completed **successfully across all four jobs on September 8 at 18:26:48 UTC**. Its completed job outcomes and logs were retrieved on September 10 to finish this interrupted handoff; these are September 8 execution results, not a new validation run.

| Final hosted job | Confirmed result |
|---|---|
| Windows application, Node 22 | **211 unit/integration tests across 35 files passed; 20 Chromium browser tests passed.** Typecheck, SBOM generation/schema validation and production build passed |
| Ubuntu application, Node 22 | **210 unit/integration tests across 35 files passed; one Windows-only alias test skipped; 20 Chromium browser tests passed.** Typecheck, SBOM generation/schema validation and production build passed |
| Linux AMD64 runtime container | Build, non-root migration/authentication/static-snapshot/native smoke, exact-image inventory and artifact upload passed |
| Linux AMD64 rendered container | Build, the same smoke checks plus the JavaScript browser fixture, exact-image inventory and artifact upload passed |

The unchanged downloaded container artifacts and their workflow association are retained in [sbom/runtime/ci-2026-09-08.json](sbom/runtime/ci-2026-09-08.json); their exact image IDs, hashes and schema checks are documented in [SBOM.md](SBOM.md).

## Practical limits and deferred execution

The tested ARM64 image digests and source-lock hashes are recorded in [SBOM.md](SBOM.md); those image results do not claim that later application edits are present in an earlier captured image. The final hosted run adds actual AMD64 evidence and successful Windows/Ubuntu application checks; the earlier portability failures and their corrections remain recorded above. Docker collection/connected database views work, but shared app/worker snapshot export is deferred; leave container automatic export off and rebuild from a host-generated snapshot for standalone data updates.

No persistent OS service, public geocoder permission, external routing account, SMTP/webhook destination or public Pages release was enabled. Local/provider fixtures do not prove external delivery or machine-specific scheduler installation. The optional WebMCP path was not exercised because the test browser did not expose `document.modelContext`. No OS vulnerability scan is implied by an npm audit or component inventory.

Source-published specifications, boat location, seller availability and Lake Holiday registration still require confirmation. The current rule screen references the association's publicly linked December 2, 2025 document; the PDF's reviewed hash and exact scope are retained. Blocked marketplaces and unresolved cross-listings remain in [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md) and [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md).

## Reproduce

```bash
npm run setup
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run sbom
```

Use `NEXT_PUBLIC_BASE_PATH=/BoatMarket npm run build`, then `node scripts/verify-pages.mjs` for the Pages path. Rebuild without that environment variable afterward. With `npm start` serving port 4310, `node scripts/verify-review-tools.mjs` inspects actual review panels and `node scripts/verify-live-data.mjs` checks snapshot counts/presets. Both accept `QA_BASE_URL` and `QA_OUTPUT`; the review-panel backend remains local port 4310. These scripts read `.env` internally without printing the password. See [OPERATIONS.md](OPERATIONS.md) for refresh, backup, restore, Docker and release commands.
