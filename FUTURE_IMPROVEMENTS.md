# Future improvements and known limitations

This roadmap documents the delivered BoatScout implementation and the September 7, 2026 collection pass. Source-access failures below are dated observations, **not fresh access tests**. The published snapshot was generated September 8 at 02:20 UTC (September 7 at 9:20 PM Central) and contains 1,538 advertisements. A successful collection run establishes what the configured pages exposed; it does not establish complete market coverage, distinct vessels, seller availability, or lake registration eligibility.

No daily or weekly Codex automation was scheduled. The existing local worker and saved-search alert cadences are separate features. See [README.md](README.md), [HANDOFF.md](HANDOFF.md), [LIVE_DATA.md](LIVE_DATA.md), and [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) for operation and the delivered state. The items below are proposals, not claims of implemented functionality.

## Suggested order

| Priority | Work | Why it matters |
|---|---|---|
| P1 | Observable refresh, export, and publication workflow | A successful-looking command or recent snapshot timestamp can hide partial collection or older observations. |
| P1 | Reversible duplicate review and stronger vessel identity | Repeated ads inflate shortlist counts, market charts, and alerts. |
| P1 | Coverage and source health reporting | Missing or restricted sources must remain visible as coverage gaps. |
| P1 | Field provenance, location review, and lake verification | A promising listing can have rounded dimensions, uncertain power, or a misleading travel distance. |
| P2 | Durable scheduling, alert delivery, and run recovery | Daily unattended operation needs explicit outcomes and recovery. |
| P2 | Parser regression fixtures and inventory quality checks | Site changes and stock cards can silently degrade usable results. |
| P2 | Retention, backup, publication controls, and dependency inventory | Long-lived collection needs reproducible evidence and maintainable operations. |
| P3 | Broader regions, richer comparisons, and optional hosted backend | Useful after the existing regional workflow is reliable and understandable. |

## Confirmed open struggles

### 1. Cross-listing and same-marketplace duplicates remain unresolved

**Evidence and impact.** The current [snapshot](public/snapshot.json) has **zero populated `groupId` values across 1,538 ads**. Grouping support exists, but this dataset has not been collapsed into distinct physical boats. Identical-looking inventory can inflate counts and make repeated advertisements look like additional choices.

The actual automatic grouping path is narrower than “match by HIN” alone:

- [The repository](server/repository.ts) first selects at most 100 candidates with **exact stored make, model, and year**, excluding the same source. A matching HIN on records with different spelling, model normalization, or year never reaches the matcher.
- [The matcher](server/dedup.ts) rejects same-source pairs. Within the candidate set it accepts a normalized HIN of at least ten characters, or matching normalized make/model/year, length within 0.25 ft, equal known horsepower, equal seller name, and an **exact shared photo URL**.
- Rehosted/resized photo URLs, absent seller names, unknown power/length, and regional Craigslist reposts therefore commonly remain separate. Existing groups also lack a user-facing merge/split review workflow and a complete re-evaluation pass.
- Different HINs are not an explicit veto on the seller/photo/core-spec fallback. Shared stock photography makes that fallback an area to harden before expanding its use.

Examples from the saved public snapshot, not new seller confirmations:

