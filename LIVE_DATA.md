# Live inventory — September 29, 2026

The refresh retained **2,097 real ads: 1,662 active, 18 sold and 417 stale**, with **79 newly indexed ads**, **19 price changes (17 decreases)** and **2 status changes** compared with September 27. **1,555 ads were observed during this run; 542 retain earlier observation dates.** These are advertisement counts, not independently verified available boats. Newly indexed does not necessarily mean newly advertised or a distinct physical boat.

The reviewed snapshot is staged for publication. Deployment evidence will be recorded in [VALIDATION.md](VALIDATION.md). A verified backup protects the earlier data. The exported snapshot preserves the collection outcome and observation dates. Search presets, source access policies, duplicate decisions and dependencies are unchanged.

## Current inventory

1,534 active ads have a price; 1,174 active ads have source coordinates within 150 straight-line miles of Lake Holiday. 31 active ads have unknown coordinates. The 52 fictional samples remain separate and excluded from publication.

| Source | Retained ads | Observed this run | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Bass Boat Central | 66 | 64 | 65 | 19 |
| Bedford Sales & Outdoors | 19 | 19 | 19 | 18 |
| Craigslist | 1238 | 816 | 911 | 800 |
| Fox Lake Harbor | 50 | 39 | 43 | 43 |
| Gordy’s Marine | 35 | 33 | 35 | 30 |
| Huber’s Marine | 31 | 0 | 0 | 0 |
| Lake County Watersports | 28 | 24 | 24 | 24 |
| Miller’s Sport Center | 24 | 24 | 18 | 18 |
| OnlyInboards | 503 | 440 | 462 | 137 |
| Quest Watersports | 8 | 8 | 8 | 8 |
| Starved Rock Marina | 30 | 29 | 17 | 17 |
| Ted’s Boatarama | 65 | 59 | 60 | 60 |
| **Total** | **2097** | **1555** | **1662** | **1174** |

All 31 retained Huber’s ads remain stale because their original observation dates exceed 14 days. Ads absent from this pass retain their original dates. The existing 14-day threshold marks older active records stale; stale is not evidence of a sale. A fresh inventory summary does not establish that every detail field was reverified.

## Lake Holiday searches

Home remains **41.6180404, -88.6682705**. Factory presets are unchanged, including the fishing preset's 200+ hp minimum. Presets overlap; do not add their counts together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 64 | 64 |
| Fishing · 200+ hp · nearby | 15 | 15 |
| MasterCraft & peers · up to 21 ft | 41 | 41 |
| Wider search · within 250 mi | 98 | 98 |
| Include unknown lengths · verify first | 81 | 81 |
| All nearby ads · no lake screen | 1174 | 1170 |

Distances are straight-line estimates, not driving times. No routing or public geocoding provider was enabled. There are 5 multi-ad groups containing 13 ads and 2089 research records in the full pool. Duplicate decisions were preserved; cross-listings may remain.

## Full-scan evidence

Run `3c1a9ba8-3808-40c3-b1de-c2833b437a80` ran **2026-09-29T23:02:28.062Z–2026-09-29T23:40:41.059Z**. Outcome: **partial**; 11/12 inventory quality gates passed. The collector recorded **363 fresh fetches**, **0 cache hits**, **68 successful inventory pages** and **294 successful detail pages**. There were 0 failed details, 0 deferred details, 0 details under backoff and 0 inventory caps.

The private run configuration raised OnlyInboards' detail budget from 100 to 150, as in the previous refresh. Permanent source configuration remains unchanged.

`SOURCE_CONFIG=data/refresh-2026-09-29/sources.json npm run refresh -- --cache-hours=1`

| Source | Outcome | Ads found this run | Newly indexed |
|---|---|---:|---:|
| Craigslist | error | 816 | 48 |
| Bedford Sales & Outdoors | success | 19 | 0 |
| OnlyInboards | success | 440 | 31 |
| Miller’s Sport Center | success | 24 | 0 |
| Huber’s Marine | error | 0 | 0 |
| Fox Lake Harbor | success | 39 | 0 |
| Lake County Watersports | success | 24 | 0 |
| Ted’s Boatarama | success | 59 | 0 |
| Gordy’s Marine | success | 33 | 0 |
| Bass Boat Central | success | 64 | 0 |
| Starved Rock Marina | success | 29 | 0 |
| Quest Watersports | success | 8 | 0 |

The Decatur Craigslist boat-search page contains an empty structured ItemList and no static result rows. The collector conservatively reports it as unparsed; that original warning is retained. Huber’s inventory remains blocked with HTTP 403.

Source errors:

- Craigslist: https://www.craigslist.org/search/area/decatur?cat=boo: No listing records parsed. Check source markup or selectors; existing records are preserved.
- Huber’s Marine: https://www.hubersmarine.com/search/inventory/availability/In%20Stock: Source returned HTTP 403
- Huber’s Marine: Quality gate: Parsed 0 records, below required 1
- Huber’s Marine: Quality gate: Inventory fell from 31 to 0, exceeding the configured drop limit
- Huber’s Marine: Quality gate: price coverage 0% below required 50%
- Huber’s Marine: Quality gate: location coverage 0% below required 95%
- Huber’s Marine: Quality gate: identity coverage 0% below required 95%

Snapshot generated **2026-09-29T23:41:06.681Z**, 11,682,595 bytes, SHA-256 `fc44bfdbaa3e9ac698e2cf4f0aa8a4a30b792e178ba87dba0c63b52dbfc46202`. Observation range: 2026-09-08T01:17:51.923Z–2026-09-29T23:40:40.930Z. Exact release review: `115195e93f690b37bd00f7497dadf22f87ce7720b965d15565ecdedfb4e6f7d6`.

Release review found 0 blocking issues. The 120 possible source-contact ads were reviewed, with no contact values absent from the prior snapshot. Private workspace fields, secrets, raw captures, samples and manual location evidence are excluded. Source, lockfile and all three SBOM hashes match the prior release; no fresh dependency audit is claimed.

Private run reports, backups and verification evidence are under ignored `data/refresh-2026-09-29/` and `data/refresh-runs/`. Restricted marketplaces and unsupported sources remain coverage gaps. This refresh covers all twelve enabled sources; it is not an exhaustive new source-discovery search. See [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).

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
