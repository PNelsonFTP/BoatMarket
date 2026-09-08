# Opening prompt — MuscleScout classic car search

Copy this file into the new, separate project directory. Open **that directory** in Cursor or another coding agent and use this opening message:

> Read `MuscleCarPrompt.md` and build the project it describes. Work through implementation, real source research, an initial collection, and verification. Make sensible decisions, document them, and ask only when an unresolved choice materially blocks progress.

Everything below is the project specification. It is self-contained; access to BoatScout is not required.

---

## 1. What I want to accomplish

Build **MuscleScout**, a personal car-shopping website with a local backend. I want to find, research, compare, and track classic cars for sale without repeatedly searching many marketplaces and dealer websites.

My everyday search is:

- **Ford Mustang, Chevrolet Camaro, and Chevrolet Corvette.** Normalize common spelling variations, including “Camero,” while retaining the seller’s original wording.
- **Model years 1960–1989, inclusive.** This is a requested search window, not a claim that every model existed in every year. Verify model/generation boundaries before encoding them.
- **Home: Wheaton, Illinois.** Use an editable city-center reference, resolved and cached from a geocoder. I have not supplied a street address.
- **Up to four hours of one-way driving** from home initially. Favor closer cars within that window.
- Allow expansion to **nationwide United States** when I choose it.
- Provide a separate, normally disabled **specialty Mustang expansion** for SVT/Cobra cars from the 1960s through the current model year. Make related specialty variants configurable.

I have not specified a budget, transmission, minimum horsepower, body style, condition threshold, or originality requirement. Keep these unrestricted initially and provide useful filters. Do not quietly eliminate six-cylinder cars, project cars, automatics, or ads missing specifications.

Build a complete, usable product with real collection and visible limitations. The interface should resemble the capabilities of a polished vehicle-search workspace: search, maps, favorites, notes, comparisons, saved searches, price history, alerts, and source coverage.

## 2. Keep this project independent

This is a separate application from the existing boating project.

- Work entirely inside the new project root. Keep its repository, dependencies, database, migrations, configuration, caches, logs, snapshots, credentials, and deployment independent.
- Use car-specific naming, schemas, branding, launchers, tasks, environment variables, browser storage keys, and Docker project/volume names.
- Suggested local ports: **3100 for the website and 4410 for the backend**, configurable if occupied. Detect conflicts and report them; leave other applications running.
- Use a dedicated local database such as `data/musclescout.db` and a fresh generated password. Setup must preserve existing data and settings on subsequent runs.
- Do not import boat listings, photos, credentials, saved searches, lake rules, or user notes. Architectural ideas may be reused without depending on the other repository.
- Demonstrate that both applications can run at the same time, including independent browser state when they use the same GitHub Pages origin under different repository paths.

## 3. Search modes and geography

### Everyday classics and specialty Mustangs

Ship these clearly labeled quick searches:

1. **Everyday classics · within 4 hours** — the three models, 1960–1989, active fixed-price/negotiable ads, known driving time at most 240 minutes, nearest first.
2. **Mustangs**, **Camaros**, and **Corvettes** — model-specific versions of the everyday search.
3. **Travel time unknown · review** — target cars whose route/location cannot yet be established. Explain what is missing; do not claim they meet the four-hour limit.
4. **Broader regional ads** — expose the collected regional pool with preference filters relaxed and clearly show the active scope.
5. **Nationwide classics** — same classic models/years, all US locations, no travel-time cap.

Make **Include specialty Mustangs** a separate toggle, **off by default**. Its logic must be explicit:

```text
target vehicle =
    (Mustang OR Camaro OR Corvette, model year 1960–1989)
    OR, when specialty expansion is enabled,
    (Mustang, selected specialty variants, model year 1960–latest verified model year)

Then apply the selected geography, price, condition, sale type,
availability, and other common filters to the combined results.
```

Toggling this on broadens only the selected specialty Mustang branch. It must not broaden Camaro/Corvette years or include every later ordinary Mustang. Turning it off restores the everyday scope. Geographic expansion is independent: selecting specialty Mustangs does not switch to nationwide.

