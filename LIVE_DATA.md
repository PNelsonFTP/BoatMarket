# Live inventory — November 4, 2026

The refresh retained **2,717 real ads: 1,679 active, 19 sold and 1,019 stale**, with **51 newly indexed ads**, **16 price changes (16 decreases)** and **101 status changes** compared with the preceding October 30 inventory. Status transitions: active → stale: 101. Age-based staleness is not evidence of a sale. **1,414 ads were observed during this session; 1,303 retain earlier observation dates.** Counts describe advertisements, not independently verified available boats; newly indexed ads can be reposts or cross-listings.

The reviewed snapshot is live on the [public website](https://pnelsonftp.github.io/BoatMarket/). Deployment succeeded and public hash/catalog/build verification completed at **2026-11-04T13:29:14.340Z**. Desktop/mobile website checks are recorded in [VALIDATION.md](VALIDATION.md).

Verified backups protect the earlier data and every collection pass. The snapshot preserves the original partial outcome and capture dates. Lake Holiday search presets, source access policies, duplicate-review decisions, application/dependency source and all three approved source SBOM hashes are unchanged. The site includes the October 21 engineering improvements, including the smaller search catalog, on-demand evidence, import fixes and grouping-basis counts.

## Current inventory

1,516 active ads have a price; 1,134 active ads have source coordinates within 150 straight-line miles of Lake Holiday. 62 active ads have unknown coordinates. The 52 fictional samples remain separate and excluded from publication.

| Source | Retained ads | Observed this session | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Bass Boat Central | 71 | 60 | 63 | 17 |
| Bedford Sales & Outdoors | 24 | 23 | 23 | 23 |
| Craigslist | 1689 | 645 | 864 | 748 |
| Fox Lake Harbor | 66 | 49 | 52 | 52 |
| Gordy’s Marine | 35 | 0 | 0 | 0 |
| Huber’s Marine | 35 | 0 | 26 | 26 |
| Lake County Watersports | 28 | 21 | 23 | 23 |
| Miller’s Sport Center | 24 | 24 | 18 | 18 |
| OnlyInboards | 635 | 496 | 526 | 143 |
| Quest Watersports | 8 | 7 | 7 | 7 |
| Starved Rock Marina | 32 | 30 | 17 | 17 |
| Ted’s Boatarama | 70 | 59 | 60 | 60 |
| **Total** | **2717** | **1414** | **1679** | **1134** |

Ads absent from this session retain their original dates. The unchanged 14-day threshold marks older active records stale. A fresh summary does not establish that every detail field was reverified.

## Lake Holiday searches

Home remains **41.6180404, -88.6682705**. Factory presets are unchanged, including the fishing preset's 200+ hp minimum. Presets overlap; do not add their counts together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 68 | 67 |
| Fishing · 200+ hp · nearby | 15 | 14 |
| MasterCraft & peers · up to 21 ft | 44 | 44 |
| Wider search · within 250 mi | 102 | 101 |
| Include unknown lengths · verify first | 87 | 86 |
| All nearby ads · no lake screen | 1134 | 1133 |

Distances are straight-line estimates, not driving times. No routing or public geocoding provider was enabled. There are 6 multi-ad groups containing 15 ads and 2708 research records in the full pool. Existing duplicate decisions were preserved; unresolved cross-listings can remain.

## Full-scan evidence

Reviewable session **ddd13b2b-fe14-4e3e-9096-dfe7928bba70** ran **2026-11-04T12:40:28.659Z–2026-11-04T13:20:35.968Z**, with 2 bounded collection passes followed by explicit reviewed finalization. Outcome: **partial**; **10/12** inventory outcomes accepted. Accepted-inventory sources cover **290/290** eligible details, with **0** remaining in that scope. Across all source attempts, **0** detail requests failed; attempts from incomplete inventories remain explicitly documented below and in the original reports. All component reports and original capture times are retained; cached observations are not relabeled fresh.

Collection-attempt totals: **362 fresh fetches**, **13 cache hits**, **85 successful inventory-page operations**, and **290 successful detail-page operations**. Repeated operations across passes are not additional distinct ads or pages. Session reports separately reconcile unique URL/capture observations. The supported one-hour cache policy is used throughout; previous multi-day captures were refreshed, while any same-session reuse preserves its original timestamp. Permanent source limits and quality thresholds were not changed.

| Source | Outcome | Parsed ads (including incomplete inventory) | Newly indexed | Eligible details completed |
|---|---|---:|---:|---:|
| Craigslist | success | 645 | 33 | 66/66 |
| Bedford Sales & Outdoors | success | 23 | 0 | 23/23 |
| OnlyInboards | success | 496 | 16 | 156/156 |
| Miller’s Sport Center | success | 24 | 0 | 24/24 |
| Huber’s Marine | partial / restricted | 0 | 0 | 0/0 |
| Fox Lake Harbor | success | 49 | 1 | 10/10 |
| Lake County Watersports | success | 21 | 0 | 7/7 |
| Ted’s Boatarama | success | 59 | 0 | 4/4 |
| Gordy’s Marine | partial / restricted | 0 | 0 | 0/0 |
| Bass Boat Central | success | 60 | 1 | 0/0 |
| Starved Rock Marina | success | 30 | 0 | 0/0 |
| Quest Watersports | success | 7 | 0 | 0/0 |

Remaining coverage gaps:

- **Huber’s Marine:** inventory rejected; 0 unresolved accepted-inventory details, plus 0 failed detail attempts from unaccepted inventories. Recorded reasons: access-denied, quality. Inventory request result: Source returned HTTP 403. No ads from this source were observed this session; retained ads and detail fields keep their original dates.
- **Gordy’s Marine:** inventory rejected; 0 unresolved accepted-inventory details, plus 0 failed detail attempts from unaccepted inventories. Recorded reasons: access-denied, quality. Inventory request result: Source returned HTTP 403. No ads from this source were observed this session; retained ads and detail fields keep their original dates.

Blocked or challenged endpoints are not retried as transient failures. Their prior ads remain available with the proper age/status. This refresh covers the twelve enabled sources; it is not an exhaustive new-source discovery search. [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) records these gaps and older disabled-source research separately.

## Reviewed publication

Snapshot generated **2026-11-04T13:20:37.951Z**, 24,858,909 formatted bytes, SHA-256 **802c9a09fb2acbf4384f02b82cc70a0eb5d27b620fc94aa1127dc39e887387e3**. Observation range: 2026-09-08T01:17:51.923Z–2026-11-04T13:20:10.002Z. Exact release review: **24ecb3d5b5daae39eea8b58a6edb78b36808fa14eb2ae56d3223add7203f4217**. Application source fingerprint: **21a235515d6798bc0289b251f9a2734a136be3b29613abeb42355dd6a1618abe**. The initial catalog is 6,479,208 bytes at **a8bb441a01edb2428afc7866bc4b0b8a70b9504cee80d5146352d683e9dfc391**; canonical and evidence files remain verified immutable objects.

Release review found **0 blocking issues**. Partial coverage, older ads and 139 possible source-published contact ads were reviewed explicitly. Private workspace records, credentials, raw payloads, samples, manual location/review evidence and private routes are excluded. Dependency versions and source SBOM artifacts remain unchanged; the latest advisory audit retains its October 21 date, with no new vulnerability-scan claim.

Private reports, backups, contact review, comparisons, browser checks and public provenance are retained under ignored **data/refresh-2026-11-04/** and **data/refresh-runs/sessions/ddd13b2b-fe14-4e3e-9096-dfe7928bba70.json**. No recurring worker, OS service or notification destination was enabled.

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
