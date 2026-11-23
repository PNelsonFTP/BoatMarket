# Live inventory — November 23, 2026

The refresh retained **2,928 real ads: 1,452 active, 21 sold and 1,455 stale**, with **97 newly indexed ads**, **24 price changes (22 decreases)** and **153 status changes** compared with the preceding November 14 inventory. Status transitions: active → stale: 153. Age-based staleness is not evidence of a sale. **1,319 ads were observed during this session; 1,609 retain earlier observation dates.** Counts describe advertisements, not independently verified available boats; newly indexed ads can be reposts or cross-listings.

The reviewed snapshot is live on the [public website](https://pnelsonftp.github.io/BoatMarket/). Deployment succeeded and public hash/catalog/build verification completed at **2026-11-23T13:48:11.462Z**. Desktop/mobile website checks are recorded in [VALIDATION.md](VALIDATION.md).

Verified backups protect the earlier data and every collection pass. The snapshot preserves the original partial outcome and capture dates. Lake Holiday search presets, source access policies, duplicate-review decisions, application/dependency source and all three approved source SBOM hashes are unchanged. The site includes the October 21 engineering improvements, including the smaller search catalog, on-demand evidence, import fixes and grouping-basis counts.

## Current inventory

1,303 active ads have a price; 949 active ads have source coordinates within 150 straight-line miles of Lake Holiday. 54 active ads have unknown coordinates. The 52 fictional samples remain separate and excluded from publication.

| Source | Retained ads | Observed this session | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Bass Boat Central | 71 | 55 | 56 | 13 |
| Bedford Sales & Outdoors | 27 | 23 | 24 | 24 |
| Craigslist | 1856 | 553 | 690 | 595 |
| Fox Lake Harbor | 68 | 52 | 52 | 52 |
| Gordy’s Marine | 35 | 0 | 0 | 0 |
| Huber’s Marine | 35 | 0 | 0 | 0 |
| Lake County Watersports | 30 | 23 | 23 | 23 |
| Miller’s Sport Center | 24 | 23 | 15 | 15 |
| OnlyInboards | 667 | 493 | 507 | 142 |
| Quest Watersports | 8 | 7 | 7 | 7 |
| Starved Rock Marina | 32 | 30 | 17 | 17 |
| Ted’s Boatarama | 75 | 60 | 61 | 61 |
| **Total** | **2928** | **1319** | **1452** | **949** |

Ads absent from this session retain their original dates. The unchanged 14-day threshold marks older active records stale. A fresh summary does not establish that every detail field was reverified.

## Lake Holiday searches

Home remains **41.6180404, -88.6682705**. Factory presets are unchanged, including the fishing preset's 200+ hp minimum. Presets overlap; do not add their counts together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 65 | 65 |
| Fishing · 200+ hp · nearby | 15 | 15 |
| MasterCraft & peers · up to 21 ft | 41 | 41 |
| Wider search · within 250 mi | 94 | 94 |
| Include unknown lengths · verify first | 80 | 80 |
| All nearby ads · no lake screen | 949 | 949 |

Distances are straight-line estimates, not driving times. No routing or public geocoding provider was enabled. There are 6 multi-ad groups containing 15 ads and 2919 research records in the full pool. Existing duplicate decisions were preserved; unresolved cross-listings can remain.

## Full-scan evidence

Reviewable session **8c0439b2-51ef-4db3-b079-7fc5aabc4b92** ran **2026-11-23T13:01:19.173Z–2026-11-23T13:42:07.641Z**, with 2 bounded collection passes followed by explicit reviewed finalization. Outcome: **partial**; **10/12** inventory outcomes accepted. Accepted-inventory sources cover **299/299** eligible details, with **0** remaining in that scope. Across all source attempts, **0** detail requests failed; attempts from incomplete inventories remain explicitly documented below and in the original reports. All component reports and original capture times are retained; cached observations are not relabeled fresh.

Collection-attempt totals: **372 fresh fetches**, **13 cache hits**, **86 successful inventory-page operations**, and **299 successful detail-page operations**. Repeated operations across passes are not additional distinct ads or pages. Session reports separately reconcile unique URL/capture observations. The supported one-hour cache policy is used throughout; previous multi-day captures were refreshed, while any same-session reuse preserves its original timestamp. Permanent source limits and quality thresholds were not changed.

| Source | Outcome | Parsed ads (including incomplete inventory) | Newly indexed | Eligible details completed |
|---|---|---:|---:|---:|
| Craigslist | success | 553 | 88 | 69/69 |
| Bedford Sales & Outdoors | success | 23 | 1 | 23/23 |
| OnlyInboards | success | 493 | 6 | 162/162 |
| Miller’s Sport Center | success | 23 | 0 | 23/23 |
| Huber’s Marine | partial / restricted | 0 | 0 | 0/0 |
| Fox Lake Harbor | success | 52 | 0 | 11/11 |
| Lake County Watersports | success | 23 | 1 | 7/7 |
| Ted’s Boatarama | success | 60 | 1 | 4/4 |
| Gordy’s Marine | partial / restricted | 0 | 0 | 0/0 |
| Bass Boat Central | success | 55 | 0 | 0/0 |
| Starved Rock Marina | success | 30 | 0 | 0/0 |
| Quest Watersports | success | 7 | 0 | 0/0 |

Remaining coverage gaps:

- **Huber’s Marine:** inventory rejected; 0 unresolved accepted-inventory details, plus 0 failed detail attempts from unaccepted inventories. Recorded reasons: access-denied, quality. Inventory request result: Source returned HTTP 403. No ads from this source were observed this session; retained ads and detail fields keep their original dates.
- **Gordy’s Marine:** inventory rejected; 0 unresolved accepted-inventory details, plus 0 failed detail attempts from unaccepted inventories. Recorded reasons: access-denied, quality. Inventory request result: Source returned HTTP 403. No ads from this source were observed this session; retained ads and detail fields keep their original dates.

Blocked or challenged endpoints are not retried as transient failures. Their prior ads remain available with the proper age/status. This refresh covers the twelve enabled sources; it is not an exhaustive new-source discovery search. [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) records these gaps and older disabled-source research separately.

## Reviewed publication

Snapshot generated **2026-11-23T13:42:09.741Z**, 28,617,084 formatted bytes, SHA-256 **d31cf52d6b1da50dcd80bf8659be72f480acf460cc006ba7e7b83c37728fc043**. Observation range: 2026-09-08T01:17:51.923Z–2026-11-23T13:41:48.517Z. Exact release review: **e4157c352651624cd0b412f566e8b1dc56d016b496a22e122131d3e561ce34c4**. Application source fingerprint: **21a235515d6798bc0289b251f9a2734a136be3b29613abeb42355dd6a1618abe**. The initial catalog is 6,982,916 bytes at **92910a70a2d5d530813e50cb9325b821cfde4b4901dfa8c955a3800bed8ed6b1**; canonical and evidence files remain verified immutable objects.

Release review found **0 blocking issues**. Partial coverage, older ads and 150 possible source-published contact ads were reviewed explicitly. Private workspace records, credentials, raw payloads, samples, manual location/review evidence and private routes are excluded. Dependency versions and source SBOM artifacts remain unchanged; the latest advisory audit retains its October 21 date, with no new vulnerability-scan claim.

Private reports, backups, contact review, comparisons, browser checks and public provenance are retained under ignored **data/refresh-2026-11-23/** and **data/refresh-runs/sessions/8c0439b2-51ef-4db3-b079-7fc5aabc4b92.json**. No recurring worker, OS service or notification destination was enabled.

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
