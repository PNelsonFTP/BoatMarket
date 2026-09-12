# Source research and coverage

Research passes: September 7–8, 2026; the latest enabled-source refresh completed September 12. Counts and the current shortlist are in [LIVE_DATA.md](LIVE_DATA.md). This is a collection of advertisements, not a census of all boats for sale or a promise that every ad represents a different available vessel. The September 8 additions below were verified against fresh, robots-permitted source captures before enabling their configurations; collection/export status is tracked separately in the refresh report. Earlier restricted-source research retains its original dates.

## Sources included in automatic collection

| Source | Geographic coverage | Collection method |
|---|---|---|
| Bedford Sales & Outdoors | Morris, IL | Full inventory and details |
| OnlyInboards | IL, WI, IN, IA, MI | All state result pages; details for reported lengths through 21 ft or missing length |
| Miller’s Sport Center | Lanark, IL | Both inventory pages and details |
| Fox Lake Harbor | Fox Lake, IL | All inventory pages; preferred-make details through 21 ft or missing length |
| Lake County Watersports | Wauconda, IL | All inventory pages; excludes standalone motors; preferred-make detail enrichment |
| Ted’s Boatarama | Rock Island, IL | All inventory pages; excludes non-boats; preferred-make detail enrichment |
| Gordy’s Marine | Northern IL / southern WI | Both pages of the dealer’s inventory with published specifications |
| Bass Boat Central | Ads located in IL, WI, IN, IA, MI | Every page for the configured brand sections and alphabetical sections; national ads outside these states excluded |
| Craigslist | 17 nearby regions | Public owner and dealer result pages, joined to their metadata; preferred-make details through 21 ft or missing length |
| Starved Rock Marina | Ottawa, IL | All three used-inventory pages, including advertised prices and lengths |
| Huber’s Marine | La Porte, IN | Public inventory pagination; boat/pontoon types only; rotating detail enrichment for reported hull length, installed motor, HIN and price |
| Quest Watersports | Ottawa, IL | The public inventory response used by the dealer’s own page; 24-item pagination; lift and paired PWC listings excluded |

Craigslist regions: Chicago, La Salle County, Rockford, Peoria, Quad Cities, Milwaukee, Madison, South Bend, Bloomington–Normal, Champaign–Urbana, Springfield IL, Decatur IL, Janesville, Kenosha–Racine, Dubuque, southwest Michigan and Kalamazoo. Out-of-area dealer ads may still appear on these boards; the app uses each ad’s location, not the board’s location, to calculate distance. Cross-posts with different ad IDs may remain separate until reviewed. Connected Settings now shows ranked duplicate pairs and reversible identity decisions.

OnlyInboards, Dealer Spike sites, Gordy’s, Bass Boat Central, Starved Rock, Huber’s and Quest support automatic pagination. Collection has explicit page limits and durable rotating detail budgets. Planned rotation reports deferred detail work and continues it on later refreshes; incomplete inventory discovery or failed requested details remain visible. Source URLs, quality thresholds and limits are editable in `config/sources.json`. Craigslist result pages expose public static results but no total-page census, so their coverage should not be assumed exhaustive.

## Remaining gaps and other sources examined

