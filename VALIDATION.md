# Verification record

Dated September 8, September 10 and September 12, 2026 evidence, America/Chicago. The September 8 implementation/CI and scan results remain historical; the September 10 and September 12 refreshes are recorded separately below. Local September 8 checks used Node 26.7/npm 11.19 on macOS; the supported minimum remains Node 22.12. Captured Docker runtime checks used Node 22.23.2 on Linux ARM64. This document records actual checks, not a guarantee of marketplace completeness.

The owner requested winding down enhancements, reviewed the local website, and then authorized the final commit/push. The completed repository/deployment checkpoint is recorded below. The original P1 Market criterion for reviewed-versus-HIN grouping classification remains explicitly deferred. Current ad/group counts and the limitation are visible in Market and documented in [P1_P2_IMPLEMENTATION.md](P1_P2_IMPLEMENTATION.md).

## September 12 inventory refresh

Collection run `45193ea2-80fb-483c-a267-d1ded9697538` completed 2026-09-12T12:40:58.254Z. All twelve quality gates passed; 76 inventory pages and 283 detail pages succeeded, with zero cache hits, inventory caps or deferred detail work. One Huber’s Bennington detail returned HTTP 403. The explicitly partial result contains 1,667 ads (1,650 active / 17 sold), 31 additions, twelve price decreases and no status changes versus September 10. A separate verified backup and reviewed export preserve the original partial outcome and source observation dates.

Snapshot SHA-256: `69bff7be8fa212c87dcda5a15bd1e95b05e4e2cd8fcaf65f41aa22054f7985ee`; generated 2026-09-12T12:41:36.941Z; 7,916,788 bytes. Review `f424016f9d77a1d393bfb9eb7fc2de110239f95e8408650dfdf8030aec2bc3ec` passed schema/privacy/source/SBOM checks. Source hash remains `004f34817bf307ee42ef67cbbbd121bd7a79fc467d24de80727411b744a596f4`; lockfile and dependency artifacts are unchanged. All possible contact text was already present in the previous reviewed snapshot. Production build and exact built-output verification passed. Local startup first hit the filesystem sandbox’s port-binding restriction; it was rerun with network/listen permission without changing application code.

