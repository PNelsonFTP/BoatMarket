# Source research and coverage

Research pass: September 7, 2026. Counts and the current shortlist are in [LIVE_DATA.md](LIVE_DATA.md). This is a collection of advertisements, not a census of all boats for sale or a promise that every ad represents a different available vessel.

## Sources included in automatic collection

| Source | Geographic coverage | Collection method |
|---|---|---|
| Bedford Sales & Outdoors | Morris, IL | Full inventory and details |
| OnlyInboards | IL, WI, IN, IA, MI | All state result pages; details for reported lengths below 21 ft or missing length |
| Miller’s Sport Center | Lanark, IL | Both inventory pages and details |
| Fox Lake Harbor | Fox Lake, IL | All inventory pages; preferred-make details below 21 ft or missing length |
| Lake County Watersports | Wauconda, IL | All inventory pages; excludes standalone motors; preferred-make detail enrichment |
| Ted’s Boatarama | Rock Island, IL | All inventory pages; excludes non-boats; preferred-make detail enrichment |
| Gordy’s Marine | Northern IL / southern WI | Both pages of the dealer’s inventory with published specifications |
| Bass Boat Central | Ads located in IL, WI, IN, IA, MI | Every page for the configured brand sections and alphabetical sections; national ads outside these states excluded |
| Craigslist | 17 nearby regions | Public owner and dealer result pages, joined to their metadata; preferred-make details below 21 ft or missing length |
| Starved Rock Marina | Ottawa, IL | All three used-inventory pages, including advertised prices and lengths |

Craigslist regions: Chicago, La Salle County, Rockford, Peoria, Quad Cities, Milwaukee, Madison, South Bend, Bloomington–Normal, Champaign–Urbana, Springfield IL, Decatur IL, Janesville, Kenosha–Racine, Dubuque, southwest Michigan and Kalamazoo. Out-of-area dealer ads may still appear on these boards; the app uses each ad’s location, not the board’s location, to calculate distance. Cross-posts with different ad IDs may remain separate until reviewed. Connected Settings now shows ranked duplicate pairs and reversible identity decisions.

OnlyInboards, Dealer Spike sites, Gordy’s, Bass Boat Central and Starved Rock now support automatic pagination. Collection has page and detail limits, and inventory and requested-detail limits produce a partial outcome with coverage metrics. Source URLs and limits are editable in `config/sources.json`. Craigslist result pages expose public static results but no total-page census, so their coverage should not be assumed exhaustive.

## Remaining gaps and other sources examined

| Source | Observed result |
|---|---|
| Boat Trader, Water Werks, Hennepin Marine | Robots requests returned HTTP 403 |
| The Boat House, Huber’s Marine | Listing requests returned HTTP 403 |
| Munson Ski & Marine, Lake Holiday Marina | Robots requests returned HTTP 403 |
| Boats.com, Boatmart | Robots requests returned HTTP 403 |
| MarineSource | Robots request returned HTTP 429; collection stopped |
| SkipperBud’s | Public HTML accessible, but its JavaScript inventory needs another integration |
| Quest Watersports, Ottawa | Inventory page accessible; no boat records exposed in the HTML tested |
| Boatzon / Hennepin Marine | Three promising indexed Lund ads checked: removed/sold in current page data; dealer profile returned 404. Excluded from active inventory |
| Boat Works, Keyesport IL | Inventory accessible; outside the core 150-mile area, not integrated in this pass |
| The Boat Center, Chippewa Falls WI / Minnesota | Inventory accessible; outside the core area, not integrated in this pass |
| Facebook Marketplace | Manual import; no automated session collection |
| eBay, iboats and other unconfigured marketplaces | Not represented in the collected data |

These limitations are recorded rather than presented as zero inventory. No blocked page or login challenge was bypassed. The association’s public rulebook is still a preliminary eligibility reference; current registration approval and seller availability require confirmation.

The access results above are dated research observations, not fresh probes on every refresh. The proposed fixes and acceptance criteria for these gaps, duplicate ads, and parser limitations are in [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md). Operational refresh steps are in [OPERATIONS.md](OPERATIONS.md).

## Why the visible shortlist is smaller

The main nearby preset selects the preferred fishing and ski makes, active ads within 150 straight-line miles, reported lengths from 18 ft to strictly below 21 ft, and at least 200 hp when power is reported. The dedicated fishing preset requires a known 200+ hp. The ski preset allows unreported power. Missing lengths are excluded from strict presets.

Use **Include unknown lengths · verify first** for potential candidates whose dimensions need confirmation. Use **All nearby ads · no lake screen** to inspect the broader local inventory without the make, power or lake-length filters. These views are explicit about their wider scope.

The collector does not infer hull length from a model number, trolling motor shaft, Power Pole or trailer measurement. Likewise, displacement such as a 350-cubic-inch inboard is not treated as horsepower. Prices on request and ambiguous locations remain unknown. Sold/pending indicators are retained when exposed by a source.

## September 8 engineering follow-up

The source roster and dated access observations above remain unchanged; this pass did not re-probe blocked sites. [config/source-access.json](config/source-access.json) now stores all 21 source/service gaps for the Settings health panel. Full refresh reports show configured/discovered/attempted inventory pages, detail eligibility/success/failure/caps, cache hits, successful fetched HTML pages and observation dates. These measures expose bounded collection; they do not prove complete inventory. Existing successful source summaries can still be useful when detail caps make the overall result partial.

Duplicate review now includes same-source reposts; 163 candidate pairs were identified in the existing 1,538 ads. The HIN reindex found 144 structurally usable HINs but no repeated valid HINs, so no automatic groups were created. City enrichment ranks state/ZIP evidence and suburbs, retains ambiguous lookups, and supports reviewed approximate-city corrections. Actual offsite boat locations remain unknown.
