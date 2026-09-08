# Future improvements and remaining limitations

Re-audited during the September 7–8, 2026 improvement pass. This file distinguishes delivered fixes from work still open. The source-access observations are dated September 7, not fresh probes. The published inventory is still a set of advertisements, not a census of available or lake-approved vessels.

## Delivered from the previous roadmap

| Previous struggle | Implemented behavior | Evidence / practical limit |
|---|---|---|
| HIN matching missed different model spellings and same-source records | Normalized, indexed modern-format HIN identity independent of source/make/model/year; different valid HINs veto grouping | Reindex populated 144 usable HINs in 1,538 real ads. No repeated valid HINs were found, so it correctly made no automatic groups. Structural validation does not verify the manufacturer registry or ownership. |
| No cross-listing review or undo; stock-photo false merges | Ranked review queue with same/different/undo decisions; transitive conflicts checked; ads/history/notes/favorites retained | 163 suggested pairs are available in connected Settings. They are candidates, not 163 confirmed duplicate boats. Exact shared photos/specs alone no longer auto-merge. |
| Collection exited successfully after errors/busy runs | Explicit success, partial, failed, busy and cancelled outcomes; CLI exit codes; queued API jobs with IDs and durable reports | CLI and temporary-database tests cover real executable exit codes. A 202 response means queued, never collection success. |
| Long collection lost its lock; abandoned runs persisted | Heartbeat renewal, cancellation propagation, transaction fencing and reconciliation after acquiring the lease | Network requests abort on cancellation; obsolete owners cannot write listings. Local supervision and alert-delivery leases still need further work. |
| Failed details wiped fields; old details overwrote newer summary facts | Preserve prior enriched fields on detail failure; use observation timestamps for price/status; retain field observation evidence | Regression tests cover fresh sold/price summaries versus older cached detail pages. Retained specifications may still be old and need seller verification. |
| No complete, protected refresh workflow | Backup → collect → evaluate outcome → optional geocode → validated atomic snapshot; explicit partial export override; worker opt-in auto-export | Default partial/error preserves the previous website file. Reports include cache age, pages, details, caps, observations and meaningful versus metadata-only changes. No automatic publication was installed. |
| Health endpoint only proved an HTTP listener | Database connectivity/readiness plus worker heartbeat; authenticated source-health dashboard and dated coverage ledger | Worker heartbeat is a last-process report, not proof of service supervision or successful source access. |
| City-name/ZIP ambiguity and no review | Structured city/state/ZIP ranking, suburb support, ambiguous candidate queue, reviewed city-center correction with local evidence | Corrects approximate city centers only; offsite boats stay unlocated and exact source points stay intact. Existing unreviewed cached cities are not silently revalidated. |
| Full 1,538-ad export exceeded the 1,000-row import endpoint | Whole-file preview/validation, byte/row-bounded chunks, per-record manifest, partial/uncertain outcomes and retry | Transfers stop at first failure; an import is not a single all-or-nothing database transaction. A timeout may have committed records and requires the manifest/retry reconciliation. |
| Shared browser storage, missing workspace restore, preset reset risk | Storage scoped by deployment/mode/backend; deliberate legacy restore; reviewed merge/replace; revision-aware save; initializer preserves edits by default | Replacing a workspace is explicit and downloads a before-state backup. Unmapped listing IDs are shown and skipped. Download import manifests before leaving Settings; persistent resume history is not yet implemented. Browser data still needs user exports. |
| Backups lacked a verified recovery path | Consistent SQLite backup, integrity check, configuration/evidence copy, SHA-256 manifest, verify-only command | Private backups exclude `.env`; config files are individual copies, not an atomic image of a running system. Actual restore remains an operator action. |
| Missing all-platform bundled dependency versions and SBOM schema checks | Verified locked WASM tarball contents; complete lock-plus-bundle CycloneDX; vendored official schema validation | npm's own full lock-only SBOM still fails; separate verified output covers six bundled package instances. OS/native/container inventories remain outside npm scope. See [SBOM.md](SBOM.md). |
| Later buying workflow enhancement | Standalone printable comparison packet with source links, reported facts, uncertainty and blank seller/inspection/HIN/length/motor/trailer checklists | Download from Compare. It does not contact sellers, assert availability or grant lake approval; private notes are excluded. |