Local desktop/mobile checks passed at **2026-09-12T12:42:47.276Z**: exact served snapshot hash, 1,667-ad banner, loaded image, 75 default grouped results, 52 ski results, 16 fishing results, no runtime errors or horizontal overflow. The desktop screenshot was inspected. Operations reported no active locks or queued jobs. [Pages run 34694488481](https://github.com/PNelsonFTP/BoatMarket/actions/runs/34694488481) successfully deployed commit `e6a83dd300269298f4758d330d5f115cdf3661bc`. Its Node 22 checks passed typecheck and **214 tests across 36 files**, with one Windows-only test skipped, followed by build and exact release verification. Public desktop/mobile checks passed at **2026-09-12T12:46:36.964Z**, confirming the exact 1,667-ad snapshot hash, images, 75 default / 52 ski / 16 fishing grouped results, no runtime errors and no horizontal overflow. The public build provenance matches the review, source, snapshot, commit and workflow run. The mobile screenshot was inspected. The final database audit retained 52 samples and eight saved searches, with zero unfinished ingestion runs and active locks; local health returned HTTP 200. Detailed private logs and comparisons live under `data/refresh-2026-09-12/`.

## September 10 public repository and live Pages deployment

The owner explicitly requested public repository visibility to use GitHub Pages. GitHub confirmed **PNelsonFTP/BoatMarket is public**; Pages creation succeeded with **GitHub Actions** builds, HTTPS enforcement and URL **https://pnelsonftp.github.io/BoatMarket/**. Repository variable `BOATSCOUT_ENABLE_PAGES=true` enables the existing manual, exact-review-hash workflow. No backend endpoint or password was published; collection and private workspace storage remain local.

A read-only exposure audit examined all six preceding commits, 427 historical blob versions and 273 tracked/pending-public files. It found no actual credentials, private database, backup/archive or private workspace fields in public JSON. The configured local password was absent. Detected credential-shaped strings were setup-generation code and explicit test fixtures. Ignored private data remains outside the commit. This is a bounded inspection, not a guarantee against every possible sensitive string.

Public deployment approval is **`abc34fe3d34418647bf9a0ba1981fb7ea96f2963224e0cead02b10c08775f001`**, with unchanged source hash **`004f34817bf307ee42ef67cbbbd121bd7a79fc467d24de80727411b744a596f4`** and the reviewed **1,636-ad** snapshot **`c9f77dd5b111f9e7626556e4263fd2ef267b3c845191883a0b8c147054fce781`**. The two Huber detail failures, older retained observation dates and source-published advertisement contact text remain explicitly acknowledged. The source/snapshot/SBOM verification passed locally. [Pages run 34547047357](https://github.com/PNelsonFTP/BoatMarket/actions/runs/34547047357) built and deployed commit `e0970f643da20f55170c4c1b341f4665cad9c18e` successfully, finishing at **2026-09-11T00:36:21Z (September 10, 7:36 PM CDT)**. This supersedes the historical private-repository plan limitation; first-party licensing remains `UNLICENSED`.

The public site was verified at **2026-09-11T00:36:46.522Z**. Its downloaded immutable snapshot matched the exact approved SHA-256 and retained the correct partial collection provenance. Published `build-provenance.json` identifies the reviewed source, snapshot, SBOMs, release commit and successful workflow. Both desktop and mobile showed **75 nearby shortlist records, 52 MasterCraft/peer records and 16 premium fishing records**, with loaded source images, no runtime errors, no missing site assets and no horizontal overflow. No backend credentials were entered during public verification. The local build and its matching release verification also passed. Screenshots and logs are in ignored `data/pages-2026-09-10/`.

The Pages build passed **36 test files, 214 tests and one Windows-only skipped test**, typecheck and exact reviewed-release verification before and after building `/BoatMarket/`. The independent [cross-platform validation run 34547038321](https://github.com/PNelsonFTP/BoatMarket/actions/runs/34547038321) also validates the published commit: Ubuntu and both container jobs passed; Windows had passed its unit/SBOM checks and was installing the browser for its remaining checks at the documentation cutoff. The Pages deployment and public-site checks have completed successfully. Documentation-only follow-up commits do not change the reviewed source hash or deployed website.

## September 10 refresh and bounded parser correction

Run `cc9d1814-d2af-4aad-b0d6-d725724b6efa` started at **2026-09-10T20:10:07.604Z** and completed at **20:48:10.130Z**, with outcome **partial**. Its request, original pipeline report, reviewed export, repair preview/apply manifests and focused validation logs are retained under ignored `data/refresh-2026-09-10/`. The one-hour cache setting produced zero cache hits. This run temporarily raised OnlyInboards' detail budget from 100 to 150 in its request-specific source configuration; it did not change the regular source configuration.

| September 10 check | Recorded result |
|---|---|
| Inventory coverage | All **12 source quality gates passed**; **76 inventory pages** and **287 successful detail pages**; **363 freshly fetched pages**, **0 cache hits**, **0 budget deferrals** and no inventory caps |
| Access limitations | Two Huber details failed: 2026 Lund Angler 1650 Tiller (`13995181i`) returned HTTP 403; 2017 Lund 1875 Crossover XS (`14556994i`) returned an access challenge. Neither restriction was bypassed |
| Inventory changes | **43 newly indexed ads**, **33 asking-price changes including 32 drops**, and **one active-to-sold change**; zero removals |
| Retained database pool | **1,636 real ads: 1,619 active, 17 sold**; **1,557 observed this run**, **79 retained from earlier observations**; **1,194 active within 150 straight-line miles** of Lake Holiday |
| Classification regression checks | **34 tests across five files passed**, including four `tige-pwc.test.ts` cases; `npm run typecheck` passed |
| Reviewed record repairs | **Eight** narrow make/model/category corrections from current captures, with a verified backup, exact record fingerprints and before/after evidence; completed at **20:49:00.179Z** |
| Snapshot and release | Reviewed partial snapshot activated locally; `npm run build` and exact reviewed-release verification with `--built=out` passed |
| Desktop/mobile website | Both showed **1,636 ads**, **12 sources**, **75 shortlist records**, **1,189 grouped nearby records** and **93 unknown-length review records**; zero page errors, readable layouts and no horizontal overflow. Authenticated backend connection passed |
| Final HTTP/database audit | At **20:51:56.239Z**, `/api/health` returned **200** and served snapshot bytes matched the reviewed hash; database retained **1,636 real ads**, **52 samples**, **8 saved searches**, **0 unfinished ingestion runs** and **0 active job locks** |

The correction prevents `Tiger`/`TIGER` from matching the make `Tige`, keeps compact genuine names such as `Tige21`, and prioritizes explicit PWC/jet-ski/WaveRunner labels before generic ski terms without treating every jet boat as personal watercraft. Record IDs and source observation timestamps are preserved. The eight repairs are limited to their reviewed evidence; they do not claim broad cleanup of ambiguous accessories or engine-brand inference. The 2027 Vexus ADX200 title mentioning a Yamaha engine still illustrates an unresolved make-inference error.

The original partial pipeline correctly preserved the prior website snapshot. A separate backed-up reviewed export produced **1,636 ads**, **7,007,261 bytes**, at **2026-09-10T20:49:20.464Z**, with SHA-256 `c9f77dd5b111f9e7626556e4263fd2ef267b3c845191883a0b8c147054fce781`. It preserves the run ID, `partial: true` and observation range **2026-09-08T01:17:51.923Z–2026-09-10T20:48:10.017Z**. Release review `5d40bdfb0d2827728c4fcb8a1f1860a5010a56f35dbfa00dfa64e3459b418233` records source hash `004f34817bf307ee42ef67cbbbd121bd7a79fc467d24de80727411b744a596f4`. The final HTTP audit confirmed that the restarted local website serves this exact generation with its partial status intact.

The production build, release check, desktop/mobile checks and final audit are recorded in `build.log`, `release-verification.log`, `ui-verification.log` and `final-checkpoint.json` under `data/refresh-2026-09-10/`. Desktop/mobile fishing and ski views each displayed twelve cards on their current page; these are pagination counts, not their total search results. At that local-review checkpoint, the refresh had not yet been committed, pushed or publicly deployed; the subsequent public Pages decision is recorded above. The earlier handoff documentation commit `8df1000` was already pushed before the scan finished.

The dependency lock is unchanged. The successful September 8 hosted CI and captured images below cover commit `5b8c05c`; they do not validate or contain the later parser correction.

## September 8 integrated results

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

## September 8 final inventory scan

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

The owner reviewed the local site and authorized committing/pushing. GitHub Pages creation was attempted with workflow builds in the existing private repository. GitHub returned **HTTP 422: “Your current plan does not support GitHub Pages for this repository.”** Repository visibility was preserved. At that September 8 checkpoint, the available website was **http://127.0.0.1:4310**; the September 10 public visibility decision and Pages setup are recorded above.

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

At the September 8 checkpoint, no persistent OS service, public geocoder permission, external routing account, SMTP/webhook destination or public Pages release had been enabled. Local/provider fixtures do not prove external delivery or machine-specific scheduler installation. The optional WebMCP path was not exercised because the test browser did not expose `document.modelContext`. No OS vulnerability scan is implied by an npm audit or component inventory.

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
