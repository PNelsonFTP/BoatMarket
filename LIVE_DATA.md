# Live inventory — September 12, 2026

The completed configured-source scan retained **1,667 real advertisements: 1,650 active and 17 sold**. Collection ran from **7:03 AM to 7:40 AM CDT on September 12**, about 38 minutes. All twelve inventory quality gates passed. One Huber’s Marine detail page returned HTTP 403, so the result is explicitly **partial**. The reviewed snapshot is staged locally for the GitHub Pages release; deployment evidence is recorded in [VALIDATION.md](VALIDATION.md).

Compared with the September 10 snapshot, this scan added **31 newly indexed ads** and recorded **12 asking-price changes, all decreases**. No status changes were detected. **1,548 ads were observed in this run; 119 retain earlier observation dates.** These are advertisement counts, not verified available boats or deduplicated physical inventory. Newly indexed does not necessarily mean newly advertised by the seller.

The automatic pipeline correctly preserved the previous website snapshot on the partial result. After reviewing the sole failure and all passed quality gates, a separate verified-backup export activated the accepted data with the original run ID and partial status. No code, dependency, search-preset, source-access-policy, or duplicate-decision changes were made. Existing parser fixes were naturally applied to freshly collected evidence.

## Current inventory

**1,542 active ads** have an asking price; **1,221 active ads** have reported coordinates within 150 straight-line miles of Lake Holiday. **22 active ads** lack usable coordinates and are excluded from nearby presets. The database retains 52 separate fictional samples, excluded from this snapshot.

| Source | Retained ads | Observed this run | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Bass Boat Central | 62 | 62 | 62 | 20 |
| Bedford Sales & Outdoors | 17 | 17 | 17 | 16 |
| Craigslist | 939 | 837 | 939 | 824 |
| Fox Lake Harbor | 44 | 44 | 44 | 44 |
| Gordy’s Marine | 32 | 32 | 32 | 25 |
| Huber’s Marine | 31 | 28 | 31 | 31 |
| Lake County Watersports | 27 | 26 | 27 | 27 |
| Miller’s Sport Center | 22 | 22 | 17 | 17 |
| OnlyInboards | 393 | 381 | 393 | 129 |
| Quest Watersports | 7 | 7 | 7 | 7 |
| Starved Rock Marina | 30 | 30 | 18 | 18 |
| Ted’s Boatarama | 63 | 62 | 63 | 63 |
| **Total** | **1,667** | **1,548** | **1,650** | **1,221** |

The 119 earlier records comprise 102 Craigslist, twelve OnlyInboards, three Huber’s, one Lake County and one Ted’s ad. Their dates remain intact. Absence from one pass does not establish a sale; the existing 14-day stale threshold remains unchanged. A fresh inventory summary does not mean every detail field was reverified.

## Lake Holiday searches

Home remains **41.6180404, -88.6682705**. Factory presets are unchanged; the fishing preset still requires reported 200+ hp. The recent model/budget discussion did not automatically change saved search criteria. Presets overlap and must not be added together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 76 | 75 |
| Fishing · 200+ hp · nearby | 16 | 16 |
| MasterCraft & peers · up to 21 ft | 53 | 52 |
| Wider search · within 250 mi | 112 | 111 |
| Include unknown lengths · verify first | 94 | 93 |
| All nearby ads · no lake screen | 1221 | 1216 |

Distances are straight-line estimates from source-published locations, not driving times. No routing or public geocoding provider was enabled. Identity grouping remains **three multi-ad groups containing nine ads**, giving **1,661 research records** in the full retained pool. Duplicate suggestions were not re-reviewed; source ads remain individually inspectable.

## Full-scan evidence

Run **`45193ea2-80fb-483c-a267-d1ded9697538`**: **2026-09-12T12:03:21.761Z–2026-09-12T12:40:58.254Z**. The private run configuration raised OnlyInboards’ detail budget from 100 to 150, allowing all 101 eligible details to complete; the permanent configuration is unchanged.

`SOURCE_CONFIG=data/refresh-2026-09-12/sources.json npm run refresh -- --cache-hours=1`

| Source | Outcome | Ads found this run | Newly indexed |
|---|---|---:|---:|
| Craigslist | success | 837 | 26 |
| Bedford Sales & Outdoors | success | 17 | 0 |
| OnlyInboards | success | 381 | 3 |
| Miller’s Sport Center | success | 22 | 0 |
| Huber’s Marine | error | 28 | 0 |
| Fox Lake Harbor | success | 44 | 0 |
| Lake County Watersports | success | 26 | 0 |
| Ted’s Boatarama | success | 62 | 1 |
| Gordy’s Marine | success | 32 | 1 |
| Bass Boat Central | success | 62 | 0 |
| Starved Rock Marina | success | 30 | 0 |
| Quest Watersports | success | 7 | 0 |

The collector reports **76 successful inventory pages, 283 successful detail pages, 359 fresh fetches and zero cache hits**. One detail request failed. There were **no inventory caps, planned detail deferrals or details under backoff**. All eligible detail requests were attempted with normal robots checks and crawl delays.

The only failed detail was Huber’s **2023 Bennington 22 SS**, HTTP 403. Its accepted inventory summary and earlier detail dates are retained; access restrictions were not bypassed. The two detail failures recorded on September 10 are historical and are not this run’s failure list.

Snapshot generated **2026-09-12T12:41:36.941Z**, **7,916,788 bytes**, SHA-256 **`69bff7be8fa212c87dcda5a15bd1e95b05e4e2cd8fcaf65f41aa22054f7985ee`**. Observation range: **2026-09-08T01:17:51.923Z–2026-09-12T12:40:58.144Z**. Exact release review: **`f424016f9d77a1d393bfb9eb7fc2de110239f95e8408650dfdf8030aec2bc3ec`**. Private reports, verified backups, export/release reviews and audit scripts are under ignored `data/refresh-2026-09-12/` and `data/refresh-runs/`.

The release privacy/schema check found no blocking issues. Its 111 possible source-contact warnings contain only contact values already in the previously reviewed snapshot; no new contact text was introduced. Private workspace data, raw captures, secrets, manual location evidence and samples remain excluded. Source and dependency/SBOM hashes are unchanged; no new dependency vulnerability audit is implied.

Restricted marketplaces and unsupported sources remain coverage gaps. This was a refresh of all twelve enabled sources, not a new nationwide source-discovery exercise. Cross-listings, uncertain specifications and imperfect make/category inference remain documented in [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).

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
