# Live collection — September 7, 2026

The website now opens the collected-data snapshot. The SQLite database contains the same real listings; its original fictional seed records are retained separately and excluded from the normal API and publication export. Current data is a set of advertisements, not guaranteed availability or distinct physical vessels.

## Expanded collection coverage

This research pass increased the pool from **257 to 1,538 ads**, adding seven sources and more regional pages. Of these, **1,522 are active**, **16 are marked sold**, and **1,419 active ads have an asking price**. Active means the collected page did not report removal or sale; seller availability is not independently confirmed.

| Source | Collected ads | Active within 150 mi |
|---|---:|---:|
| Craigslist — 17 regional boards | 859 | 752 |
| OnlyInboards — IL, WI, IN, IA, MI | 386 | 127 |
| Ted’s Boatarama — Rock Island | 62 | 62 |
| Bass Boat Central — five-state ads | 60 | 20 |
| Fox Lake Harbor — Fox Lake | 44 | 44 |
| Gordy’s Marine — northern IL / southern WI | 31 | 24 |
| Starved Rock Marina — Ottawa | 30 | 19 |
| Lake County Watersports — Wauconda | 27 | 27 |
| Miller’s Sport Center — Lanark | 22 | 17 |
| Bedford Sales & Outdoors — Morris | 17 | 16 |
| **Total** | **1,538** | **1,108** |

All ten enabled sources completed successfully. Dealer and marketplace pagination is now followed for supported sources. Craigslist includes public owner and dealer ads across 17 boards. Source URLs, methods, limits and unsuccessful prospects are documented in [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md); configuration is in `config/sources.json`.

This is broader coverage, not every boat for sale. Several nearby dealers and Boat Trader restrict collection; Facebook Marketplace remains manual-import only. Search-indexed Boatzon/Lund ads that proved sold or removed were excluded. Cross-posts with different IDs or separately hosted photos may remain separate, including some dealer boats on OnlyInboards and repeated regional classifieds.

Listing URLs, photographs, observations and raw evidence are retained locally. Public snapshots omit raw payloads and personal workspace data. OnlyInboards did not honor the requested decimal length filter, so the app applies its own length screen to the collected regional pool.

## Your searches

Lake Holiday reservoir center is the reference: **41.6180404, -88.6682705**. Boat distances are **approximate straight-line miles**, using the advertised location or dealer city, not route mileage or driving time. In particular, locations across Lake Michigan can take much longer to reach by road. The local city cache contains 115 resolved locations; 19 active ads still have no usable location and stay outside the nearby presets. These include ambiguous Green Bay, Clay, Lake Country and Chicagoland locations, plus an explicitly off-site Bedford boat.

| Quick search | First pass | Current matches |
|---|---:|---:|
| Nearby picks, within 150 mi | 27 | 51 |
| Fishing, reported 200+ hp, within 150 mi | 8 | 15 |
| MasterCraft and comparable ski makes, within 150 mi | 19 | 29 |
| Expanded search, within 250 mi | 38 | 67 |
| Include unknown lengths — verify first | — | 69 |
| All nearby ads — no lake screen | — | 1,108 |

Counts use the app’s grouping rules; unresolved cross-posts can still count twice. The category searches overlap with the main shortlist and should not be added together. The main preset now also requires a reported length of at least 18 ft, so its comparison is not an identical-filter comparison.

Strict searches require a reported length below 21 ft. Nearby picks target preferred fishing/ski makes and categories, lengths from 18 ft to below 21 ft, and at least 200 hp when power is reported. Unknown power remains eligible for review. The dedicated fishing preset requires reported 200+ hp; the ski preset permits unknown power. Prices are unrestricted.

The website’s **View coverage** panel explains why the shortlist is smaller than the collected pool and shows counts by source. **Include unknown lengths · verify first** adds 18 potential candidates to the main shortlist. **All nearby ads · no lake screen** removes the make, motor and lake-length restrictions, making the broader local inventory visible. A boat in these broader views has not passed the strict lake screen.

