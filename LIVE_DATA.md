# Live inventory — October 5, 2026

The refresh retained **2,190 real ads: 1,756 active, 18 sold and 416 stale**, with **10 newly indexed ads**, **6 price changes (6 decreases)** and **0 status changes** compared with October 4. **1,497 ads were observed during this run; 693 retain earlier observation dates.** These are advertisement counts, not independently verified available boats. Newly indexed does not necessarily mean newly advertised or a distinct physical boat.

The reviewed snapshot is live on the [public website](https://pnelsonftp.github.io/BoatMarket/) and local website at http://127.0.0.1:4310. Deployment and desktop/mobile verification passed; evidence is recorded in [VALIDATION.md](VALIDATION.md). A verified backup protects the earlier data. The exported snapshot preserves the collection outcome and observation dates. Search presets, source access policies, duplicate decisions and dependencies are unchanged.

## Current inventory

1,618 active ads have a price; 1,245 active ads have source coordinates within 150 straight-line miles of Lake Holiday. 33 active ads have unknown coordinates. The 52 fictional samples remain separate and excluded from publication.

| Source | Retained ads | Observed this run | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Bass Boat Central | 67 | 63 | 66 | 19 |
| Bedford Sales & Outdoors | 19 | 19 | 19 | 18 |
| Craigslist | 1303 | 751 | 977 | 855 |
| Fox Lake Harbor | 59 | 48 | 52 | 52 |
| Gordy’s Marine | 35 | 32 | 35 | 30 |
| Huber’s Marine | 31 | 0 | 0 | 0 |
| Lake County Watersports | 28 | 24 | 24 | 24 |
| Miller’s Sport Center | 24 | 24 | 18 | 18 |
| OnlyInboards | 520 | 442 | 479 | 143 |
| Quest Watersports | 8 | 7 | 8 | 8 |
| Starved Rock Marina | 30 | 29 | 17 | 17 |
| Ted’s Boatarama | 66 | 58 | 61 | 61 |
| **Total** | **2190** | **1497** | **1756** | **1245** |

All 31 retained Huber’s ads remain stale with their original observation dates. Ads absent from this pass retain their original dates. The existing 14-day threshold marks older active records stale; stale is not evidence of a sale. A fresh inventory summary does not establish that every detail field was reverified.

## Lake Holiday searches

Home remains **41.6180404, -88.6682705**. Factory presets are unchanged, including the fishing preset's 200+ hp minimum. Presets overlap; do not add their counts together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 68 | 68 |
| Fishing · 200+ hp · nearby | 15 | 15 |
| MasterCraft & peers · up to 21 ft | 46 | 46 |
| Wider search · within 250 mi | 104 | 104 |
| Include unknown lengths · verify first | 85 | 85 |
| All nearby ads · no lake screen | 1245 | 1241 |

Distances are straight-line estimates, not driving times. No routing or public geocoding provider was enabled. There are 5 multi-ad groups containing 13 ads and 2182 research records in the full pool. Duplicate decisions were preserved; cross-listings may remain.

## Full-scan evidence

Run `2137c2df-9e40-43da-a32c-92cd13f7eaeb` ran **2026-10-05T12:12:33.879Z–2026-10-05T12:52:01.568Z**. Outcome: **partial**; 11/12 inventory quality gates passed. The collector recorded **364 fresh fetches**, **0 cache hits**, **71 successful inventory pages** and **291 successful detail pages**. There were 0 failed details, 0 deferred details, 0 details under backoff and 0 inventory caps.

The private run configuration raised OnlyInboards' detail budget from 100 to 150, as in the previous refresh. Permanent source configuration remains unchanged.

`SOURCE_CONFIG=data/refresh-2026-10-05/sources.json npm run refresh -- --cache-hours=1`

| Source | Outcome | Ads found this run | Newly indexed |
|---|---|---:|---:|
| Craigslist | error | 751 | 10 |
| Bedford Sales & Outdoors | success | 19 | 0 |
| OnlyInboards | success | 442 | 0 |
| Miller’s Sport Center | success | 24 | 0 |
| Huber’s Marine | error | 0 | 0 |
| Fox Lake Harbor | success | 48 | 0 |
| Lake County Watersports | success | 24 | 0 |
| Ted’s Boatarama | success | 58 | 0 |
| Gordy’s Marine | success | 32 | 0 |
| Bass Boat Central | success | 63 | 0 |
| Starved Rock Marina | success | 29 | 0 |
| Quest Watersports | success | 7 | 0 |

Huber’s inventory endpoint returned HTTP 403; its 31 retained ads remain stale with original dates. Freshly captured Craigslist pages for Decatur and Champaign–Urbana have no static result rows and empty structured ItemLists; both original parser warnings remain. Ten source runs completed successfully and eleven inventory quality gates passed. A separately backed-up export preserves the original partial outcome. No denied access was bypassed.

Source errors:

- Craigslist: https://www.craigslist.org/search/area/chambana?cat=boo: No listing records parsed. Check source markup or selectors; existing records are preserved.
- Craigslist: https://www.craigslist.org/search/area/decatur?cat=boo: No listing records parsed. Check source markup or selectors; existing records are preserved.
- Huber’s Marine: https://www.hubersmarine.com/search/inventory/availability/In%20Stock: Source returned HTTP 403
- Huber’s Marine: Quality gate: Parsed 0 records, below required 1
- Huber’s Marine: Quality gate: Inventory fell from 31 to 0, exceeding the configured drop limit
- Huber’s Marine: Quality gate: price coverage 0% below required 50%
- Huber’s Marine: Quality gate: location coverage 0% below required 95%
- Huber’s Marine: Quality gate: identity coverage 0% below required 95%

Snapshot generated **2026-10-05T12:52:36.691Z**, 14,583,451 bytes, SHA-256 `3d282d9995ea63e3e0d452d54df051891c719ca166ada724508271c7577bcd86`. Observation range: 2026-09-08T01:17:51.923Z–2026-10-05T12:52:01.446Z. Exact release review: `aa3fec1dce81b1cddef28cc9d385ac758247955ba074511f2dae371b02ea04e5`.

Release review found 0 blocking issues. The 125 possible source-contact ads were reviewed, with no new contact values or changed contact-bearing titles/descriptions compared with the prior reviewed snapshot. Private workspace fields, secrets, raw captures, samples and manual location evidence are excluded. Source, lockfile and all three SBOM hashes match the prior release; no fresh dependency audit is claimed.

Private run reports, backups and verification evidence are under ignored `data/refresh-2026-10-05/` and `data/refresh-runs/`. Restricted marketplaces and unsupported sources remain coverage gaps. This refresh covers all twelve enabled sources; it is not an exhaustive new source-discovery search. See [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).

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
