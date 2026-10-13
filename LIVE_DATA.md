# Live inventory — October 13, 2026

The refresh retained **2,326 real ads: 1,769 active, 19 sold and 538 stale**, with **64 newly indexed ads**, **22 price changes (19 decreases)** and **54 status changes** compared with October 9. These comprise 53 age-based active-to-stale transitions and one source-reported active-to-sold transition. **1,462 ads were observed during this run; 864 retain earlier observation dates.** These are advertisement counts, not independently verified available boats. Newly indexed does not necessarily mean newly advertised or a distinct physical boat.

The reviewed snapshot is staged for publication. Deployment evidence will be recorded in [VALIDATION.md](VALIDATION.md). A verified backup protects the earlier data. The exported snapshot preserves the collection outcome and observation dates. Search presets, source access policies, duplicate decisions and dependencies are unchanged.

## Current inventory

1,621 active ads have a price; 1,251 active ads have source coordinates within 150 straight-line miles of Lake Holiday. 37 active ads have unknown coordinates. The 52 fictional samples remain separate and excluded from publication.

| Source | Retained ads | Observed this run | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Bass Boat Central | 68 | 63 | 66 | 19 |
| Bedford Sales & Outdoors | 21 | 20 | 21 | 20 |
| Craigslist | 1402 | 735 | 984 | 862 |
| Fox Lake Harbor | 59 | 46 | 48 | 48 |
| Gordy’s Marine | 35 | 0 | 33 | 28 |
| Huber’s Marine | 31 | 0 | 0 | 0 |
| Lake County Watersports | 28 | 24 | 24 | 24 |
| Miller’s Sport Center | 24 | 24 | 18 | 18 |
| OnlyInboards | 553 | 457 | 490 | 147 |
| Quest Watersports | 8 | 7 | 8 | 8 |
| Starved Rock Marina | 31 | 29 | 17 | 17 |
| Ted’s Boatarama | 66 | 57 | 60 | 60 |
| **Total** | **2326** | **1462** | **1769** | **1251** |

Ads absent from this pass retain their original dates. The existing 14-day threshold marks older active records stale; stale is not evidence of a sale. A fresh inventory summary does not establish that every detail field was reverified.

## Lake Holiday searches

Home remains **41.6180404, -88.6682705**. Factory presets are unchanged, including the fishing preset's 200+ hp minimum. Presets overlap; do not add their counts together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 74 | 74 |
| Fishing · 200+ hp · nearby | 15 | 15 |
| MasterCraft & peers · up to 21 ft | 52 | 52 |
| Wider search · within 250 mi | 111 | 111 |
| Include unknown lengths · verify first | 91 | 91 |
| All nearby ads · no lake screen | 1251 | 1247 |

Distances are straight-line estimates, not driving times. No routing or public geocoding provider was enabled. There are 5 multi-ad groups containing 13 ads and 2318 research records in the full pool. Duplicate decisions were preserved; cross-listings may remain.

## Full-scan evidence

Huber’s and Gordy’s inventory endpoints again returned HTTP 403; their 31 and 35 retained ads keep original observation dates. Huber’s ads remain stale; Gordy’s has 33 active and two stale under the unchanged age policy. All ten accessible sources completed successfully and passed their quality gates. Fresh Craigslist captures contain three Decatur ads and two Champaign–Urbana ads, with no parser warnings today. A separately backed-up export preserves the explicitly partial outcome. No denied access was bypassed.

Reviewed multi-pass session `3cb59579-7c41-46d5-9c49-8616f8704472` ran **2026-10-13T12:26:18.299Z–2026-10-13T13:07:56.772Z**. Outcome: **partial**; 10/12 inventory quality gates passed. The initial twelve-source pass `53dc27a0-a4b9-4cb1-8370-c8f0bb62c20e` recorded **372 fresh fetches**, **0 cache hits**, **71 successful inventory pages** and **301 successful detail pages**, with 2 OnlyInboards details deferred by the 150-page budget. A permitted completion pass `eb8865ff-899f-404e-99d1-f2d0c340e7fd` used a private 200-detail budget, reused **163 captures with their original observation dates** and fetched **2 additional details**. All **303 eligible details** are covered in the final per-source reports, with zero failed details, remaining deferrals, backoff skips or inventory caps. Across both passes: **374 fresh fetches**, **163 cache hits**, **84 successful inventory-page operations** and **453 successful detail-page operations**; repeated cached operations are not additional unique pages. Original component reports are preserved.

The initial private run configuration raised OnlyInboards' detail budget from 100 to 150. The cached completion pass used 200 to cover the two remaining details. Permanent source configuration remains unchanged.

`SOURCE_CONFIG=data/refresh-2026-10-13/sources.json npm run refresh -- --cache-hours=1`

| Source | Outcome | Ads found this run | Newly indexed |
|---|---|---:|---:|
| Craigslist | success | 735 | 47 |
| Bedford Sales & Outdoors | success | 20 | 0 |
| OnlyInboards | success | 457 | 16 |
| Miller’s Sport Center | success | 24 | 0 |
| Huber’s Marine | error | 0 | 0 |
| Fox Lake Harbor | success | 46 | 0 |
| Lake County Watersports | success | 24 | 0 |
| Ted’s Boatarama | success | 57 | 0 |
| Gordy’s Marine | error | 0 | 0 |
| Bass Boat Central | success | 63 | 1 |
| Starved Rock Marina | success | 29 | 0 |
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

Snapshot generated **2026-10-13T13:09:11.828Z**, 16,654,758 bytes, SHA-256 `c4ffefe0ecaf403c590ea6311539b5608168b56ddcf7b7f8fff176230c10105b`. Observation range: 2026-09-08T01:17:51.923Z–2026-10-13T13:07:50.368Z. Exact release review: `cb42d172c55f01d9b17b38759e023bdcb7e8487c9eeca8ff3ce30f8980fba85a`.

Release review found 0 blocking issues. The 128 possible source-contact ads were reviewed, including 1 ads with contact values absent from the prior snapshot. Private workspace fields, secrets, raw captures, samples and manual location evidence are excluded. Source, lockfile and all three SBOM hashes match the prior release; no fresh dependency audit is claimed.

Private run reports, backups and verification evidence are under ignored `data/refresh-2026-10-13/` and `data/refresh-runs/`. Restricted marketplaces and unsupported sources remain coverage gaps. This refresh covers all twelve enabled sources; it is not an exhaustive new source-discovery search. See [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).

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