- Start the specialty variant selector with **SVT/Cobra**. Offer **Shelby GT350/GT500** and other verified Mustang variants as configurable additions, with their inclusion explicit in the UI.
- Resolve “current model year” from published manufacturer information at implementation/refresh time, record the reference and review date, and make the upper bound editable. A calendar year is not proof of a marketed model year. Preserve a last-verified value if an update fails.
- Historical badging, SVT, Shelby, Cobra packages, generations, replicas, and tribute cars need distinct fields. “Cobra” text alone does not establish a factory variant or identify a Mustang; a Shelby Cobra roadster is a different model family.
- Preserve advertised model year and half-year wording separately from a normalized or documented model year. Conflicting or missing years belong in a visible identity-review view until resolved; keep that view separate from strict year matches.
- Keep unverified specialty claims in a visible review category. State whether each variant is seller-claimed, supported by decoded identifiers/documentation, or independently reviewed by the user.
- Store preferences per saved search. Do not silently overwrite user-edited searches when application defaults change. Provide an explicit way to adopt updated defaults.

### Four hours means driving time

- Implement a pluggable routing provider that returns road distance and estimated driving duration. Research a currently supported provider and its terms/limits; document setup and any credentials or costs.
- The app must also work without a routing credential. In that case, show approximate straight-line distance and **drive time unavailable**, with candidates in the review view. Do not substitute a miles-to-hours formula or label a radius as “within four hours.”
- Use broad regional discovery first, then route target candidates. A configurable roughly 300-mile straight-line discovery envelope is a starting collection aid, not the eligibility filter or a completeness guarantee. Allow widening it.
- Pay attention to Lake Michigan, ferries, borders, and roads: apparently close Michigan locations can take much longer to reach. Prefer US road routes without ferries or international crossings where the provider supports those options; expose provider limitations.
- Route from Wheaton to the vehicle’s actual location when known. Record seller/dealer location separately. Keep explicitly off-site vehicles out of the strict travel screen until their location is established.
- Cache geocodes and routes by origin, destination, travel mode/options, and provider. Record observation time, location precision, and whether the estimate includes traffic. Refresh when inputs or provider policy require it.
- Use a non-traffic baseline for repeatable shopping comparisons when available. Show that it is an estimate, especially for city-center destinations; provide a mapping link to check a trip before traveling.
- Never force ambiguous towns into a confident match. Cache corrections and make them editable.
- Nationwide collection must expand source configuration and collection jobs, not merely remove a UI radius filter from an unchanged local dataset. Show expansion progress and coverage gaps.

## 4. Architecture and deployment

The website must work on **GitHub Pages**. The backend and collection worker must run locally from Cursor, another terminal, or a launcher. GitHub Pages serves the static frontend; it cannot execute the database, API, or collector.

Use supported, compatible versions selected and verified at implementation time:

- **Frontend:** TypeScript, React/Next.js App Router with static export, Tailwind and accessible UI primitives. Avoid runtime server dependencies in Pages routes.
- **Backend:** separate authenticated Node/Fastify API with Zod validation and shared canonical schemas/search semantics.
- **Database:** SQLite with Prisma for the initial single-user application. Keep a future PostgreSQL migration feasible without requiring it now.
- **Jobs:** a simple Node worker with durable run records and renewable database leases. Prevent overlapping runs. Bound work and recover interrupted jobs. Redis is unnecessary unless a demonstrated requirement justifies it.
- **Ingestion:** static HTML/structured data first; isolated adapters. Optional browser rendering only for permitted, supported sources. Use official APIs/feeds where available.
- **Maps:** Leaflet or equivalent, with provider attribution, cached explicit geocoding, and a separate routing abstraction. Map tiles must not be required for list/grid functionality.
- **Testing:** Vitest and Playwright, with sanitized source fixtures and isolated test databases.
- **Deployment:** local Node is the primary path; optional Docker Compose for app and worker with durable storage. No shared volumes with another project.

Support three clearly identified modes:

1. **Sample:** a separate set of labeled fictional examples for development.
2. **Published snapshot:** real collected listings in a dated static export; browser-local personal workspace.
3. **Connected:** the authenticated local API, database, and backend personal workspace.

Namespace browser storage by application and deployment base path. Never mix sample/snapshot/connected workspaces. Keep authentication tokens session-scoped and out of URLs; do not persist the password in browser storage.

Support GitHub Pages at both the site root and a repository subpath. Document published snapshot refreshes and the alternative of connecting to a reachable HTTPS backend. Explain local-network/mixed-content browser limitations. Credentials stay in the backend `.env`, never in public bundles or snapshots. GitHub deployment should occur only when a repository and destination are supplied and publication is authorized.

## 5. Source discovery and initial live collection

