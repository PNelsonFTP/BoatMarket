# Live inventory — September 8, 2026

The local review website at **http://127.0.0.1:4310** contains **1,593 real advertisements**. The reviewed snapshot was activated locally after inspecting the bounded partial result. The full configured-source scan completed at **2026-09-08T17:50:23.512Z**, with status **partial**. The owner reviewed the local website and authorized the final commit/push. The final repository and deployment outcome is recorded in VALIDATION.md.

These are observed advertisements, not guaranteed seller availability or certified distinct boats. The database retains prior records/history and 52 separate fictional samples; samples are excluded from the normal API and publication snapshot. The original September 7 baseline was 1,538 real ads. This run added **55 newly indexed records**, which does not mean the sellers first advertised them today.

The scan's automatic export correctly preserved the previous snapshot after one Huber detail returned HTTP 403. After reviewing all twelve passed inventory quality gates, a separate backed-up export activated the accepted dataset at 17:51:33 UTC with `partial: true` and the original run ID. No denied detail was retried or bypassed. Three OnlyInboards details remain intentionally deferred to a later rotating cycle. The historical pipeline report and separate reviewed-export record are both preserved.

GitHub Pages setup was attempted after review, but GitHub returned HTTP 422: the current plan does not support Pages for this private repository. The repository remains private; the local website is the available deployment.

## Current inventory

There are **1,577 active**, **16 sold** and **0 other-status** ads. **1,464 active ads** have an asking price. **1,162 active ads** have a reported location within 150 straight-line miles of Lake Holiday; **19 active ads** have no usable coordinates and are excluded from nearby presets.

| Source | Retained ads | Active ads | Active within 150 mi |
|---|---:|---:|---:|
| Craigslist | 875 | 875 | 767 |
| OnlyInboards | 387 | 387 | 128 |
| Ted’s Boatarama | 62 | 62 | 62 |
| Bass Boat Central | 60 | 60 | 20 |
| Fox Lake Harbor | 44 | 44 | 44 |
| Huber’s Marine | 31 | 31 | 31 |
| Gordy’s Marine | 31 | 31 | 24 |
| Starved Rock Marina | 30 | 19 | 19 |
| Lake County Watersports | 27 | 27 | 27 |
| Miller’s Sport Center | 22 | 17 | 17 |
| Bedford Sales & Outdoors | 17 | 17 | 16 |
| Quest Watersports | 7 | 7 | 7 |
| **Total** | **1,593** | **1,577** | **1,162** |

Retained counts include records observed before this run. Ads absent from one inventory pass are not automatically proof of sale. Cross-posts and older source records can therefore appear alongside newly observed stock.

## Lake Holiday searches

Home is the reservoir reference **41.6180404, -88.6682705**. The default nearby screen targets preferred premium fishing and ski makes, reported length from 18 through 21 ft, and at least 200 hp when power is known. The dedicated fishing preset requires reported 200+ hp. The ski preset includes MasterCraft, Nautique, Malibu and peers. Category presets overlap and their counts must not be added together.

| Quick search | Matching ads | Grouped research records |
|---|---:|---:|
| Lake Holiday · nearby picks | 76 | 75 |
| Fishing · 200+ hp · nearby | 16 | 16 |
| MasterCraft & peers · up to 21 ft | 54 | 53 |
| Wider search · within 250 mi | 112 | 111 |
| Include unknown lengths · verify first | 94 | 93 |
| All nearby ads · no lake screen | 1,162 | 1,157 |

Distances use advertised boat/dealer city coordinates and are **straight-line miles**, not towing distance or a four-hour driving guarantee. Across-lake journeys can be much longer by road. Configured road routing is available but no external routing provider was enabled. Actual-boat location review, city-center review and route estimates are distinct, dated workflows.

The identity review currently reports **3 multi-ad groups containing 9 ads**, yielding **1,587 grouped/ungrouped research records** across the complete retained pool. There are **131 active, nearby, unreviewed candidate pairs** at this checkpoint. Candidates are suggestions, not proven duplicates. Market separates ad counts from grouped records but does not yet classify reviewed versus HIN-only grouping. Original ads, source links and histories remain inspectable.

## Newly indexed shortlist candidates

