# Live inventory — September 24, 2026

The configured-source refresh retained **1,917 real ads: 1,820 active, 18 sold and 79 stale**, with **250 newly indexed ads**, **85 price changes (73 decreases)** and **80 status changes** versus September 12. **1,495 ads were observed during this run; 422 retain earlier observation dates.** These are advertisement counts, not independently verified available boats. Newly indexed does not necessarily mean newly advertised or a distinct physical boat.

The reviewed snapshot is staged for publication. Deployment evidence will be recorded in [VALIDATION.md](VALIDATION.md). The original collection outcome and source observation dates remain in the exported snapshot. A verified backup protects the prior data. No search presets, source access policies, duplicate decisions or dependencies changed.

## Current inventory

1,698 active ads have a price; 1,344 active ads have source coordinates within 150 straight-line miles of Lake Holiday. 28 active ads have unknown coordinates. The 52 fictional samples remain separate and are excluded from publication.

| Source | Retained ads | Observed this run | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Bass Boat Central | 65 | 64 | 65 | 20 |
| Bedford Sales & Outdoors | 19 | 19 | 19 | 18 |
| Craigslist | 1126 | 794 | 1059 | 927 |
| Fox Lake Harbor | 49 | 42 | 49 | 49 |
| Gordy’s Marine | 35 | 35 | 35 | 28 |
| Huber’s Marine | 31 | 0 | 29 | 29 |
| Lake County Watersports | 28 | 24 | 27 | 27 |
| Miller’s Sport Center | 24 | 24 | 18 | 18 |
| OnlyInboards | 437 | 396 | 428 | 137 |
| Quest Watersports | 8 | 8 | 8 | 8 |
| Starved Rock Marina | 30 | 29 | 18 | 18 |
| Ted’s Boatarama | 65 | 60 | 65 | 65 |
| **Total** | **1917** | **1495** | **1820** | **1344** |

Records absent from this pass retain their original dates. The existing 14-day threshold marks older active records stale; stale is not evidence of a sale. A fresh inventory summary does not establish that every detail field was reverified.

## Lake Holiday searches

Home remains **41.6180404, -88.6682705**. Factory presets are unchanged, including the fishing preset's 200+ hp minimum. Presets overlap; do not add their counts together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 74 | 74 |
| Fishing · 200+ hp · nearby | 18 | 18 |
| MasterCraft & peers · up to 21 ft | 48 | 48 |
| Wider search · within 250 mi | 112 | 112 |
| Include unknown lengths · verify first | 92 | 92 |
| All nearby ads · no lake screen | 1344 | 1338 |

Distances are straight-line estimates, not driving times. No routing or public geocoding provider was enabled. There are 5 multi-ad groups containing 13 ads and 1909 research records in the full pool. Duplicate decisions were preserved; cross-listings may remain.

## Full-scan evidence

Run `cf08b587-6440-4848-99a7-2b913b7082ba` ran **2026-09-24T12:12:01.948Z–2026-09-24T12:58:53.300Z**. Outcome: **partial**; 11/12 inventory quality gates passed. Final source attempts fetched **316 fresh pages**, reused **16 cached pages**, and completed **72 inventory pages / 260 detail pages**. There were 0 failed details, 0 deferred details, 0 details under backoff and 0 inventory caps.

The original twelve-source pass (`be3e20ab-e166-420c-bc19-02271711ddad`) encountered a temporary DNS interruption at Lake County, Ted’s, Gordy’s and Bass Boat Central. A targeted recovery pass (`dcc0b4bd-18c8-459d-948e-1413a6699ccd`) completed all four sources successfully after DNS recovered and normal detail backoff elapsed. Neither original report was overwritten. The reviewed multi-pass ID above links both reports in the private session summary. Across both attempts, 332 fresh pages and 16 cache hits were recorded; 6 initial detail failures recovered. Counts below use each source's final result and additions from both passes.

The private run configuration raised OnlyInboards' detail budget from 100 to 150, as in the previous refresh. Permanent configuration remains unchanged.

`SOURCE_CONFIG=data/refresh-2026-09-24/sources.json npm run refresh -- --cache-hours=1`

| Source | Outcome | Ads found this run | Newly indexed |
|---|---|---:|---:|
| Craigslist | success | 794 | 187 |
| Bedford Sales & Outdoors | success | 19 | 2 |
| OnlyInboards | success | 396 | 44 |
| Miller’s Sport Center | success | 24 | 2 |
| Huber’s Marine | error | 0 | 0 |
| Fox Lake Harbor | success | 42 | 5 |
| Lake County Watersports | success | 24 | 1 |
| Ted’s Boatarama | success | 60 | 2 |
| Gordy’s Marine | success | 35 | 3 |
| Bass Boat Central | success | 64 | 3 |
| Starved Rock Marina | success | 29 | 0 |
| Quest Watersports | success | 8 | 1 |

Source errors:

- Huber’s Marine: https://www.hubersmarine.com/search/inventory/availability/In%20Stock: Source returned HTTP 403
- Huber’s Marine: Quality gate: Parsed 0 records, below required 1
- Huber’s Marine: Quality gate: Inventory fell from 31 to 0, exceeding the configured drop limit
- Huber’s Marine: Quality gate: price coverage 0% below required 50%
- Huber’s Marine: Quality gate: location coverage 0% below required 95%
- Huber’s Marine: Quality gate: identity coverage 0% below required 95%

Snapshot generated **2026-09-24T12:59:02.743Z**, **9,442,829 bytes**, SHA-256 `e2b2c16193e5841cf802fbd622fda3cb9faea786f41e65e249a39a1417783132`. Observation range: 2026-09-08T01:17:51.923Z–2026-09-24T12:58:52.971Z. Exact release review: `62c1caee3ca05beb0c14fc3017c1f739a7d526e734cf616ac1b65ce181f7b25b`.

Release review found 0 blocking issues. Its 118 possible source-contact ads were reviewed: 3 ads have contact values absent from the prior snapshot, and 114 contact-containing ads have changed text. Private workspace fields, secrets, raw captures, samples and manual location evidence are excluded. Source, lockfile and three SBOM artifact hashes match the prior release; no fresh dependency audit is claimed.

Private run reports, reviews, backups and verification evidence are retained under ignored `data/refresh-2026-09-24/` and `data/refresh-runs/`. Restricted marketplaces and unsupported sources remain coverage gaps. This refresh covers the twelve enabled sources; it is not an exhaustive new source-discovery search. See [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).

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