Source breadth is a product requirement. A beautiful dashboard backed by two sources is not sufficient evidence of the local market. Research marketplaces, classic-car dealers, consignment inventory, regional classifieds, and relevant public enthusiast classifieds.

Investigate these **candidates**, verifying their present inventory, access rules, and technical feasibility before promising an integration:

- ClassicCars.com, Hemmings, Autotrader Classics, and other relevant classic-car marketplaces.
- Cars.com, CarGurus, AutoTrader, and eBay Motors where their current feeds or accessible inventory cover the target vehicles.
- Craigslist owner and dealer car listings across Chicago and surrounding regional boards.
- Public Mustang, Camaro, and Corvette enthusiast classifieds.
- Independent and consignment classic-car dealers around Chicagoland and the surrounding IL/WI/IN/MI/IA region, including relevant dealers with nationwide inventory.
- Bring a Trailer, Cars & Bids, Mecum, Barrett-Jackson, and comparable auction sources as a separately identified sale type, subject to current access and feed availability.
- Facebook Marketplace via manual entry or user-provided listing exports. The core product must work without authenticated marketplace scraping.

These are research candidates, not a claim that adapters already work. Verify actual pages and pagination rather than relying on search snippets or a generic JSON-LD parser. Do not fabricate stock to meet a target number.

Aim to evaluate at least **ten relevant source/dealer candidates** across multiple source categories during the initial pass. Implement and run every viable source within the stated scope; document why each remaining candidate is blocked, unsuitable, or incomplete. A blocked source is not zero inventory. If results are unexpectedly sparse, do a second source-discovery and pagination review before declaring collection complete.

The handoff should include real collected inventory where accessible, a dated source coverage report, and an honest account of gaps. A fixture-tested adapter is not a live-validated source. Avoid claims that every car in the region has been found.

## 6. Collection behavior and evidence

Each adapter must have stable source IDs, configured regions/queries, independent error handling, normalized records, and source URLs.

- Respect access rules and robots policies, throttle requests, honor rate limits, and stop at login/access challenges. Never bypass a restriction or import authentication cookies as a workaround.
- Use a configurable HTML cache, initially around 24 hours for ordinary inventory. Auction/current-bid data needs an appropriately shorter permitted interval or a clearly stale label. A locally cached read retains its original observation time.
- Store raw evidence once in a private cache, with references from observations. Preserve enough normalized payload and parsing provenance to reprocess without unnecessary requests.
- Follow supported pagination and configured regions; verify whether remote year/model/location filters are honored. Apply shared local filters regardless.
- Match card metadata to the correct ad by stable identity. Positional joins between HTML cards and structured-data arrays are unsafe when ordering differs.
- Deduplicate IDs within each source run. A duplicate page must not inflate counts or overwrite enriched details with a sparse summary.
- Distinguish real vehicle ads from dealer catalogs, wanted ads, parts, memorabilia, finance offers, deposits, and generic model pages.
- Enrich likely target cars with their detail pages. Missing year/variant/location must not automatically prevent enrichment. Prioritize route resolution for target candidates and useful nearby discoveries.
- Expose inventory-page and detail-request caps, pages discovered/fetched, skipped candidates, failed pages, and remaining enrichment work. A truncated run must be labeled partial.
- Record `firstSeenAt`, `lastObservedAt`, `lastNetworkCheckedAt`, seller-posted time when available, and removal/sale evidence separately. First tracked by this app is not first advertised by the seller.
- Distinguish active, sale pending, sold, removed, stale, upcoming auction, live auction, auction ended, and unknown availability. Ended auctions may have sold or failed to meet reserve; preserve the reported outcome.
- Source errors and partial runs do not prove removal. Mark records stale according to a configurable policy; use explicit evidence for sold/removed status.
- Record each run’s scope, source, time, counts, cache use, errors, completeness, and duration. A source failure must not stop the other sources.

## 7. Car data and filters

All meaningful filters must work consistently in the UI, API, saved searches, and alerts. Support unknown values explicitly: missing is not zero, false, clean, or original. Multi-area location filters combine with OR; independent preferences combine with AND, subject to the explicit specialty-model OR branch above.