| Example | Observed evidence | Interpretation |
|---|---|---|
| Crestliner Sportsman 16, Butler WI, $2,200 | Three Craigslist IDs with the same title, reported 16 ft/25 hp, and exact lead photo URL: [ad one](https://www.craigslist.org/view/d/butler-crestliner-sportsman-16/xtGUVtyedTMS4iKSByThu6), [ad two](https://www.craigslist.org/view/d/butler-crestliner-sportsman-16/jzpJAdczKNdQgAxyt2yeba), [ad three](https://www.craigslist.org/view/d/butler-crestliner-sportsman-16/pSL5CrWcFsMLwizobFbo3J). | Strong repost candidate; all three remain separate because same-source grouping is excluded. Physical identity still requires review. |
| 2002 Skeeter ZX225, Fenton MI, $18,500 | [Craigslist](https://www.craigslist.org/view/d/fenton-2002-skeeter-225-yamaha-vmx/pT2XQgzJZuSua1hqsiDTbc) and [Bass Boat Central](https://bassboatcentral.com/boats-for-sale/skeeter/#gallery-17362-3) agree on year/model/city/price, but have differently hosted images and complementary missing length/power fields. | Possible cross-site duplicate; shared headline facts alone are insufficient for an automatic merge. |
| 2026 Alumacraft Voyageur 175 Tiller, Wauconda IL, $31,995 | [Inventory 17703492](https://www.lakecountywatersports.com/NEW-Inventory-2026-Alumacraft-Boat-Voyageur-175-Tiller-Lake-County-Watersports-17703492?ref=list) and [inventory 17703464](https://www.lakecountywatersports.com/NEW-Inventory-2026-Alumacraft-Boat-Voyageur-175-Tiller-Lake-County-Watersports-17703464?ref=list) have matching model/specifications/price but **different reported HINs**. | Counterexample: matching specs and price can describe different stock units. Preserve both. |

**Current mitigation.** Counts are described as ads, every source link remains inspectable, and grouping avoids fuzzy title-only merges. Favorites and notes can help track a candidate while its identity is investigated.

**Suggested change.** Add a review queue with reversible “same vessel” and “different vessel” decisions. Extract and normalize a validated HIN independently of exact make/model/year candidate selection; recognize optional country prefixes carefully. Treat conflicting valid HINs as a hard conflict. Use seller identity, location, original image identity, and descriptive similarity to rank review candidates. Image similarity can provide evidence but should not itself merge boats. Keep listing-level provenance, prices, status, and history under the vessel group.

**Acceptance criteria.** A verified HIN match can be found despite model spelling differences; conflicting HINs stay separate; same-source repost candidates are reviewable; merge and undo preserve every link, price observation, note, and favorite; source ad counts remain available alongside reviewed vessel counts; fixtures cover stock-photo reuse and the examples above.

### 2. Restricted, unsupported, and unconfigured sources leave substantial gaps

The following ledger carries forward **every gap in [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md)**. “Blocked” below describes the observed request result, not a permanent judgment about a business or a claim that it has no boats.

| Source or service | September 7 observation / current integration state | Next safe action |
|---|---|---|
| Boat Trader | Robots request returned HTTP 403; disabled. | Check for a permitted feed/API or manually import selected ads; record a dated access retest if appropriate. |
| Water Werks | Robots request returned HTTP 403. | Investigate a dealer-provided inventory feed or manual imports. |
| Hennepin Marine | Robots request returned HTTP 403. | Seek a permitted dealer source; do not substitute sold indexed ads as active stock. |
| The Boat House | Listing request returned HTTP 403. | Investigate a permitted inventory feed or manual review. |
| Huber’s Marine | Listing request returned HTTP 403. | Investigate a permitted feed or manually supplied listing URLs/data. |
| Munson Ski & Marine | Robots request returned HTTP 403; disabled. | Check permitted dealer inventory access; retain as an explicit local coverage gap. |
| Lake Holiday Marina | Robots request returned HTTP 403; disabled. | Manual local inventory review or a dealer-provided feed. |
| Boats.com | Robots request returned HTTP 403; not enabled. | Evaluate a supported feed/API; do not assume the generic adapter provides coverage. |
| Boatmart | Robots request returned HTTP 403. | Evaluate permitted data access or manual imports. |
| MarineSource | Robots request returned HTTP 429; stopped. | Respect throttling; perform only a limited, dated later check or obtain a feed. |
| SkipperBud’s | Public HTML was accessible; useful JavaScript inventory needs another integration. | Inspect permitted public inventory data and build/test a dedicated parser. |
| Quest Watersports, Ottawa | Inventory HTML accessible; no boat records exposed in the tested page. | Determine the permitted inventory data source and add fixtures before enabling it. |
| Boatzon / Hennepin Marine | Three promising indexed Lund ads had sold/removed flags in page data; dealer profile returned 404. Those records were excluded from active inventory. | Require current availability evidence and stable inventory discovery before integrating. Search results and generic `InStock` markup alone are insufficient. |
| Boat Works, Keyesport IL | Inventory accessible; outside the core 150-mile search and not integrated. | Consider when widening travel range; evaluate value before adding requests. |
| The Boat Center, Chippewa Falls WI / Minnesota | Inventory accessible; outside the core area and not integrated. | Consider as an explicit wider-region source. |
| Facebook Marketplace | Manual canonical JSON import only; no automated authenticated-session collection. | Improve manual capture/import validation or use an officially supported export/integration if available. |
| eBay Motors | Unconfigured and absent from collected data; adapter name is not live integration validation. | Evaluate a supported API/feed and separate auctions from fixed asking prices. |
| iboats | Unconfigured and absent from collected data. | Verify access and build representative fixtures before enabling. |
| Other unconfigured marketplaces | No claim of coverage. YachtWorld and CPO configuration/adapter placeholders also do not establish live collection. | Maintain a source backlog with geography, expected inventory, access method, and verification date. |
| Lake Holiday association portal | Automated access did not permit verification of a current rulebook revision. | Obtain current association documentation through an allowed channel and record its effective date. |

**Current mitigation.** Restricted requests stop; failed sources do not delete prior inventory. The coverage panel and source report disclose gaps. No login challenge or access restriction was bypassed.

**Suggested change.** Store the access ledger as structured data with last attempt, last successful observation, expected geographic scope, disable reason, integration maturity, and fallback. Prefer direct dealer feeds, official APIs, and manual imports over fragile or restricted scraping. Any source outreach would be a separate user-authorized action.

**Acceptance criteria.** Every enabled source shows its last successful observation and coverage scope; disabled/failed sources are visibly missing coverage rather than zero boats; repeated denials back off; an enabled source has stable IDs, pagination evidence, status handling, and fixture tests. Never claim all regional inventory has been found merely because all configured runs succeeded.

### 3. Collection freshness, database refresh, and website publication are separate

**Evidence and impact.** [The collector](server/collector.ts) caches each page for 24 hours. [The worker](server/worker.ts) runs collection and alert evaluation every 30 minutes by default, waiting the interval **after** each cycle completes. It does not geocode new cities, export a snapshot, build the frontend, or publish GitHub Pages. [Snapshot export](scripts/export-snapshot.ts) writes a new generation timestamp even if every source observation is older; the connected API’s response generation time likewise is not a new source check. The Pages workflow builds committed data and does not collect marketplace inventory. No new daily/weekly schedule was installed in this conversation.

**Current mitigation.** Cached pages retain observation timestamps in `summaryCheckedAt`, `detailsCheckedAt`, and `lastSeenAt`. Source coverage exposes observation dates. An operator can explicitly collect, inspect run outcomes, resolve new locations, export, and build/publish.

**Suggested change.** Add one documented refresh job that records an overall run ID and performs collection → outcome validation → controlled location enrichment/review → snapshot export → validation → optional authorized publication. Make cadence and cache age explicit per source. Report which pages were fetched versus reused, changed boats versus metadata-only updates, and which sources remain stale. Do not disable the cache or bypass crawl limits merely to make a “refresh” appear new.

**Acceptance criteria.** A daily or weekly run has a durable next/last run time; source observation dates remain distinct from export/publication time; partial results are labeled; a failed refresh cannot silently replace a good published snapshot; the local machine’s availability requirement is explicit; publication only occurs through the configured authorized workflow.

### 4. Exit codes and run recovery need hardening before unattended operation

**Evidence and impact.** These are implementation risks verified from [worker code](server/worker.ts), [collector code](server/collector.ts), and [lease storage](server/repository.ts), not reports that concurrent data corruption occurred:

- `tick()` logs caught failures without setting a nonzero exit code. Per-source failures are returned as error runs rather than thrown, and a busy collector returns `{ busy: true, runs: [] }`. Consequently `npm run collect` exiting zero does **not** prove the requested collection ran successfully.
- An API collection request is asynchronous; HTTP 202 acknowledges the request, not completion. Partial page/detail successes are persisted and errors recorded. A downstream export must inspect run history rather than infer completion from command/HTTP success.
- The collector renews its one-hour lease at inventory-page boundaries, not during each detail request. Very long detail batches can exceed that lease. Lease-loss errors are caught at page level rather than aborting the entire process immediately. The alert lease is ten minutes without renewal during a long delivery batch.
- A crash can leave a run marked running until operator review; there is no comprehensive stale-run recovery/reconciliation command. Signals request worker shutdown but do not immediately cancel a currently active collection cycle.
- A detail request failure can leave the newly parsed summary to be upserted. There is no general field-by-field policy preserving the previous enriched detail values until a newer successful detail observation replaces them.
- `/api/health` reports application identity and password configuration, not database readiness, worker liveness, or recent collection success. A healthy HTTP endpoint does not prove the refresh pipeline is healthy.

**Current mitigation.** Source run errors, counters, logs, and owner-scoped leases exist. Previous inventory is not bulk-marked removed because a page fails. Operators should inspect completed source runs before exporting and avoid intentionally starting overlapping refresh processes.

**Suggested change.** Return a structured cycle result and meaningful exit status for busy, partial, and failed runs; support explicit “skip busy” policy when desired. Renew leases during detail/delivery work, abort on lease loss, record cancellation, and reconcile abandoned runs on startup. Separate process liveness from database readiness and worker/source freshness. Retain previously observed field values with provenance when enrichment fails, while clearly marking their age.

**Acceptance criteria.** Injected source failures and busy locks are distinguishable from a successful new run in both CLI and API; a lease-expiry test cannot produce overlapping writes from two owners; partial runs remain inspectable; interrupted runs can resume safely; a failed detail fetch neither invents a fresh check nor silently erases useful prior specifications.

### 5. Geographic filtering is approximate, and some city names remain ambiguous

**Evidence and impact.** [Distance filtering](lib/search.ts) uses Haversine straight-line miles, not route miles or hours. A boat across Lake Michigan can be relatively close on the map but much farther away by road. [Location enrichment](server/locations.ts) preserves source coordinates or uses approximate city centers; [the explicit geocode script](scripts/geocode-collected.ts) processes up to 100 previously uncached cities per invocation in IL/WI/IN/IA/MI and chooses the first result with an accepted locality type. It does not generally resolve competing same-name towns, vague regions, or conflicting ZIPs.

An Allendale, Michigan lookup previously chose the Clare County hamlet because the more relevant Ottawa County locality was classified as a suburb. **That specific cache entry was corrected** in [config/locations.json](config/locations.json); the generic ambiguity-selection problem is still open. The collection report records 19 active ads without usable locations, including ambiguous Green Bay, Clay, Lake Country, and Chicagoland locations and an explicitly off-site Bedford boat.

**Current mitigation.** Approximate locations are labeled, known cities are cached, source coordinates are not routinely overwritten, and unknown locations fail nearby presets. Geocoding is an explicit action, not an uncontrolled worker loop.

**Suggested change.** Add a location review queue with candidate locality/county/ZIP evidence and persistent overrides. Keep boat location separate from seller office. Add optional cached road-route time estimates with a provider or local routing engine chosen for its permitted usage; label estimates and distinguish them from exact addresses. Extend geographic source discovery separately when going nationwide.

**Acceptance criteria.** The Allendale ambiguity has a regression fixture; unresolved or contradictory locations are never assigned an arbitrary nearby point; overrides survive collection; a travel-time filter handles routes around Lake Michigan; routing/geocoding failures preserve unknown values instead of inventing travel times.

### 6. Listing specifications and the lake screen need stronger verification

**Evidence and impact.** [Lake Holiday presets](lib/lake-holiday.ts) use a preliminary strict-under-21-ft screen based on the association-authored public 2024 rulebook described in [LIVE_DATA.md](LIVE_DATA.md). A current 2026 revision was not verified. The screen does not confirm molded swim-platform measurements, the hull’s capacity plate, actual installed motor power, or registration approval. Advertised lengths are often nominal or rounded; an integer 20 ft is not an independently measured hull length. “Under 21 ft as listed” is the correct scope.

The main nearby preset permits unknown horsepower, while the dedicated 200+ hp fishing preset requires reported power. Unknown lengths are offered only in the explicit broader review view. Parser warnings handle some conflicting power and implausible dimensions, but not every inaccurate seller statement. Pending-sale information is retained in specifications/badges while a record can still have `status: active`. The broader inventory also includes boat types outside the preferred fishing/ski use case.

**Current mitigation.** Original listings, observed fields, confidence values, warnings, strict unknown-length handling, and broader review views are available. Accessory measurements and engine displacement are not substituted for hull length or horsepower.

**Suggested change.** Add field-level evidence including original text, unit, source page, observation date, and whether the value is nominal, measured, inferred, or manually verified. Separate installed horsepower from capacity rating and auxiliary/trolling motors. Make availability states and sale-pending filters explicit. Attach current rule versions and a seller/association verification checklist to promising boats without presenting screening as approval.

**Acceptance criteria.** A nominal length cannot be displayed as a verified measured length; conflicting specs are visible; known overlength boats never enter the strict shortlist; unknown-power inclusion is clear; pending boats can be hidden; current rule updates carry provenance/effective dates and preserve prior versions.

### 7. Page limits, selective details, and changing markup constrain coverage

**Evidence and impact.** [Source configuration](config/sources.json) intentionally limits collection. [The schema](server/adapters/types.ts) allows at most 50 sources, 30 seed URLs per source, up to 100 inventory pages, and up to 150 detail pages per source. Defaults are 40 inventory and 80 detail pages. An inventory-page cap produces a coverage error, but exhausting the detail cap or skipping details by make/length is not separately counted as an incompleteness warning. Craigslist static results have no proven total-result census or implemented complete pagination. Dashboard search filters do not rewrite source URLs.

Preferred-make and reported-length filters focus detail requests on likely candidates. This leaves other ads as summaries, and a wrong summary length can prevent fetching details that might correct it. Bass Boat Central often omits hull length; Starved Rock currently supplies inventory summaries without detail enrichment. Generic structured-data/selector adapters do not establish compatibility with every marketplace. Stock model pages, orderable inventory, non-boat ads, inconsistent dates, and stale generic availability markup need source-specific handling.

**Current mitigation.** Ten sources have dedicated live-tested parsing, supported pagination follows same-origin URLs, duplicate IDs within a run are suppressed, empty/challenged pages generate errors, and sample records remain separate. [Expanded parser tests](tests/expanded.test.ts) cover important failure cases.

**Suggested change.** Add per-source metrics for discovered/visited/skipped pages, eligible/skipped/failed details, parse yield, missing critical fields, exact vs summary identity, and source-provided expected counts. Introduce a bounded detail-review queue independent of a single run. Maintain sanitized fixtures and source-health thresholds; inspect a sharp count/specification drop before accepting it as a market change. Treat catalog/model cards as a different record class unless specific inventory identity is proven.

**Acceptance criteria.** A cap or intentional detail skip is visible in the UI/report; completion is scoped to discovered configured pages; a known markup change fails a fixture or health check; non-inventory cards are not reported as confirmed available stock; manually imported records retain their distinct provenance.

### 8. Alerts have useful delivery support but limited change semantics

**Evidence and impact.** [Alert evaluation](server/alerts.ts) establishes a baseline on the first check, then compares IDs and `[price, status]` for current matching results. It does not alert when a boat drops out of a saved filter, and metadata changes alone do not create alerts. Unresolved reposts can look like new boats. A worker interval is not an exact wall-clock alert schedule; source caching can delay the underlying discovery.

The delivery outbox processes up to 50 pending alerts per cycle, with at most five attempts. There is no exponential retry schedule or user-facing failed-delivery replay command. Successfully completed channels are removed before later retries, but a process crash after an external send and before recording success can still result in duplicate delivery. A message ID helps email systems but does not guarantee exactly-once delivery. SMTP/webhook destination setup is required; the supplied Lake Holiday presets start with cadence off, so their presence does not mean notifications are enabled.

**Current mitigation.** Durable in-app records, channel-specific progress, delivery errors visible in Settings, baseline suppression, and user-selectable hourly/daily/weekly cadences exist. No new external notification destination or schedule was configured for this documentation task.

**Suggested change.** Offer separate event choices for new matches, price decreases/increases, sales/removals, and no-longer-matching boats. Extend the existing failed-delivery display with retry/backoff, replay, and idempotency keys for supporting webhook receivers. Add source freshness and collection failure notifications independently of listing-match alerts.

**Acceptance criteria.** Baseline remains quiet; each event type is testable; retries do not resend already-recorded successful channels; a failed destination is visible and recoverable; duplicate-candidate handling does not silently suppress a genuinely new boat; notification configuration explicitly identifies cadence and destination.

### 9. Local evidence, public snapshots, and browser workspaces need lifecycle controls

**Evidence and impact.** [The collector](server/collector.ts) overwrites a URL’s cached HTML on a later successful fetch and stores references plus normalized payloads. This is useful current evidence, not an immutable archive of every observation. Database price histories, run records, raw references, logs, and scratch research can grow; there is no comprehensive retention or compaction command. The cache TTL is a reuse policy, not a deletion policy.

[Snapshot export](scripts/export-snapshot.ts) excludes raw payloads and personal workspace data but deliberately includes listing descriptions, seller names, public source links, and photo URLs; review this public listing content before publication. Remote photos can disappear or reject embedding, and map/photo providers are contacted by the visitor’s browser. Public listing data is not automatically cleared just because a source changes or disappears.

[Browser storage](lib/client.ts) uses fixed `boatscout.*` keys scoped to browser origin, not deployment path or backend identity. Two BoatScout deployments under different paths on the same GitHub Pages origin can share standalone workspace/API preferences. Snapshot imports change the current session’s dataset; they do not write the published snapshot file. Existing saved/cached filters do not receive every later preset improvement automatically.

The [connected import endpoint](server/app.ts) accepts at most **1,000 records per request**, while the [Settings import/export controls](components/settings.tsx) export all listings and submit an imported file without batching. Therefore the current **1,538-record export cannot be imported into a backend in one UI operation**. Standalone snapshot validation allows 10,000 records. Both the Settings file limit and API body limit are 12 MiB; the current snapshot is about 4.0 MB, so record count is the present blocker. Imports upsert one record at a time rather than using a single all-or-nothing transaction; a later conflict can leave earlier rows imported. Exported workspace JSON also has no corresponding general workspace-import control in Settings.

The [Lake Holiday initializer](scripts/configure-lake-holiday.ts) replaces its six named preset IDs and the matching rule with current defaults, including cadence off. It preserves unrelated searches, favorites, and notes but is **not a routine data-refresh command**. Re-running it can overwrite customized preset filters or notification cadence.

**Current mitigation.** Credentials and raw local data are ignored by version control, publication omits private workspace state, connected state is versioned, and workspace export plus stop-and-copy database backups are documented. Existing presets are preserved rather than silently overwriting user preferences.

**Suggested change.** Define retention and backup policies, provide a tested restore workflow, and decide which sanitized observations warrant immutable hashes/archives. Add a public-export preview/redaction step and atomic snapshot replacement. Support validated chunked/resumable listing import with a preview, outcome manifest, and clear partial-failure behavior; provide an explicit workspace restore flow. Namespace browser keys by deployment and backend; migrate old state deliberately and show preset updates as an explicit choice. Make the initializer's overwrite behavior explicit or introduce a preserve-customizations migration mode. Keep future muscle-car code/data/configuration independent; sharing a design does not require sharing storage identifiers.

**Acceptance criteria.** The full 1,538-record export can round-trip through the supported backend import flow; failures identify exactly which records were persisted; a restored backup preserves notes, favorites, histories, source settings, and rule versions; retention cannot delete necessary active evidence unnoticed; a public export contains no private workspace or secrets; separate deployments do not overwrite each other’s preferences; interrupted export cannot leave a truncated published JSON file; routine refresh leaves customized searches and cadences unchanged.

### 10. Dependency inventory has an optional bundled-package boundary

See [SBOM.md](SBOM.md) for exact artifact scope, generation commands, and limitations. The delivered npm CycloneDX inventories cover 222 production components and 319 development/build/runtime components with optional branches omitted; the supplemental lock inventory preserves all 435 available non-root lock entries. These overlapping inventories should not be added together or treated as a complete container image inventory.

The official npm full lock-only CycloneDX operation encountered `ESBOMPROBLEMS` for four dependencies bundled inside the optional WASM package `@tailwindcss/oxide-wasm32-wasi@4.3.3`: `@emnapi/core`, `@emnapi/wasi-threads`, `@napi-rs/wasm-runtime`, and `@tybys/wasm-util`. Their resolved bundled versions are not individually enumerated in the lockfile. This is a **full SBOM enumeration limitation**, not evidence that the normal installation or current build failed. Valid scoped inventories and the complete available lockfile inventory are documented with their boundaries.

The delivered validation checks graph references and lock correspondence but does not perform full CycloneDX JSON Schema validation. Container/system packages, Node, Playwright browser downloads, and Prisma engines need additional artifact-specific inventories. Docker and Actions use mutable version tags. The project has no first-party license declaration yet; `private: true` in `package.json` does not select a code license.

**Suggested change.** In a controlled future dependency update, inspect the optional package's published bundle metadata, account for exact bundled component versions/licenses, and regenerate all SBOM scopes. Add full schema validation and repeatable SBOM/license/audit checks to release validation. Pin reviewed release tool/image digests when reproducibility is needed, and choose a first-party license deliberately before distributing the code. Preserve the distinction between a lockfile inventory, installed platform inventory, production dependency graph, build dependencies, and container/base-image inventory.

**Acceptance criteria.** Every artifact declares its scope and exclusions; bundled components have verified exact versions or explicit unknowns; generation failures cannot be reported as a complete SBOM; dependency changes are tested on the supported runtime without treating an audit result as a permanent security guarantee.

## Previously fixed issues to keep covered by regression tests

These are completed fixes, not current backlog claims. Source changes could reintroduce similar failures, so retain the evidence and tests.

| Fixed issue | Delivered behavior / evidence |
|---|---|
| Initial collection was too narrow. | Expanded from 257 to 1,538 ads, ten sources, seventeen Craigslist regions, and supported dealer/marketplace pagination. The remaining gaps are documented above. See [LIVE_DATA.md](LIVE_DATA.md). |
| Alternate page links inflated source counts and could overwrite enriched detail records. | Per-source `seenListings` suppresses a repeated listing ID in one run. See [server/collector.ts](server/collector.ts). This does not solve distinct-ID reposts. |
| Craigslist metadata positions could assign another ad’s location/details. | Metadata joins use identifying text/price with location disambiguation, not array position alone. Modern attribute labels are supported. See [tests/expanded.test.ts](tests/expanded.test.ts). |
| Dealer price extraction could prefer an old crossed-out price. | Dedicated inventory parsing selects current price and preserves actual unit identity. See [server/adapters/expanded.ts](server/adapters/expanded.ts). |
| Accessory dimensions or engine displacement could appear to be boat length/power. | Explicit hull-length contexts, installed-motor extraction, no-motor handling, and conflict warnings prevent the known errors. See [tests/expanded.test.ts](tests/expanded.test.ts). |
| Generic JSON-LD without item URLs could collapse multiple products into a false single boat. | Multi-product records lacking individual identity are skipped; dealer organizations are not treated as boats. See [server/adapters/index.ts](server/adapters/index.ts). |
| Repeated cached passes were slow and could look newly observed. | Recent local cache is read before new network checks; original observation time is retained. New network fetches still check robots and crawl delays. See [tests/cache.test.ts](tests/cache.test.ts). |
| Known geocoded cities consumed the limited lookup batch. | The script filters known cities before its 100-query cap. Allendale’s specific incorrect cache entry was corrected. General ambiguity review remains open. |
| Strict shortlists hid why there seemed to be few boats. | Coverage counts plus unknown-length and all-nearby views make excluded inventory accessible without silently relaxing the lake screen. See [components/source-coverage.tsx](components/source-coverage.tsx). |

## Later enhancements

- **Travel and regional expansion:** source-region presets independent of UI filters; reviewed driving-time searches; wider Great Lakes coverage before nationwide requests. Measure marginal useful boats per source before increasing crawl volume.
- **Buying workflow:** inspection checklist, seller-confirmed availability/date, measured length/platform evidence, motor serial/capacity-plate notes, trailer/towing requirements, viewing appointments, and an exportable comparison packet. Keep manual verification distinct from scraped claims.
- **Market analysis:** longer asking-price histories, uncertainty and coverage labels, reviewed vessel-level statistics, and source-specific days-tracked versus seller-advertised age. Do not describe asking-price changes as verified sale prices or appraisals.
- **Source maintenance tools:** fixture capture/redaction, dry-run parsing, a before/after import diff, a reviewed reparse command, and source-health dashboards. Prefer these over one-off scripts in ignored research directories.
- **Optional remote operation:** a hosted worker/API can run while the local computer is off, but needs managed secrets, HTTPS, backups, monitoring, and a deliberate deployment decision. GitHub Pages remains a static frontend. Multi-user hosting additionally needs real identity, ownership checks, and durable sessions; the current backend represents one local user.
- **Performance and data scale:** benchmark search/map rendering and snapshot size before introducing pagination, compressed snapshots, background web workers, or PostgreSQL/PostGIS. Current SQLite and in-browser filtering are intentional single-user choices, not an already-implemented nationwide service.

For every enhancement, update [README.md](README.md), [HANDOFF.md](HANDOFF.md), [VALIDATION.md](VALIDATION.md), source coverage, and the SBOM when relevant. Keep “implemented,” “tested,” “observed limitation,” and “proposed” separate so the next maintainer can trust the handoff.