Implementation and verification details: [README](README.md), [HANDOFF](HANDOFF.md), [OPERATIONS](OPERATIONS.md), [VALIDATION](VALIDATION.md), [SBOM](SBOM.md).

## Highest-value remaining work

### P1 — Review duplicate candidates and improve identity evidence

The dataset still has zero assigned groups because there are no repeated valid HINs and no user-reviewed same-boat decisions yet. The new queue makes unresolved reposts actionable; it does not justify automatic consolidation of all similar ads.

- Review the three Craigslist Crestliner Sportsman 16 ads in Butler WI and the potential 2002 Skeeter ZX225 pair across Craigslist/Bass Boat Central. Both are examples carried forward from the captured snapshot, not new seller confirmations.
- Preserve the two 2026 Alumacraft Voyageur 175 Tiller stock units in Wauconda with different HINs even though price/specs match.
- Add carefully bounded image-identity evidence for resized/rehosted photographs, descriptive text comparison and stronger seller/location identity. Use these to rank suggestions, with human decisions and conflicting-HIN vetoes.
- Prioritize active/nearby candidates in a large queue and show changes since the last review. The current queue is paginated and persists decisions, but does not provide individual vessel history timelines or user-defined queue filters.
- Group IDs are deterministic for an unchanged member set; changing membership changes the group ID. Public links/personal state use stable listing IDs. A permanent vessel identity would help long-lived vessel-level exports and external references.

Acceptance: known positive/negative examples stay correct; ambiguous/stock-photo cases never auto-merge; every original ad, source status and price remains inspectable; vessel-level statistics distinguish reviewed identity from raw ad counts.

### P1 — Fill source coverage gaps through permitted access

The full machine-readable ledger is [config/source-access.json](config/source-access.json), displayed in Settings. The detailed source report is [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md).

| Dated access/integration gap | Sources | Next useful step |
|---|---|---|
| Robots HTTP 403 | Boat Trader, Water Werks, Hennepin Marine, Munson Ski & Marine, Lake Holiday Marina, Boats.com, Boatmart | Dealer/API/feed permission or reviewed manual imports; dated access retests only when appropriate |
| Listing HTTP 403 | The Boat House, Huber’s Marine | Permitted dealer inventory or manual review |
| Robots HTTP 429, stopped | MarineSource | Respect throttling; limited later check or supported feed |
| Accessible HTML but missing useful integration | SkipperBud’s, Quest Watersports Ottawa | Identify permitted inventory data; fixtures and dry-run quality review before enabling |
| Sold/removed indexed ads, profile 404 | Boatzon / Hennepin | Require active availability evidence and stable discovery; do not reinstate sold search results |
| Outside current core search | Boat Works Keyesport, The Boat Center Chippewa Falls/Minnesota | Evaluate added nearby matches when deliberately expanding regions |
| Manual only / unconfigured | Facebook; eBay Motors, iboats, YachtWorld, CPO sources | Supported APIs/exports and representative fixtures; distinguish auction prices from asking prices |
| Current rules unavailable to this automated pass | Lake Holiday association portal | Obtain current rulebook and registration confirmation through an allowed channel |

No restriction was bypassed and no newly restricted source was enabled during the engineering pass. A configured adapter, green unit test or recent run timestamp does not establish complete marketplace coverage.

Acceptance: every new integration records its access method, date, geography, live sample, fixture, parsed/ad counts, pagination limits and failure behavior. Keep unsupported sources visible as gaps rather than zero inventory.

### P1 — Complete data provenance, location and lake verification

The 2024 public Lake Holiday rule reference is still preliminary. Confirm current effective rules, length including molded platforms, capacity-plate horsepower, allowed use and registration before purchase. Model numbers and nominal advertised lengths are insufficient.

Location review currently operates on city centers. Add a separate, reversible per-listing **actual boat location** correction with provenance, including seller-confirmed offsite locations. Add reviewed driving-time routing and clear route/provider timestamps; current radii are straight-line miles and cannot enforce a four-hour drive. Existing city caches require review rather than an automatic assumption of correctness. Retain per-field sources/timestamps for dimensions, power and equipment, not just price/status/detail freshness. Conflicting ZIP evidence now enters review; a city-only cache still cannot represent two same-name localities indefinitely. Interactive and batch geocoding have separate throttles; add one shared provider-wide limiter and retry/backoff for unresolved queries.