| Group | Fields and behaviors |
|---|---|
| Identity | Normalized make/model, model year, generation, trim, edition, factory options, body style, original seller text, evidence/confidence |
| Price and sale | Asking price, currency, negotiable flag, price on request, sale type, auction current bid, buy-it-now price, auction end/timezone, reserve status when disclosed, buyer premium/fees when known |
| Travel | Vehicle vs. seller city/state/ZIP, geocode precision, driving minutes/miles, straight-line miles, route freshness, provider, unknown route, multiple areas/states, nationwide |
| Engine | Advertised engine family/code, displacement in cubic inches and liters, cylinder count, fuel delivery, fuel type, forced induction, installed vs. original engine, swap/rebuild disclosure |
| Power | Reported horsepower/torque and measurement basis when stated: gross/net, crank/wheel, advertised/dyno. Keep incomparable measurements labeled; displacement such as “350” is not horsepower |
| Transmission/drivetrain | Manual/automatic, gears, transmission identity, original/replacement/swapped, differential/rear axle, axle ratio, limited-slip when reported |
| Mileage | Odometer reading and units, claimed actual mileage, exempt/unknown/rollover, five- or six-digit display when known, mileage since restoration or engine rebuild as separate values |
| Condition | Running/driving, roadworthiness as claimed, project/driver/show condition as claimed, restored/unrestored/restomod, paint/body/interior condition, disclosed rust and structural repair |
| History | Title status as reported, title in hand, accidents, flood/fire disclosure, ownership/documentation, restoration date/scope/receipts, inspection reports, service history |
| Authenticity | Originality, seller’s “numbers matching” claim, matching engine/transmission evidence, factory trim vs. tribute/clone/replica, available VIN/chassis/engine/cowl-tag evidence |
| Appearance/equipment | Exterior/interior colors, factory color claim, coupe/fastback/hatchback/convertible, convertible top condition, T-tops, AC, power steering/brakes, disc brakes, suspension changes, exhaust, wheels, seat belts and other reported equipment |
| Seller | Private/dealer/consignment/auction, seller name, actual stock location, listing/stock number, source-provided ratings with provenance |
| Listing metadata | Source, availability, observation age, seller-posted date, photo/video counts, description contains/excludes, missing-data flags, favorites, notes, saved searches |

Use include/exclude/any controls for equipment and claims where appropriate. An optional **V8 only** preset is useful, but it is not part of the initial everyday default. Keep ask-price comparisons separate from bids, financing payments, deposits, sold prices, and estimated fees. Show a quoted total only when its components are known; taxes, transport, and unknown fees must not be invented.

For older cars, preserve historical identifier formats. Do not require every VIN/chassis identifier to be 17 characters or pass a modern checksum. Verify era-specific validation rules before applying them. A decoder result cannot establish that the physical car, engine, or trim is authentic. Store seller claims and user-reviewed evidence separately; never upgrade a claim to verified by repetition across ads.

## 8. Canonical schema, grouping, and history

Use a typed, versioned canonical `Listing` schema with stable IDs, source identity/URL, title, description, photos, seller/vehicle locations, model fields, sale type, availability, price/bid fields, observation dates, and field-level evidence/confidence. Separate installed/original mechanical specifications where necessary.

Suggested related entities: `VehicleGroup`, `Seller`, `PriceObservation`, `BidObservation`, `SourceObservation`, `Location`, `RouteEstimate`, `SearchArea`, `SavedSearch`, `Favorite`, `Note`, `DataFlag`, `IngestRun`, `Alert`, and `DeliveryAttempt`. Keep important searchable fields relational; use validated extensible JSON for less common specifications and evidence.

- Preserve ad records even when they describe one vehicle. A group exposes every source, price, location claim, and conflicting specification.
- Auto-group only with strong evidence, such as a compatible exact identifier or matching dealer stock identity plus corroborating data. Masked/partial identifiers, shared stock photography, and similar titles are weak evidence.
- Same-source reposts may represent one car. Support reviewed merge/unmerge without losing favorites, notes, history, or provenance.
- Surface likely duplicates for review; do not silently collapse several similar cars or inflate confidence from cross-posts.
- Display raw ad counts and grouped result counts distinctly. Neither is a guaranteed count of currently available physical vehicles.
- Never present the lowest auction bid as the lowest asking price. Keep fixed-price observations, bids, and actual disclosed sale results in different series.

## 9. Website experience

Create a polished car-focused design with readable typography, good photography, restrained colors, dark mode, accessible controls, and responsive desktop/mobile layouts. Use real listing photos only for those listings. Sample photos must be licensed and visibly illustrative; unknown photos get a neutral placeholder.