| Source | Observed result |
|---|---|
| Boat Trader, Water Werks, Hennepin Marine | September 8 robots retest again returned HTTP 403; no inventory request made |
| The Boat House | September 8 robots HTTP 200 permitted the URL; page returned HTTP 403; collection stopped |
| Munson Ski & Marine, Lake Holiday Marina | September 8 robots retest again returned HTTP 403 |
| Boats.com, Boatmart | September 8 robots retest again returned HTTP 403 |
| Huber’s Marine — September 8 detail observation | That scan accepted 31 inventory ads, but the 2026 Harris Cruiser 190 SL detail (13466402i) returned HTTP 403. Summary retained; partial detail coverage recorded; no bypass |
| Huber’s Marine — September 10 detail observations | Five successful inventory pages yielded 29 current ads and passed quality checks; 31 total ads remain retained. Of 29 requested details, 27 succeeded; 2026 Lund Angler 1650 Tiller (13995181i) returned HTTP 403 and 2017 Lund 1875 Crossover XS (14556994i) returned an access challenge. Both restrictions were respected |
| MarineSource | September 8 robots retest again returned HTTP 429; collection stopped |
| SkipperBud’s | September 8 inventory HTML HTTP 200 contains Vue templates without actual boat records. Its linked inventory bundle returned HTTP 406; inspection stopped. A permitted feed/integration is still needed; OnlyInboards may already represent some of its stock |
| Boatzon / Hennepin Marine | Three promising indexed Lund ads checked: removed/sold in current page data; dealer profile returned 404. Excluded from active inventory |
| [Boat Works, Keyesport IL](https://4boatworks.net/inventory/) | September 8 inventory/detail HTTP 200. Tested adapter and disabled wider-region profile ready: 18 boats from 33 items after rejecting motors, other equipment and tractor/PWC; 9 report <=21 ft and >=200 hp. Boat location and dimensions still need confirmation |
| The Boat Center, Chippewa Falls WI / Ramsey MN | September 8 first two pages HTTP 200: 20 stock ads sampled; pagination exposes 14 pages. Tested adapter and disabled wider-region profile; keeps branch state and incoming status. Summary lengths remain unknown, so it adds little to strict length screening without detail enrichment |
| Facebook Marketplace | Manual import; no automated session collection |
| eBay, iboats and other unconfigured marketplaces | Not represented in the collected data |

These limitations are recorded rather than presented as zero inventory. No blocked page or login challenge was bypassed. The association’s public rulebook is still a preliminary eligibility reference; current registration approval and seller availability require confirmation.

The access results above are dated research observations, not fresh probes on every refresh. The proposed fixes and acceptance criteria for these gaps, duplicate ads, and parser limitations are in [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md). Operational refresh steps are in [OPERATIONS.md](OPERATIONS.md).

## Why the visible shortlist is smaller

The main nearby preset selects the preferred fishing and ski makes, active ads within 150 straight-line miles, reported lengths from 18 ft through 21 ft, and at least 200 hp when power is reported. The dedicated fishing preset requires a known 200+ hp. The ski preset allows unreported power. Missing lengths are excluded from strict presets. The inclusive 21-ft screen follows the verified December 2, 2025 association rulebook; manufacturer length including molded platforms, capacity limits and final registration approval still need confirmation.

Use **Include unknown lengths · verify first** for potential candidates whose dimensions need confirmation. Use **All nearby ads · no lake screen** to inspect the broader local inventory without the make, power or lake-length filters. These views are explicit about their wider scope.

The collector does not infer hull length from a model number, trolling motor shaft, Power Pole or trailer measurement. Likewise, displacement such as a 350-cubic-inch inboard is not treated as horsepower. Prices on request and ambiguous locations remain unknown. Sold/pending indicators are retained when exposed by a source.

## September 10 collection and parser follow-up

Run `cc9d1814-d2af-4aad-b0d6-d725724b6efa` completed at **2026-09-10T20:48:10.130Z**. All twelve enabled inventory quality gates passed, with **76 inventory pages**, **287 successful detail pages**, **363 fresh fetches**, **zero cache hits** and **zero budget deferrals**. The two Huber detail failures above leave the run explicitly partial. OnlyInboards used a temporary 150-detail budget for this request; regular source configuration and source restrictions were preserved. No new source or denied marketplace access is implied.

The bounded parser correction distinguishes `Tiger`/`TIGER` from the boat make `Tige`, preserves `Tige21`, and recognizes explicit PWC/jet-ski/WaveRunner labels before generic ski terms. Eight reviewed corrections used this run's captured evidence, verified backups and exact fingerprints, preserving advertisement identity and source observation times. Thirty-four focused tests across five files and typecheck passed. Broader engine-brand inference and ambiguous accessory/PWC cases remain in [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md). Collection, reviewed export and website activation are separate outcomes; consult [VALIDATION.md](VALIDATION.md) and [LIVE_DATA.md](LIVE_DATA.md) for their dated status.

## September 8 engineering follow-up

The fresh September 8 access audit, captured URLs, timestamps and SHA-256 hashes are retained privately under `data/research/access-2026-09-08T16-28-39-046Z`, `access-2026-09-08T16-28-52-615Z`, `access-2026-09-08T16-29-05-272Z`, `access-2026-09-08T16-30-05-918Z`, and `access-2026-09-08T16-30-33-563Z`. The machine-readable ledger at [config/source-access.json](config/source-access.json) retains each source’s own date, including untested older entries. `node --import tsx scripts/probe-source-access.ts URL...` performs a bounded fresh robots-first audit without importing listings; it never follows access challenges or cross-origin redirects.

The staged quality report is `data/research/additional-source-quality-2026-09-08.json`: Huber’s has 31 boat/pontoon ads across both pages, 74% known asking prices and 100% named city/state/make/model; its summaries omit hull length and installed power, which detail enrichment supplies when published. Quest has 7 boats with 86% known prices and complete reported length/power/city/state. Its nearby 2005 Monterey 190 LS Montura BR is advertised at $12,995, 19 ft and 220 hp, about 21 straight-line miles away. This is research evidence, not seller confirmation or lake approval. Huber’s sampled 1999 Ski Nautique detail reports $10,995, 20 ft and 290 hp. Huber’s La Porte city ranking point was independently verified from the [U.S. Census TIGERweb ACS25 municipality table](https://tigerweb.geo.census.gov/tigerwebmain/Files/acs26/tigerweb_acs26_incplace_2025_acs25_in.html): 41.6103189, -86.7149537, approximately 101 straight-line miles from Lake Holiday. This reviewed city centroid is neither a confirmed boat storage address nor a road travel estimate. Evidence is recorded in `data/p1p2/la-porte-city-evidence.json`.

Per-source quality thresholds run across staged full inventory before listing writes. An individual page can fail the full-source price threshold even when its complete inventory passes; the Huber’s second-page preview illustrates this. Do not lower a quality gate merely to force a partial-page import. The collector combines its inventory pages first. Redacted, reduced source fixtures and provenance sidecars live under `tests/fixtures/{hubers,quest,boatworks,boatcenter}-*.html*`; public source captures remain private. Trailing whitespace was normalized in the reduced repository fixtures; sidecar hashes were updated while retaining each original capture hash, and the adapter tests passed again. The Huber parser specifically favors the visible sale price over an obsolete MSRP retained in the printable brochure.

Full refresh reports show configured/discovered/attempted inventory pages, detail eligibility/success/failure/deferred budgets, cache hits, successful fetched pages and observation dates. These measures expose bounded collection; they do not prove complete inventory. The optional wider-region profiles remain disabled to preserve the nearby daily search.

Duplicate review includes same-source reposts, descriptive text and published-contact evidence, bounded canonical image identities, and optional audited local image hashes. Only matching supported HINs group automatically; image similarity is supporting review evidence. The named Butler Crestliner reposts and Fenton Skeeter cross-list were reviewed using captured photo/text/location corroboration; distinct Wauconda Alumacraft stock HINs remain separated. Permanent vessel identities and alias/history events preserve ad-level notes, favorites and source history through merge/split/undo. Queue counts change with filters and collection; the former 163-pair baseline is historical.

City enrichment ranks state/ZIP evidence and suburbs, retains ambiguous lookups, and supports reviewed approximate-city corrections. Boat storage location is distinct from seller/dealer location. No seller was contacted and no login/challenge was bypassed in this research pass.