- [1987 Supra Sunsport Skier - For Sale](https://www.craigslist.org/view/d/south-elgin-1987-supra-sunsport-skier/nLkeF9sCy1sdcY6VGsxDFM) — $2,000; 19 ft; South Elgin, IL, about 30 straight-line miles. Source: Craigslist.
- [1999 Correct Craft Closed Bow Ski Nautique EFI](https://www.hubersmarine.com/inventory/1999-correct-craft-closed-bow-ski-nautique-efi-la-porte-in-46350-14570584i) — $10,995; 20 ft, 290 hp; La Porte, IN, about 101 straight-line miles. Source: Huber’s Marine.

Specifications and prices above are source claims at observation time. Confirm current availability, manufacturer hull/platform dimensions, installed power and capacity-plate rating before relying on the preliminary lake screen. Unknown or conflicting values remain unknown.

## Full-scan evidence

Run **`33a33a91-bbd8-4642-86ee-a50c33581938`** used `npm run refresh -- --cache-hours=1`, starting at **2026-09-08T17:12:55.717Z**. Sources retain their crawl delays and robots restrictions. Captures less than one hour old may be reused; a recent pipeline timestamp does not make a cached observation new.

| Source | Outcome | Ads found this run | Newly indexed |
|---|---|---:|---:|
| Craigslist | success | 855 | 16 |
| Bedford Sales & Outdoors | success | 17 | 0 |
| OnlyInboards | success | 386 | 1 |
| Miller’s Sport Center | success | 22 | 0 |
| Huber’s Marine | error | 31 | 31 |
| Fox Lake Harbor | success | 44 | 0 |
| Lake County Watersports | success | 26 | 0 |
| Ted’s Boatarama | success | 62 | 0 |
| Gordy’s Marine | success | 31 | 0 |
| Bass Boat Central | success | 60 | 0 |
| Starved Rock Marina | success | 30 | 0 |
| Quest Watersports | success | 7 | 7 |

The report records **76 successful inventory pages**, **291 successful detail pages**, **352 newly fetched pages** and **15 cache hits**. It reports **3 planned detail deferrals**, **0 detail requests under backoff**, **1 failed detail requests**, **10 asking-price changes** and **0 removals**. Exact observation ranges and per-source quality/page limits remain in the private run report and connected Source health panel.

The activated snapshot has SHA-256 **`ca199c0c04d49f276d6cfbb97ea3c6aebead493a6b8fe948876c615f1a21516c`**, 6,072,911 bytes, and was generated at **2026-09-08T17:51:33.332Z**. Its recorded observation range is **2026-09-08T01:17:51.923Z–2026-09-08T17:50:23.401Z**. Field-level retained evidence can be older and remains dated. Snapshot, database and source-found totals measure different things; historical records are retained deliberately.

Huber's Marine and Quest Watersports are enabled nearby additions. Wider-region Boat Works/The Boat Center profiles remain disabled. Boat Trader and listed dealers/marketplaces with robots/page denials, MarineSource throttling and SkipperBud's restricted inventory response remain coverage gaps. Facebook and other unsupported marketplaces need authorized exports or reviewed manual imports. See [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md); no scan establishes exhaustive regional inventory.

## Lake rules

The association's publicly linked [December 2, 2025 rulebook](https://engage.goenumerate.com/s/lakeholiday/files/4219/dyn139681/Rules%20and%20Reg%2012_2_2025%20revised.pdf) was reviewed September 8, 2026. Section 4.15 permits hulled boats **up to 21.0 ft inclusive**, using manufacturer US specifications and counting molded platforms. Bolt-on platforms are accessories; pontoons have a separate 28-ft limit. Installed power cannot exceed the capacity plate. Wake-enhancer use and wakesurfing remain prohibited.

The document hash, reviewed sections/date and verification scope are recorded in `lib/lake-verification.ts`. This supersedes the earlier 2024 under-21 reference used in the initial build. Advertised rounded lengths, molded platforms and association registration still require confirmation. Source listings do not establish lake approval.

## Refresh and review

From Cursor or another terminal in this folder:

```bash
npm run refresh -- --cache-hours=1
npm run build
npm start
```

A successful full pipeline backs up, collects, checks results and activates a validated local snapshot. Partial/failed results preserve the old snapshot unless the operator explicitly reviews and permits a partial export. Read Source health and the run report before choosing that option. Reload the connected workspace for database updates; the standalone website needs the rebuilt snapshot. See [OPERATIONS.md](OPERATIONS.md) for exact commands, restore, retention and scheduling.

No new recurring service or notification destination was enabled. `WORKER_INTERVAL_MINUTES=1440` means daily and `10080` weekly while the worker/machine runs; existing default remains 30 minutes. `WORKER_AUTO_EXPORT=true` enables automatic local snapshot export, while builds and deployment remain separate. Public geocoder use requires explicit policy opt-in; cached city coordinates work without it. Factory lake-profile reconciliation preserves customized settings and replaces the earlier destructive preset reset procedure for existing workspaces.

The owner requested **local review first, commit and GitHub Pages afterward**, and has now authorized the final commit/push. Public deployment requires the documented exact-hash release review and manual workflow. Maps/city data include [OpenStreetMap attribution](https://www.openstreetmap.org/copyright); listing photos remain hosted by their source sites. Sample-photo credits apply only to fictional examples.