Acceptance: an old or ambiguous observation is visible beside the field; a location correction survives a refresh without erasing original evidence; routing failures never silently become straight-line “drive time.”

### P2 — Durable operation and alert recovery

The complete refresh and daemon auto-export are implemented. No OS scheduler, fixed daily/weekly automation, remote worker or GitHub publication schedule was installed. A laptop must stay awake and the worker must run. The latest worker heartbeat is a local file and can be overwritten by another daemon; supervise one intended process. Full refresh reports are durable, but a hard process kill can leave a pipeline report marked running until an operator compares it with lease/heartbeat state; ingest rows are reconciled by the next collector.

Alerts still detect new matches and price/status changes among currently matching ads. A sold boat leaving an active-only search may disappear without an alert. Add configurable event types, explicit no-longer-matches events, retry backoff/next-attempt metadata, replay controls and delivery diagnostics. Delivery is at least once; the alert lock is time-bounded and lacks the collector's heartbeat/fencing improvements. API-triggered alert evaluation now has a separate outcome report so an alert failure cannot relabel a successful data refresh or erase its snapshot/backup provenance. No email/webhook channel was enabled for this pass.

Acceptance: stopped/stalled jobs are obvious; recovery does not double-send or resurrect expired lease owners; operators can distinguish data freshness, schedule lateness, partial collection and channel failure.

### P2 — Parser maintenance, refresh completeness and retention

Source-health metrics now expose page/detail caps and cached observations. They do not establish how many ads a marketplace withheld or whether a parser silently missed one field. Several large sources can hit configured detail limits, so default full refresh may correctly report partial and withhold export. Review which detail work is useful; add resumable enrichment checkpoints/rotation and coverage budgets instead of simply raising request caps. Distinguish a deliberate summary-only coverage policy from failed requested detail work.

Add redacted fixture capture, standalone parse preview, before/after field diffs, schema-driven quality thresholds and a reviewed reparse workflow. Historical cache evidence is still overwritten per URL. Backups, report files, logs, raw data and price histories have no automatic retention or size budget; add dry-run pruning, free-space checks and recoverability tests before long-term unattended use. Filesystem failure after snapshot replacement but before mode/report update can leave mixed status; multi-file deployment activation and recovery markers remain useful.

Acceptance: a changed parser or exhausted cap visibly reduces coverage; retention cannot delete the last known-good backup or current evidence unexpectedly; empty/failed scrapes never remove the whole inventory.

### P2 — Packaging, SBOM and publication

The all-platform SBOM now includes the previously unknown bundled versions and all generated CycloneDX outputs pass schema checks. Keep exact tarball/schema provenance; the npm full-command limitation remains explicit. Add immutable release/image digests and a Docker/OS/native-engine/browser inventory. The current Docker runtime copies build dependencies; prune/package deliberately and retest rendered-source support. First-party project licensing remains an owner choice, not inferred from dependency licenses. Windows launch/SBOM paths need real Windows CI; only relevant process-spawn code was improved here.

GitHub Pages is still disabled. Publication should use a reviewed snapshot and matching build/deployment result, with privacy/size/quality checks and rollback. Do not treat CLI export or a private source push as a published site. CI action runtime deprecations/digest pinning and automated release SBOM checks remain maintenance work.

### P3 — Later enhancements still open

- **Buying workspace:** save checklist state, confirmed availability/date, measured dimensions, capacity/motor evidence, appointments, towing requirements and private attachments. The delivered packet is printable, not a persisted inspection tracker.
- **Travel and regional expansion:** reviewed source-region presets separate from UI filters, Great Lakes coverage, then nationwide discovery. Measure useful incremental boats before increasing crawl volume.
- **Market analysis:** longer asking-price histories, reviewed vessel-level timelines and uncertainty/coverage labels. Do not present asking-price changes as actual sale prices or appraisals.
- **Scale/hosting:** benchmark render/search/snapshot sizes; add pagination, compressed snapshots or background workers only when measured. Remote/multi-user operation needs durable identity, authorization, secrets, HTTPS, backups and a deliberate hosting decision.

Before each follow-up, inspect the current code/reports and reproduce the limitation. Update docs and SBOM when scope changes; record implemented behavior, tests, dated source observations and proposals separately.
