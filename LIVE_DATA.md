# Live inventory — October 9, 2026

The refresh retained **2,262 real ads: 1,759 active, 18 sold and 485 stale**, with **72 newly indexed ads**, **34 price changes (31 decreases)** and **69 status changes** compared with October 5. All 69 are active-to-stale transitions under the existing 14-day policy; no new sale is inferred. **1,466 ads were observed during this run; 796 retain earlier observation dates.** These are advertisement counts, not independently verified available boats. Newly indexed does not necessarily mean newly advertised or a distinct physical boat.

The reviewed snapshot is live on the [public website](https://pnelsonftp.github.io/BoatMarket/) and local website at http://127.0.0.1:4310. Deployment and desktop/mobile verification passed; evidence is recorded in [VALIDATION.md](VALIDATION.md). A verified backup protects the earlier data. The exported snapshot preserves the collection outcome and observation dates. Search presets, source access policies, duplicate decisions and dependencies are unchanged.

## Current inventory

1,618 active ads have a price; 1,249 active ads have source coordinates within 150 straight-line miles of Lake Holiday. 34 active ads have unknown coordinates. The 52 fictional samples remain separate and excluded from publication.

| Source | Retained ads | Observed this run | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Bass Boat Central | 67 | 63 | 65 | 19 |
| Bedford Sales & Outdoors | 21 | 20 | 21 | 20 |
| Craigslist | 1355 | 742 | 984 | 859 |
| Fox Lake Harbor | 59 | 46 | 48 | 48 |
| Gordy’s Marine | 35 | 0 | 34 | 29 |
| Huber’s Marine | 31 | 0 | 0 | 0 |
| Lake County Watersports | 28 | 24 | 24 | 24 |
| Miller’s Sport Center | 24 | 24 | 18 | 18 |
| OnlyInboards | 537 | 454 | 479 | 146 |
| Quest Watersports | 8 | 7 | 8 | 8 |
| Starved Rock Marina | 31 | 29 | 18 | 18 |
| Ted’s Boatarama | 66 | 57 | 60 | 60 |
| **Total** | **2262** | **1466** | **1759** | **1249** |

Ads absent from this pass retain their original dates. The existing 14-day threshold marks older active records stale; stale is not evidence of a sale. A fresh inventory summary does not establish that every detail field was reverified.

## Lake Holiday searches

Home remains **41.6180404, -88.6682705**. Factory presets are unchanged, including the fishing preset's 200+ hp minimum. Presets overlap; do not add their counts together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 72 | 72 |
| Fishing · 200+ hp · nearby | 15 | 15 |
| MasterCraft & peers · up to 21 ft | 50 | 50 |
| Wider search · within 250 mi | 108 | 108 |
| Include unknown lengths · verify first | 89 | 89 |
| All nearby ads · no lake screen | 1249 | 1245 |

Distances are straight-line estimates, not driving times. No routing or public geocoding provider was enabled. There are 5 multi-ad groups containing 13 ads and 2254 research records in the full pool. Duplicate decisions were preserved; cross-listings may remain.

## Full-scan evidence

Huber’s and Gordy’s inventory endpoints returned HTTP 403; their 31 and 35 retained ads keep original observation dates. Huber’s ads remain stale; Gordy’s has 34 active and one stale under the unchanged age policy. Craigslist’s freshly captured Decatur page has no static result rows and an empty structured ItemList; its original parser warning remains. Nine source runs completed successfully and ten inventory quality gates passed. A separately backed-up export preserves the explicitly partial outcome. No denied access was bypassed.

Reviewed multi-pass session `85dd71cb-26be-41c9-87f3-6de3983fb4a8` ran **2026-10-09T13:44:19.341Z–2026-10-09T14:26:27.178Z**. Outcome: **partial**; 10/12 inventory quality gates passed. The initial twelve-source pass `d9822aaa-7e89-4d15-b2ae-2060d150ccf4` recorded **371 fresh fetches**, **zero cache hits**, **70 successful inventory pages** and **300 successful detail pages**, with one OnlyInboards detail deferred by the 150-page budget. A permitted completion pass `4f55c99a-844d-4fc0-94a8-cb0cc8ae9efb` raised the private budget to 200, reused **162 captures with their original observation dates** and fetched **one additional detail**. All **301 eligible details** are covered in the final per-source reports, with zero failed details, remaining deferrals, backoff skips or inventory caps. Across both passes: **372 fresh fetches**, **162 cache hits**, **82 successful inventory-page operations** and **451 successful detail-page operations**; repeated cached operations are not additional unique pages. Original component reports are preserved.

The initial private run configuration raised OnlyInboards' detail budget from 100 to 150. The cached completion pass used 200 to cover the one remaining detail. Permanent source configuration remains unchanged.

`SOURCE_CONFIG=data/refresh-2026-10-09/sources.json npm run refresh -- --cache-hours=1`

| Source | Outcome | Ads found this run | Newly indexed |
|---|---|---:|---:|
| Craigslist | error | 742 | 52 |
| Bedford Sales & Outdoors | success | 20 | 2 |
| OnlyInboards | success | 454 | 17 |
| Miller’s Sport Center | success | 24 | 0 |
| Huber’s Marine | error | 0 | 0 |
| Fox Lake Harbor | success | 46 | 0 |
| Lake County Watersports | success | 24 | 0 |
| Ted’s Boatarama | success | 57 | 0 |
| Gordy’s Marine | error | 0 | 0 |
| Bass Boat Central | success | 63 | 0 |
| Starved Rock Marina | success | 29 | 1 |
| Quest Watersports | success | 7 | 0 |

Source errors:

- Craigslist: https://www.craigslist.org/search/area/decatur?cat=boo: No listing records parsed. Check source markup or selectors; existing records are preserved.
- Huber’s Marine: https://www.hubersmarine.com/search/inventory/availability/In%20Stock: Source returned HTTP 403
- Huber’s Marine: Quality gate: Parsed 0 records, below required 1
- Huber’s Marine: Quality gate: Inventory fell from 31 to 0, exceeding the configured drop limit
- Huber’s Marine: Quality gate: price coverage 0% below required 50%
- Huber’s Marine: Quality gate: location coverage 0% below required 95%
- Huber’s Marine: Quality gate: identity coverage 0% below required 95%
- Gordy’s Marine: https://www.gordysboats.com/wisconsin-all-boat-inventory/: Source returned HTTP 403
- Gordy’s Marine: Quality gate: Parsed 0 records, below required 1
- Gordy’s Marine: Quality gate: Inventory fell from 35 to 0, exceeding the configured drop limit

Snapshot generated **2026-10-09T14:27:06.618Z**, 15,647,545 bytes, SHA-256 `c45da3a4a4162aaecb8036592d8abbe09ab6759abe1f0a5eb53bf390ce04e4a8`. Observation range: 2026-09-08T01:17:51.923Z–2026-10-09T14:26:20.517Z. Exact release review: `b0d51b04833a19f5b17e09ee75cb68a2297c1bafecec1b0593e6fb169ccc341c`.

Release review found 0 blocking issues. The 126 possible source-contact ads were reviewed, including 0 ads with contact values absent from the prior snapshot. Private workspace fields, secrets, raw captures, samples and manual location evidence are excluded. Source, lockfile and all three SBOM hashes match the prior release; no fresh dependency audit is claimed.

Private run reports, backups and verification evidence are under ignored `data/refresh-2026-10-09/` and `data/refresh-runs/`. Restricted marketplaces and unsupported sources remain coverage gaps. This refresh covers all twelve enabled sources; it is not an exhaustive new source-discovery search. See [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).

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