- **Discover:** Wheaton/travel scope visible, classic year range visible, specialty toggle conspicuous and off initially, model quick filters, keyword search, active-filter chips, filter rail, grid/list/map views, and save-search action.
- **Cards:** model/year/trim, clearly labeled ask or bid, location, estimated drive time or unavailable status, straight-line distance when useful, condition/mileage caveats, source, freshness, availability, and favorite control.
- **Detail:** photo gallery, specifications, original seller wording, claims/evidence, routes, all source links, price/bid history, private notes, data corrections, and similar target cars.
- **Compare:** up to six cars with differences and unknowns visible, preserving distinctions between original and installed engines and between bids and asking prices.
- **Maps:** clustered, filter-aware pins. Explain unknown locations; list counts must not imply every result has a map pin. Do not show a circular “four-hour” boundary unless it is a genuine supported drive-time isochrone.
- **Saved searches:** separate names, scopes, specialty settings, alert schedules, and a way to preview changes before saving.
- **Auction browsing:** an explicit sale-type control or saved view for upcoming/live auctions, with deadline sorting and bid/fee labels. The everyday fixed-price view should explain that auctions are available separately.
- **Market:** describe the observed inventory only. Keep asking-price distributions separate from auction results; do not claim appraisals, transaction values, or pre-collection history.
- **Administration:** source configuration, coverage, run health, manual rerun, import/export, geocode/route correction, provider settings, and collection progress.

### Explain why the shortlist is smaller

Provide a coverage panel showing:

- All collected ads, active ads, grouped matches, and known potential cross-posts.
- Counts by source, geographic/query scope, last genuine observation, and complete/partial/blocked status.
- A filter breakdown: target models/years, geography, route-known candidates, four-hour matches, remaining preference filters, and the unknown-data review pool.
- Explicitly labeled ways to relax filters, include specialty Mustangs, review unresolved travel times, or expand nationwide.
- Sources not yet integrated and areas not yet collected. Zero matches from a source must be distinguishable from collection failure.

Use a compact disclosure on mobile so coverage explanations do not push the entire car list below several screens of controls. Keep unknown-data review one click away.

## 10. Alerts and personal workspace

- Favorite cars, write private notes, flag data issues, save comparisons/searches, and retain these across refreshes and imports.
- Alert on new matches, meaningful price changes, availability changes, and optionally upcoming auction deadlines. Use each saved search’s actual model/geographic logic.
- Baseline the first evaluation so importing an existing collection does not generate hundreds of “new car” alerts.
- Separate auction bid changes from seller price changes. Make bid-change alerts optional and avoid excessive notifications.
- Provide configurable in-app/email/webhook delivery, digests, retries, idempotency, and visible failures. Do not enable external delivery without a configured destination and user selection.
- The worker can collect while running locally; a static Pages snapshot cannot refresh itself or run private scheduled jobs. Show that distinction clearly.
- Never send seller messages, make offers, place bids, or purchase vehicles as part of collection or alerts.

## 11. Security, privacy, and reliability

- Bind local services to loopback by default. Use a generated backend password, request validation, rate limits, exact allowed origins, and clear session expiry/logout behavior.
- Validate source/import URLs. Protect backend fetching from private/reserved networks, redirects to unexpected origins, unsafe protocols, and unbounded responses. Sanitize imported HTML; remote markup is data, not code to execute.
- Browser bundles and published snapshots contain no passwords, tokens, private notes, favorites, alert destinations, home street address, or raw scraped pages. Review publicly exposed seller contact/identifier fields and provide redaction controls.
- Imports must preserve existing records and personal state by default. Report rejected records clearly. Destructive replacement needs an explicit action.
- Log actionable errors without secrets. Keep local databases, caches, logs, credentials, test artifacts, and build directories out of source control.
- Handle unavailable images, maps, routes, APIs, and individual sources without crashing the workspace.
- Separate development and production build outputs so static builds can run while local previews stay healthy.
- Include backup/restore instructions for the local database and configuration.

## 12. Commands and setup

Provide a reproducible setup that another machine can use without a global database service:

```text
npm install
npm run setup              # environment, password, database, migrations
npm run dev                # website, API, worker on this project's ports
npm run collect            # one bounded cycle, run summary
npm run geocode:listings   # explicit missing/ambiguous location work
npm run route:listings     # explicit cached route enrichment
npm run export:snapshot    # real listings only; enable snapshot mode
npm run build              # static website
npm run typecheck
npm test
npm run test:e2e
```

