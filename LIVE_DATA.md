# Live inventory — September 10, 2026

The [public website](https://pnelsonftp.github.io/BoatMarket/) and local website at **http://127.0.0.1:4310** contain **1,636 real advertisements**: **1,619 active and 17 sold**. The complete configured-source scan finished at **3:48 PM CDT on September 10** after about 38 minutes. All twelve inventory quality gates passed. Two Huber’s Marine detail requests were blocked, so the result remains explicitly **partial**.

Compared with the September 8 snapshot, the scan added **43 newly indexed ads**, recorded **33 asking-price changes (32 decreases)**, and changed **one advertisement to sold**. Newly indexed means new to this database, not necessarily newly advertised by its seller. The scan observed **1,557 ads today** and retained **79 earlier records**. Seller availability and distinct physical boats are not guaranteed by these advertisement counts.

The automatic pipeline preserved the previous website snapshot because of the partial result. After reviewing the exact failures and all passed quality gates, a separate verified-backup export activated the accepted data with its original run ID and `partial: true`. Original pipeline and separate export/repair evidence remain intact. Eight proven classification errors were also corrected from this run’s immutable source captures; no IDs, groups, prices, availability, workspace data or observation timestamps changed in that repair.

The owner authorized making the repository public on September 10, and GitHub Pages configuration succeeded with HTTPS enforced at [pnelsonftp.github.io/BoatMarket](https://pnelsonftp.github.io/BoatMarket/). The reviewed 1,636-ad snapshot is live and passed public desktop/mobile checks, including exact snapshot/build provenance, images and preset filters. The local website remains available. The September 8 HTTP 422 applied to the then-private repository. Pages serves this reviewed snapshot, while collection and the backend remain local. Future public updates require collection/export, review, a matching commit and manual deployment.

## Current inventory

**1,511 active ads** have an asking price. **1,194 active ads** have reported coordinates within 150 straight-line miles of Lake Holiday. **20 active ads** have no usable coordinates and are excluded from nearby presets. The database also retains 52 separate fictional samples, excluded from the normal API and real-data snapshot.

| Source | Retained ads | Observed this run | Active ads | Active within 150 mi |
|---|---:|---:|---:|---:|
| Craigslist | 913 | 846 | 913 | 799 |
| OnlyInboards | 390 | 381 | 390 | 129 |
| Bass Boat Central | 62 | 62 | 62 | 20 |
| Ted’s Boatarama | 62 | 62 | 62 | 62 |
| Fox Lake Harbor | 44 | 44 | 44 | 44 |
| Huber’s Marine | 31 | 29 | 31 | 31 |
| Gordy’s Marine | 31 | 31 | 31 | 24 |
| Starved Rock Marina | 30 | 30 | 18 | 18 |
| Lake County Watersports | 27 | 26 | 27 | 27 |
| Miller’s Sport Center | 22 | 22 | 17 | 17 |
| Bedford Sales & Outdoors | 17 | 17 | 17 | 16 |
| Quest Watersports | 7 | 7 | 7 | 7 |
| **Total** | **1,636** | **1,557** | **1,619** | **1,194** |

The 79 earlier records comprise 67 Craigslist, nine OnlyInboards, two Huber’s and one Lake County ad. Their earlier observation dates are preserved. Absence from one inventory pass does not establish a sale; active records become stale only after the configured 14-day absence threshold. An inventory summary observed today also does not imply every retained detail field was reverified today.

## Lake Holiday searches

Home remains the reservoir reference **41.6180404, -88.6682705**. Nearby picks target preferred premium fishing and ski makes, reported lengths from 18 through 21 ft, and at least 200 hp when power is known. The dedicated fishing preset requires reported 200+ hp; the ski preset includes MasterCraft, Nautique, Malibu and peers. Presets overlap and their counts must not be added together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 76 | 75 |
| Fishing · 200+ hp · nearby | 16 | 16 |
| MasterCraft & peers · up to 21 ft | 53 | 52 |
| Wider search · within 250 mi | 112 | 111 |
| Include unknown lengths · verify first | 94 | 93 |
| All nearby ads · no lake screen | 1,194 | 1,189 |

None of the 43 newly indexed ads meets the existing nearby premium fishing/ski presets, and no recorded price change falls within those presets. The broad nearby view gained 33 new ads and lost one active ad to sold, for a net increase of 32. The ski preset decreased by one because a Tiger Shark WaveRunner was incorrectly inferred as a Tige ski boat; its classification is now corrected. The 16 reported-200+hp fishing matches remain available for research.

New wider-area entries include a [2023 Phoenix 920 Elite, 250 hp, $70,000, Brighton MI](https://bassboatcentral.com/boats-for-sale/phoenix/#gallery-17943-1) (about 258 straight-line miles; reported length unknown), a [2020 Ranger Z520C, 250 hp, $59,995, Shelbyville IN](https://bassboatcentral.com/boats-for-sale/ranger/#gallery-17954-3) (reported length and usable coordinates unknown), and a [2026 Tige Z3, 23 ft, $184,995, Leesburg IN](https://onlyinboards.com/listings/2026-tige-z3-for-sale-leesburg-indiana-145711) (about 147 miles; exceeds the 21-ft hull screen). They remain in the broader inventory and are not presented as verified lake-compatible nearby matches.

Distances use advertised boat/dealer locations and are **straight-line miles**, not towing distance or a four-hour driving guarantee. No external routing or public geocoding provider was enabled for this refresh. Unknown/conflicting dimensions, power and actual boat locations remain subject to review.

Identity grouping remains **3 multi-ad groups containing 9 ads**, yielding **1,630 research records** across the retained pool. Original ads, source links and histories remain inspectable. Duplicate candidate pairs remain suggestions requiring review; the September 8 count of 131 unreviewed nearby pairs is historical and was not recomputed in this refresh. Market does not yet distinguish reviewed versus HIN-only grouping.

## Full-scan evidence

Run **`cc9d1814-d2af-4aad-b0d6-d725724b6efa`** ran from **2026-09-10T20:10:07.604Z** through **2026-09-10T20:48:10.130Z**. It used a private copy of the normal source configuration with OnlyInboards’ detail budget raised from 100 to 150 for this run. Its 99 eligible details all completed; the permanent source configuration remains unchanged.

```bash
SOURCE_CONFIG=data/refresh-2026-09-10/sources.json npm run refresh -- --cache-hours=1
```

| Source | Outcome | Ads found this run | Newly indexed |
|---|---|---:|---:|
| Craigslist | success | 846 | 38 |
| Bedford Sales & Outdoors | success | 17 | 0 |
| OnlyInboards | success | 381 | 3 |
| Miller’s Sport Center | success | 22 | 0 |
| Huber’s Marine | error | 29 | 0 |
| Fox Lake Harbor | success | 44 | 0 |
| Lake County Watersports | success | 26 | 0 |
| Ted’s Boatarama | success | 62 | 0 |
| Gordy’s Marine | success | 31 | 0 |
| Bass Boat Central | success | 62 | 2 |
| Starved Rock Marina | success | 30 | 0 |
| Quest Watersports | success | 7 | 0 |

The report records **76 successful inventory pages**, **287 successful detail pages**, **363 newly fetched pages**, **zero cache hits**, **zero inventory caps**, **zero planned detail deferrals**, **zero detail requests under backoff**, and **two failed detail requests**. All eligible detail requests were attempted. Normal robots restrictions, crawl delays and source-access policies remained active.

The Huber failures were the **2026 Lund Angler 1650 Tiller** detail (HTTP 403) and **2017 Lund 1875 Crossover XS** detail (access challenge). Both were still found in accepted inventory summaries; prior detail evidence remains dated. No denial was bypassed. Huber’s current inventory pass found 29 ads, while its two earlier records remain retained separately.

Snapshot SHA-256: **`c9f77dd5b111f9e7626556e4263fd2ef267b3c845191883a0b8c147054fce781`**. Size: **7,007,261 bytes**. Generated: **2026-09-10T20:49:20.464Z**. Recorded observation range: **2026-09-08T01:17:51.923Z–2026-09-10T20:48:10.017Z**. Private run reports, verified backups, exact correction preview/apply audit and separate reviewed export are under `data/refresh-2026-09-10/`; they are excluded from Git and publication.

The bounded parser correction prevents `Tiger` from matching `Tige`, retains genuine compact names such as `Tige21`, and prioritizes explicit PWC terms before generic ski terms. Eight existing records were repaired using exact fresh captures and record fingerprints. Ambiguous accessories, older-only evidence and unrelated make/model differences were excluded. A wider make-inference issue remains: engine-brand words can override hull makes (for example, a Vexus title mentioning Yamaha). See [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).

Boat Trader and other listed marketplaces/dealers with robots/page denials, MarineSource throttling and SkipperBud’s restricted response remain coverage gaps. Facebook and unsupported sources need authorized exports or reviewed manual imports. Wider-region Boat Works/The Boat Center profiles remain disabled. This scan covers all twelve enabled sources; it cannot establish exhaustive regional inventory. See [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md).

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