Some additional nearby finds:

- **2007 MasterCraft X1**, nominal 20 ft, Channahon (~28 mi), **$26,500**: [classified ad](https://www.craigslist.org/view/d/channahon-2007-mastercraft-x1/1pM7uKsT2rvU68m6z891De).
- **Crestliner 2050 Sportfish**, advertised 225 hp and nominal 20 ft, McHenry (~53 mi), **$24,500**: [classified ad](https://www.craigslist.org/view/d/mchenry-crestliner-2050-sportfish/qtM7LXzdPEVBPnyrL7SvTe).
- **2026 Lund 2075 Pro-V Sport**, advertised 300 hp and nominal 20 ft, Fox Lake (~59 mi), **price on request**: [dealer listing](https://www.foxlakeharbor.com/NEW-Inventory-2026-Lund-Boat-2075-Pro-V-Sport-Fox-Lake-Harbor-18623194?ref=list).
- **2027 Lund 1875 Tyee SS**, advertised 200 hp and nominal 18 ft, Fox Lake (~59 mi), **$86,995**: [dealer listing](https://www.foxlakeharbor.com/NEW-Inventory-2027-Lund-Boat-1875-Tyee-SS-Fox-Lake-Harbor-19116454?ref=list).
- **2019 Ranger 518L**, advertised 200 hp and nominal 18 ft, Milton (~82 mi), **$44,900**: [classified ad](https://www.craigslist.org/view/d/milton-2019-ranger-518l/7r67E2eayu5u2aATdJqBv4).

These are reported specifications, often rounded. Check actual hull/platform measurements and installed motor ratings. Unknown prices display as price on request. Conflicting power and implausible dimensions remain unknown with warnings. Engine displacement is not substituted for horsepower, and accessory dimensions are not treated as hull length. First seen by BoatScout does not mean newly listed by the seller.

## Lake Holiday requirements

The association-authored [public rulebook dated 2024](https://swansonrealestate.net/wp-content/uploads/2025/06/Rules-Regs-2024-Lake-Holiday.pdf), section 4.15, restricts non-pontoons to **less than 21 ft**, counting molded swim platforms; bolted platforms are treated as accessories. Pontoons have a separate 28-ft limit. Engines must not exceed the boat’s rating. Sections 4.27–4.29 prohibit use of wake-enhancing devices and wakesurfing.

The preset is a preliminary length screen. Nominal listing lengths can be rounded or exclude molded platforms, and installed surf equipment does not imply that it can be used on this lake. Confirm the current association rules, actual measured hull/platform length, capacity plate and registration eligibility before purchasing. The official association portal did not permit automated access, so a current 2026 revision could not be verified.

## Refresh

Run from Cursor’s terminal or another terminal in this folder:

```bash
npm run collect
npm run export:snapshot
npm run build
```

The connected website reads the database when refreshed. The standalone development site reads the updated snapshot after reloading. For GitHub Pages, commit and push the changed snapshot and `public/data-mode.json`; the deployment workflow builds the site. Collection itself runs on your local backend. The collector respects source crawl delays and a 24-hour HTML cache; cached passes retain the source observation time rather than claiming a new live check.

Run `npm run geocode:listings` explicitly when new listing cities need coordinates; known cities use `config/locations.json`. The worker does not automatically geocode new cities or export snapshots. Check ambiguous results before relying on their distances. To recreate these preferences in a fresh database, run `node --import tsx scripts/configure-lake-holiday.ts`; this replaces the six named presets and resets their cadence to off, so it is not part of routine refreshes.

Inspect per-source run errors before exporting; the one-shot collector can exit zero despite partial failures. Full manual/scheduled refresh procedures, cache behavior, and daily/weekly options are in [OPERATIONS.md](OPERATIONS.md). No new fixed daily/weekly automation was created during this work.

Maps and city coordinates: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Actual listing photos load from the original sources; sample-image credits apply only to fictional demo records.