These are desired command contracts, not claims that scripts already exist. Implement them, or document a justified equivalent. Provide separate API/worker commands, a dry-run option for config changes, a macOS launcher, a Windows launcher, and Cursor/VS Code tasks. Launchers must use their own project directory and preserve existing settings.

Document root/subpath GitHub Pages builds, repository deployment configuration, local production serving, optional Docker, collection/geocode/routing setup, snapshots, backups, and stopping/restarting services. The standard startup must not require access to the boating project.

## 13. Acceptance checks

Use meaningful tests with fixtures and isolated state, plus a small explicit live smoke run. Required checks include:

1. Default target years are inclusive 1960–1989 for the three model families. Misspelled Camaro searches normalize correctly; unknown-year ads remain reviewable.
2. Specialty mode starts off. A later specialty Mustang can appear when enabled; an ordinary later Mustang and a later Camaro/Corvette remain outside that expansion. Common price/travel filters apply to both branches. Turning the toggle off restores the previous classic scope.
3. Nationwide expansion is independent of specialty mode and creates broader collection scope/progress rather than claiming untouched regions were searched.
4. Exactly 240 routed minutes passes the strict travel limit; greater values fail it. Missing/ambiguous routes are reviewable and never mislabeled as four-hour matches. Geographic tests include a Lake Michigan detour scenario.
5. Partial pagination, repeated page links, mismatched card/metadata ordering, source failures, stale caches, detail caps, and explicit sold/ended records produce correct counts, status, and observation timestamps.
6. VIN/identifier handling accommodates historical formats. Tribute claims, unknown mileage, engine displacement, wheel/crank horsepower, monthly payments, bids, and seller prices stay semantically distinct.
7. Strong duplicate evidence groups safely; weak title/photo similarities do not auto-merge unrelated cars. Merges preserve personal state and can be reversed.
8. Search/filter/sort/grouping agree between frontend, API, saved searches, and alerts. A collection rerun preserves first-observation time and does not fabricate price history or duplicate alerts.
9. Browser checks cover desktop/mobile search, coverage, specialty toggle, unknown-route review, shortlist, notes, comparison, imports, reload persistence, and connection modes. Check overflow and keyboard access.
10. Root and repository-subpath static exports load, search, show images, and fetch public data with no missing local assets or runtime errors. Verify that sample/raw/private data is excluded from the real public export.
11. Initial real collection has an auditable source/run report and a refreshed snapshot. External route/alert integrations that could not be tested are labeled unverified.
12. Setup, launchers, database, storage keys, ports, and Docker resources are independent of other local projects. User data survives restart and setup reruns.

## 14. Delivery and working style

Implement in practical phases, but keep working through them without pausing for ceremonial approval at each stage:

1. Inspect this project directory, verify current dependencies, document the architecture, and scaffold the independent app.
2. Build schemas, search semantics, geography abstractions, and the polished UI using clearly fictional test data.
3. Research actual sources and routing options; implement viable collection and enrichment with fixtures.
4. Complete persistence, safe grouping, history, alerts, coverage, and personal workflows.
5. Run the real regional collection, review sparse results and source gaps, enrich candidate travel times where possible, and publish the resulting local snapshot into the website.
6. Run acceptance checks, inspect desktop/mobile visuals, build both static deployment modes, and deliver the launchable project and documentation.

Make reasonable implementation decisions and record them in `DECISIONS.md`. Ask only when an unresolved requirement, credential, paid service, or destructive action needs my input. Continue useful independent work while waiting. Do not let an unavailable provider block the entire app: deliver the explicit fallback and document what remains unverified.

Deliver at least:

- Working source code, migrations, sample fixtures, configuration examples, scripts, and launchers.
- `README.md` with precise setup and deployment instructions.
- `DECISIONS.md` with assumptions and tradeoffs.
- `SOURCE_COVERAGE.md` with source candidates, tested scope, pagination/limits, live results, and gaps.
- `LIVE_DATA.md` with collection date, ad/group counts, everyday/specialty/unknown-route counts, and observed limitations.
- `VALIDATION.md` with checks actually run and remaining unverified integrations.
- A static GitHub Pages build and real-data snapshot where collection succeeded.

Finish by explaining how to open the app, what real inventory was collected, how to use the classic/specialty/nationwide controls, how to refresh data, and what still needs input or verification. Do not present mock inventory, cached observations, guessed travel times, or seller claims as independently verified live facts.
