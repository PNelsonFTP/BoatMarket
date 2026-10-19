# Live inventory — October 19, 2026

The refresh retained **2,429 real ads: 1,615 active, 19 sold and 795 stale**, with **28 newly indexed ads**, **16 price changes (15 decreases)** and **127 status changes** compared with October 17. All 127 are age-based active-to-stale transitions; no new sale is inferred. **1,460 ads were observed during this run; 969 retain earlier observation dates.** These are advertisement counts, not independently verified available boats. Newly indexed does not necessarily mean newly advertised or a distinct physical boat.

The reviewed snapshot is live on the [public website](https://pnelsonftp.github.io/BoatMarket/) and local website at http://127.0.0.1:4310. Deployment and desktop/mobile verification passed; evidence is recorded in [VALIDATION.md](VALIDATION.md). A verified backup protects the earlier data. The exported snapshot preserves the collection outcome and observation dates. Search presets, source access policies, duplicate decisions and dependencies are unchanged.

## Current inventory

1,469 active ads have a price; 1,115 active ads have source coordinates within 150 straight-line miles of Lake Holiday. 32 active ads have unknown coordinates. The 52 fictional samples remain separate and excluded from publication.

| Source | Retained ads | Observed this run | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Bass Boat Central | 69 | 62 | 65 | 18 |
| Bedford Sales & Outdoors | 21 | 20 | 20 | 19 |
| Craigslist | 1486 | 722 | 874 | 760 |
| Fox Lake Harbor | 63 | 49 | 50 | 50 |
| Gordy’s Marine | 35 | 0 | 0 | 0 |
| Huber’s Marine | 31 | 0 | 0 | 0 |
| Lake County Watersports | 28 | 23 | 24 | 24 |
| Miller’s Sport Center | 24 | 24 | 18 | 18 |
| OnlyInboards | 563 | 464 | 480 | 142 |
| Quest Watersports | 8 | 7 | 7 | 7 |
| Starved Rock Marina | 32 | 30 | 17 | 17 |
| Ted’s Boatarama | 69 | 59 | 60 | 60 |
| **Total** | **2429** | **1460** | **1615** | **1115** |

Ads absent from this pass retain their original dates. The existing 14-day threshold marks older active records stale; stale is not evidence of a sale. A fresh inventory summary does not establish that every detail field was reverified.

## Lake Holiday searches

Home remains **41.6180404, -88.6682705**. Factory presets are unchanged, including the fishing preset's 200+ hp minimum. Presets overlap; do not add their counts together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 67 | 67 |
| Fishing · 200+ hp · nearby | 15 | 15 |
| MasterCraft & peers · up to 21 ft | 43 | 43 |
| Wider search · within 250 mi | 104 | 104 |
| Include unknown lengths · verify first | 84 | 84 |
| All nearby ads · no lake screen | 1115 | 1112 |

Distances are straight-line estimates, not driving times. No routing or public geocoding provider was enabled. There are 5 multi-ad groups containing 13 ads and 2421 research records in the full pool. Duplicate decisions were preserved; cross-listings may remain.

## Full-scan evidence

Huber’s and Gordy’s inventory endpoints again returned HTTP 403; all 31 and 35 retained ads respectively are now stale under the unchanged 14-day policy and keep their original observation dates. All ten accessible sources completed successfully in the final per-source results. The initial Craigslist count-gate failure is preserved below, along with its tested correction and cached recovery. Fresh Decatur and Champaign–Urbana pages contain two and four ads respectively, with no empty-region parser warnings. A separately backed-up export preserves the explicitly partial outcome. No denied access was bypassed.

Reviewed multi-pass session `22b28203-e2b5-443c-aade-4ca47cced336` ran **2026-10-19T12:23:02.862Z–2026-10-19T13:04:33.740Z**. Outcome: **partial**; 10/12 inventory quality gates passed. The initial twelve-source pass `5c0dcec6-bfc3-4799-bdd6-02948ccde9a6` recorded **369 fresh fetches**, **0 cache hits**, **72 successful inventory pages** and **297 successful detail pages**. Its Craigslist import was quarantined because the old count check compared 722 current ads with 1,465 retained historical ads. The collector now compares inventory size with the last completed successful source run (727 ads), retaining the same drop threshold and all historical rows for field-regression checks. Four regression tests cover stable counts, real collapses, first-run fallback and field regressions; type checking and all 218 tests passed locally. The cached recovery pass `d869605f-551e-4480-82b7-2907d27810c8` reprocessed Craigslist and completed any remaining OnlyInboards details, reusing **262 captures with their original observation dates** and fetching **2 additional pages**. All **299 eligible details** are covered in the final per-source reports, with zero failed details, remaining deferrals, backoff skips or inventory caps. Across both passes: **371 fresh fetches**, **262 cache hits**, **101 successful inventory-page operations** and **532 successful detail-page operations**; repeated cached operations are not additional unique pages. Original component reports, including the initial Craigslist quality failure, are preserved.

The initial private run configuration raised OnlyInboards' detail budget from 100 to 150. The cached recovery pass used a private 200-detail budget to finish two remaining OnlyInboards details. Permanent source configuration and quality thresholds remain unchanged.

`SOURCE_CONFIG=data/refresh-2026-10-19/sources.json npm run refresh -- --cache-hours=1`

| Source | Outcome | Ads found this run | Newly indexed |
|---|---|---:|---:|
| Craigslist | success | 722 | 21 |
| Bedford Sales & Outdoors | success | 20 | 0 |
| OnlyInboards | success | 464 | 1 |
| Miller’s Sport Center | success | 24 | 0 |
| Huber’s Marine | error | 0 | 0 |
| Fox Lake Harbor | success | 49 | 4 |
| Lake County Watersports | success | 23 | 0 |
| Ted’s Boatarama | success | 59 | 0 |
| Gordy’s Marine | error | 0 | 0 |
| Bass Boat Central | success | 62 | 1 |
| Starved Rock Marina | success | 30 | 1 |
| Quest Watersports | success | 7 | 0 |

Source errors:

- Huber’s Marine: https://www.hubersmarine.com/search/inventory/availability/In%20Stock: Source returned HTTP 403
- Huber’s Marine: Quality gate: Parsed 0 records, below required 1
- Huber’s Marine: Quality gate: Inventory fell from 31 to 0, exceeding the configured drop limit
- Huber’s Marine: Quality gate: price coverage 0% below required 50%
- Huber’s Marine: Quality gate: location coverage 0% below required 95%
- Huber’s Marine: Quality gate: identity coverage 0% below required 95%
- Gordy’s Marine: https://www.gordysboats.com/wisconsin-all-boat-inventory/: Source returned HTTP 403
- Gordy’s Marine: Quality gate: Parsed 0 records, below required 1
- Gordy’s Marine: Quality gate: Inventory fell from 35 to 0, exceeding the configured drop limit

Snapshot generated **2026-10-19T13:05:08.428Z**, 18,602,774 bytes, SHA-256 `d747dbd5f9f89e9fd928ea7b22eb972a02a80057d9983b5bf89554fb5fc942aa`. Observation range: 2026-09-08T01:17:51.923Z–2026-10-19T13:04:25.736Z. Exact release review: `e0df6ec3eafd67f509687623addfb46d01ea6f4f432f269b09e401b3233235db`.

Release review found 0 blocking issues. The 131 possible source-contact ads were reviewed, including 1 ad with contact values absent from the prior snapshot. Private workspace fields, secrets, raw captures, samples and manual location evidence are excluded. The source hash records the inventory-baseline correction; the lockfile and all three SBOM artifact hashes match the prior release. No fresh dependency audit is claimed.

Private run reports, backups and verification evidence are under ignored `data/refresh-2026-10-19/` and `data/refresh-runs/`. Restricted marketplaces and unsupported sources remain coverage gaps. This refresh covers all twelve enabled sources; it is not an exhaustive new source-discovery search. See [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).

## Lake rules


The association's publicly linked [December 2, 2025 rulebook](https://engage.goenumerate.com/s/lakeholiday/files/4219/dyn139681/Rules%20and%20Reg%2012_2_2025%20revised.pdf) was reviewed September 8, 2026. Section 4.15 permits hulled boats **up to 21.0 ft inclusive**, using manufacturer US specifications and counting molded platforms. Bolt-on platforms are accessories; pontoons have a separate 28-ft limit. Installed power cannot exceed the capacity plate. Wake-enhancer use and wakesurfing remain prohibited.

The document hash, reviewed sections/date and verification scope are recorded in `lib/lake-verification.ts`. This supersedes the earlier 2024 under-21 reference used in the initial build. Advertised rounded lengths, molded platforms and association registration still require confirmation. Source listings do not establish lake approval.

## Refresh and review

For another refresh from Cursor or a terminal in this folder:

```bash
npm run refresh -- --cache-hours=1
```

Inspect the run report and Source health. A successful pipeline backs up, collects, validates and activates a local snapshot. Partial/failed results preserve the prior website snapshot unless the operator explicitly reviews and permits an accepted partial export. Exporting separately must preserve the original run’s partial status and observation dates.

Before building a reviewed snapshot, prepare and approve its exact release hash using the procedure in [OPERATIONS.md](OPERATIONS.md), then run `npm run build` and `npm start`. The standalone website serves the rebuilt snapshot; an already running backend should be restarted only when its code changes. The source collection command does not commit or publish.

No recurring worker, service or notification destination was enabled by this refresh. `WORKER_INTERVAL_MINUTES=1440` is daily and `10080` is weekly while the worker/machine runs; the existing default remains 30 minutes. `WORKER_AUTO_EXPORT=true` enables local snapshot export, with build/deployment still separate. Raw captures and private workspace data remain local. Source photos remain hosted by their source sites; map/city data use [OpenStreetMap attribution](https://www.openstreetmap.org/copyright).
