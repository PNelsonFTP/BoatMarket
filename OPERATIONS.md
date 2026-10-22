# BoatScout operations

Use Node 22.12+ and the committed lockfile. The website is static; collection, database storage and alerts need the local Node backend/worker. GitHub Pages does not execute them. Keep this checkout separate from ClassicCars and inspect process working directories before stopping anything.

## Startup and routine refresh

```bash
npm ci
npm run setup
npm run dev
```

Setup preserves existing `.env` and data, generates a password for a new installation, applies migrations and generates Prisma. Development normally starts the website at 3000 and API at 4310; read Next's actual startup URL if a port is occupied. Cursor tasks invoke the documented npm commands. The bundled launchers run `npm install` if `node_modules` is absent, then setup/dev; their initially opened port-3000 tab can differ from Next's actual port. Stop your foreground processes with Ctrl+C.

For a built website and API at the same address, avoiding another app on port 3000:

```bash
npm run build
npm start
# Open http://127.0.0.1:4310; start the worker in a separate terminal if wanted.
npm run worker
```

The local API requires `BOATSCOUT_PASSWORD` from `.env`; connect through Settings. Never commit the password or put it in a public build variable. A development website on a different port needs its exact origin in `ALLOWED_ORIGINS`. Static mode works without a backend. Browser snapshot notes/favorites are separate from connected SQLite and should be exported for backup.

Compose supports collection and connected database refresh. It serves the static website built into the image; container snapshot export and **Refresh data & snapshot** are unsupported because app/worker do not share a writable publication directory. Keep `WORKER_AUTO_EXPORT=false` (default), use **Run enabled sources**, and rebuild the image from a host checkout containing the desired reviewed snapshot. The commands below that export snapshots apply to the host installation. Container correctness probes use isolated temporary databases: `npm run docker:smoke -- IMAGE` or `npm run sbom:runtime -- IMAGE`; add `--rendered` only for the rendered image. These do not update production volumes.

| Command | Result |
|---|---|
| `npm run refresh` | Verified backup → configured collection → outcome review → validated snapshot activation |
| `npm run refresh -- --geocode` | Adds bounded unknown-city enrichment using an explicitly enabled provider |
| `npm run refresh -- --allow-partial` | Explicitly allows a partial result after reviewing source errors |
| `npm run collect` | One collection cycle and outcome; does not itself publish a website |
| `npm run export:snapshot` | Validates current database ads, excludes samples/private review data and stages a local snapshot |
| `npm run operations -- status` | Worker lease/heartbeat and queued/running job state |
| `npm run operations -- --help` | Exact cancellation/recovery command syntax |

Settings exposes source health, queued job IDs, collector outcome, operation leases/cancellation/recovery, duplicate review, locations/routes, parser preview and alert diagnostics. HTTP 202 means queued, not successful. Collection exit codes are success 0, partial 2, busy 3, cancelled 130, otherwise 1. Preserve the report and its backup path when investigating errors.

`public/data-mode.json` activates an immutable `public/snapshots/<sha256>.json` generation. The browser verifies the selected data before activation. New exports also add an optional version-1 compact search catalog and immutable evidence shards; the full generation remains the canonical fallback. Legacy `public/snapshot.json` remains a compatibility/export file. The catalog workflow and validation commands are described below. `data/publication` records private prepared/committed generations; recovery examines the pointer so a hard kill after activation does not invent a rollback. A fresh clone can validate the public generation without this private journal: it is reported as imported, with no claimed local run or commit time. Backups retain its verified pointer and generation; a private marker is included only when it exists and matches. An export is local staging, not a GitHub deployment.

## Reviewable refresh sessions and live progress

Use a reviewable session when a source needs several permitted discovery/detail passes. The existing one-pass `npm run refresh` and **Refresh data & snapshot** action remain available. A session starts with the enabled sources selected at creation, makes a verified backup before each collection pass, and preserves the current website until explicit finalization. Omit `--source` to include all enabled sources; repeat it to select specific configured IDs. The following uppercase values are placeholders: copy the actual `sessionId` from start/status output rather than inventing an ID.

```bash
npm run refresh -- --help
npm run refresh -- --session=start
npm run refresh -- --session=status --session-id=SESSION_ID_FROM_OUTPUT
npm run refresh -- --session=continue --session-id=SESSION_ID_FROM_OUTPUT
npm run refresh -- --session=finalize --session-id=SESSION_ID_FROM_OUTPUT
# Only after reviewing the listed gaps:
npm run refresh -- --session=finalize --session-id=SESSION_ID_FROM_OUTPUT --allow-partial
```

`start` runs one collection pass; each `continue` runs at most one additional eligible pass. Start-only options include `--source=CONFIGURED_SOURCE_ID`, `--max-passes=5`, `--max-source-attempts=3`, `--cache-hours=24`, `--geocode` and `--target=LOCAL_SNAPSHOT_PATH`. Defaults permit five collection passes per session and three attempts per source; each configurable limit accepts 1–10. At most three finalization attempts are retained. Source scope and collection/detail policy are fixed at creation. A changed/disabled source requires a new session. A completed session is not reused for another day's observations.

In Settings → **Source health & refresh**, use **Start reviewable refresh session**, **Continue eligible work**, then **Finalize complete session** or **Finalize with explicit partial coverage**. HTTP 202 only queues work; inspect the returned session ID, status and source outcomes. The panel displays the three newest sessions; the authenticated API lists up to 20, and CLI status can inspect an older known ID. Durable manifests and copies of pass/quality evidence live under `data/refresh-runs/sessions/`, or the configured `REFRESH_REPORT_DIR`. Accepted inventory baselines are stored separately under `inventory-baselines/`. These private metadata records are backed up and retained with their referenced reports/progress.

Preview distinguishes accepted/verified-empty inventory, distinct ads observed across passes, eligible/successful/remaining details, fetched versus cache-only URL/capture observations, and excluded failure reasons. Cache reuse keeps the original observation date. A transient network failure or due deferred detail can become eligible for bounded continuation; denied, robots-restricted, rate-limited, challenged, parse-failed or capped inventory is not blindly retried. Retry backoff remains in force. Inspect unexplained/legacy backoff as manual review rather than assuming the original failure was transient. Cancellation preserves the interrupted attempt; an explicit eligible continuation receives a fresh run ID.

Complete finalization requires accepted current inventory for every selected source and all details requested by its policy. Explicit partial finalization still requires accepted inventory from at least one selected source and preserves remaining gaps in its outcome. Finalization rechecks source configuration, accepted baselines, ingestion identities and observed-row fingerprints while holding export collection ownership. An intervening collection/import can therefore require starting a new session rather than attributing outside changes to this session. Finalization stages local data; building, committing and GitHub Pages deployment remain separate actions.

While connected, **Worker & job recovery** polls every five seconds. Progress checkpoints normally coalesce to at most one write per 2.5 seconds; source/final boundaries and cancellation can flush immediately. Progress shows current source/phase, inventory pages attempted/succeeded/discovered, details attempted/eligible/succeeded, elapsed time and last successful checkpoint. The checkpoint omits full ad/URL/result arrays and bounds recent failure details. Final reports retain the full outcomes.

An intentional source delay is shown as a wait with a deadline, not a stall or promised ETA. A job with no checkpoint for more than two minutes after its recorded wait ends can show **Possible stall**; a live lease still means ownership. **Cancellation requested** remains pending until a cooperative checkpoint acknowledges it. If no live lease remains, inspect the retained checkpoint and recovery preview before takeover. Progress does not increase per-host request concurrency or waive crawl restrictions.

## Daily/weekly service operation

The existing `WORKER_INTERVAL_MINUTES=30` is preserved. Set `1440` for daily or `10080` for weekly operation. The interval starts after a completed cycle, not at a fixed wall-clock time. Source cache lifetime is separate; the default 24-hour cache means a 30-minute worker does not fetch every page every cycle. `WORKER_AUTO_EXPORT=true` opts the daemon into the full backup/export pipeline; `WORKER_AUTO_GEOCODE=true` also requests permitted geocoding. Both default off.

```bash
npm run service -- --help
npm run service
# Review the generated project-specific template and commands first.
npm run service -- --install
npm run service -- --status
npm run service -- --uninstall
```

The generator supports macOS launchd, Linux user systemd, and Windows Task Scheduler, using the current project's absolute Node and working-directory paths. Windows generation needs the intended interactive user; consult `--help`. Native install/status/uninstall only operate on the current OS and project identity. Templates preserve `.env` cadence and do not copy secrets into a service file. On macOS/Linux, user service lifetime depends on login/user-session configuration; Windows tasks use the intended interactive account. Sleep and unavailable networks still delay collection. No OS service was installed by the P1/P2 implementation.

Only one worker owns the renewable worker lease. Its owner-specific heartbeat is authoritative; a second daemon exits without replacing it. Stop the intended worker through Operations or its service manager. Do not use broad Node process kills: other projects can have their own workers. Recover stale jobs through the read-only preview before applying recovery; live leases prevent unsafe takeover.

## Sources, details, fixtures and quality

`config/sources.json` is schema validated. All automatic HTTP access observes robots checks, denial/challenge handling, same-origin detail/pagination rules, bounded requests and timeouts. Restricted sites remain disabled/gaps. A source adapter or fixture alone is not proof of live access.

- `detailPolicy: "complete"`: every eligible requested detail is required; exhausted budget/backoff produces partial coverage.
- `detailPolicy: "rotating"`: oldest due details rotate through `maxDetailPages`; deliberate deferrals are counted without relabeling a healthy run partial. Failed requested details still produce partial outcomes.
- `detailPolicy: "summary-only"`: explicitly requests summaries only. Prior details can remain visible with their original observation age.
- `quality` supports minimum records, maximum record-drop fraction, minimum price/location/identity coverage and maximum comparable-field coverage drop. Threshold failure preserves the prior source data; it does not delete the inventory.

Automatic inventory-drop checks first use a durable accepted-inventory observation for that source/configuration. It advances only after complete uncapped inventory passes the original quality gate and its staged writes succeed. A requested detail failure or detail-budget deferral can leave the overall run partial while its accepted inventory becomes the next count baseline. Rejected, capped, challenged or incomplete inventory never advances it. With no accepted observation for the current configuration, the most recent completed successful legacy ingestion is the fallback; retained ads provide the final conservative fallback. Quality reports expose the chosen baseline and run/configuration identity. No historical baseline is guessed or backfilled automatically. Historical ads still participate in field-regression checks/change reporting, and no count threshold is relaxed. Manual parser previews keep their retained-ad comparison so a partial capture cannot silently stand in for a full inventory.

A verified empty result is distinct from a selector failure, challenge or empty HTTP body. Supported empty-page recognition includes narrowly checked Craigslist regional pages and existing supported dealer/forum cases. The actual page must match the expected regional/result markup and contain no contradictory ads/challenge. It still must pass configured minimum/drop thresholds; a verified empty page does not automatically erase retained listings or override a suspicious count drop.

Hull make and engine manufacturer are normalized separately. Credible structured hull evidence takes precedence over a motor name in the title; genuine Yamaha hull/PWC models remain supported. Conflicting/ambiguous evidence sets uncertainty/warning fields instead of confidently asserting a brand. Make and engine provenance retains the source/capture time, including an old detail carried forward during a later summary-only pass. Inspect **Specification sources and observation history** when a make warning appears. Existing stored mistakes are corrected through a subsequent permitted collection or the captured-evidence preview/apply workflow below; reparsing an old capture is not presented as a new seller observation.

`data/enrichment` retains detail attempt/success/backoff checkpoints. `data/cache` is the per-URL reuse cache; `data/evidence` retains immutable captured bodies and dated observation records. These are private. Capture/preview/reparse tools:

```bash
npm run source:tools -- --help
npm run source:tools -- capture --source=SOURCE_ID --url=SOURCE_URL --output=data/fixture.html
# Add --file=local-capture.html to use an existing authorized local capture.
npm run source:tools -- preview --source=SOURCE_ID --url=SOURCE_URL --file=data/fixture.html
npm run source:tools -- apply --review=EXACT_PREVIEW_SHA256
```

Review automatic redaction before committing/sharing a fixture. A downloaded fixture's file modification time may differ from its source observation time; pass `--observed-at=ISO` when needed. Preview shows schema/quality checks and field differences without changing listings. Apply is bounded to 1,000 records, checks input/parser/configuration/database fingerprints, makes a verified backup, and preserves a per-record apply report. Old captures cannot overwrite newer observations. Records missing from a captured page are never mass-removed. Re-preview after a conflict or partial apply.

## Listing transfers and public data loading

Settings' **Import listings** accepts a complete listing JSON file up to **64 MiB and 10,000 records**. That input envelope is separate from connected API limits: each sequential import request remains at most **12 MiB and 1,000 records**. A single record that cannot fit a request is rejected before sending. Workspace restore files retain their own 12-MiB limit; a workspace file is not the full listing inventory.

Review the validated preview and destination before confirming. Connected imports update matching source identities and preserve backend notes/favorites. If a later request fails, completed records remain saved. Download the import manifest showing accepted, failed, uncertain and unattempted IDs; refresh/reconcile uncertain outcomes before retrying. The manifest is downloadable progress evidence, not an automatically persisted cross-reload resume queue. Browser-only imports merge into the snapshot workspace, and full evidence is hydrated before a merge or **Export listings** so unloaded provenance is not silently discarded.

The optional `catalog` reference in `public/data-mode.json` points to `public/catalogs/<sha256>.json`, bound to the full immutable snapshot hash. It carries every field needed by search/filter/grouping, including description, photos/count, price history and grouping metadata. Only detailed field-provenance history moves into immutable `public/catalog-details/<sha256>.json` shards, with at most 50 listing IDs per shard. The initial catalog budget is 8 MiB; manifests enforce each shard's path/hash/byte count and membership, with a 16-MiB maximum shard. Publication recomputes this entire derived graph from the canonical reviewed bytes rather than trusting an editable pointer alone. Missing/mismatched/oversized files and symlink paths are refused.

The browser loads evidence on demand, sharing at most four shard requests across overlapping detail views/exports. Catalog, hashed canonical-generation and detail reads have a 30-second timeout and bounded byte reads. A failed catalog attempts the verified full-generation fallback and explains the fallback; a failed evidence shard reports the error while keeping verified search data available for a deliberate retry. Older full-only snapshots remain supported. This fallback supports the existing standalone/browser workflow; it does not install an offline service worker or guarantee a cold load without network access.

## Identity, location and current rules

Duplicate review in Settings has active, nearby and changed-since-review filters. Same/different/undo decisions preserve all ads and per-ad private notes. Different supported HINs veto grouping. `npm run duplicates:review -- --dry-run` previews reindexing; `--apply` applies it. Market now separates reviewed vessel groups, HIN-only vessel groups and unresolved research records over the actual filtered results. These subtotals reconcile to research records, while advertisements are counted separately and related ads outside the filter remain labeled. A single-ad record and legacy/missing/conflicting grouping metadata remain unresolved; they are not proof of a unique boat. Merge/split/undo and different-HIN vetoes remain authoritative. Vessel timelines show membership, review, price and status observations. `npm run images:audit -- --help` explains bounded operator-provided local-image evidence; no unrestricted photo downloader is enabled.

Actual boat-location review is separate from city-center correction. Enter reviewed coordinates, a label and evidence; save uses a revision check, preserves original source coordinates and survives later collection. Undo restores the latest source observation. Manual location evidence, route origins and review notes are excluded from public snapshots; public export uses source coordinates.

The official December 2, 2025 Lake Holiday rules were publicly reviewed September 8, 2026. Hulled boats are screened at **up to 21.0 ft inclusive**, counting molded platforms; power cannot exceed the capacity plate. Lake registration and permitted use still need association confirmation. Use Settings' reviewed policy update or:

```bash
npm run reconcile:lake-policy
npm run reconcile:lake-policy -- --apply
```

Default reconciliation changes only untouched factory rules and saved-search rules, preserving customized settings, names and alert channels. A deliberate `--include-customized` broadens the preview/apply scope; inspect it before use. Recorded verification does not remain valid after material rule edits.

## Geocoding and routing

Existing city caches work without enabling an external provider. For public Nominatim, an informed owner must explicitly set `GEOCODER_PUBLIC_POLICY_ACCEPTED=true` after reading its [usage policy](https://operations.osmfoundation.org/policies/nominatim/). Batch work is cached, single-machine and limited to four requests/minute; interactive work shares the same provider-wide limiter and backoff. Do not submit confidential addresses. Automatic retries respect errors and throttling; ambiguous city/state/ZIP evidence stays reviewable. `GEOCODER_URL` and an optional API key support a configured compatible provider.

For driving times, configure `ROUTING_URL` for an OSRM-compatible provider, optionally `ROUTING_API_KEY`, `ROUTING_PROVIDER_NAME`, `ROUTING_PROFILE` and `ROUTING_CACHE_DAYS`. A local/self-hosted service requires its exact origin in `ROUTING_LOCAL_ORIGINS`; geocoders have the equivalent `GEOCODER_LOCAL_ORIGINS`. This is explicit allowlisting, not general private-network access. Never place credentials in a URL.

In Settings, select an origin and at most 25 boats per route batch. Coordinates are sent to that configured provider. Cached results show provider/time/expiry. Enable Driving time in Filters for the default four-hour screen. Failed, missing, expired or mismatched routes remain unknown; no straight-line distance is relabeled road time. Estimates omit traffic, stops and trailer restrictions.

## Alerts

Saved searches select new match, price drop, price change, status change and no-longer-matches events. A sold boat leaving an active-only search still qualifies for a selected status-change alert. The first run establishes a baseline without alerting on every existing boat; changed filters/events reset that baseline. Cadence/digest are separate from the collector interval.

Configure SMTP or a webhook in private `.env` only when delivery is intended. No destination was enabled by this goal. Settings → Alert delivery & recovery shows per-channel attempts, timestamps, backoff, next attempt and replay. Replay only retries remaining failed channels. `ALERT_MAX_ATTEMPTS` and `ALERT_RETRY_BASE_SECONDS` bound retries. The worker checks due retries between collection cycles.

Delivery is **at least once**. Stable Message-ID/webhook idempotency identities and persisted channel success reduce repeated sends, but a timeout after remote acceptance can still repeat unless the receiver deduplicates. A failed channel cannot relabel a successful collection or erase its snapshot/backup report.

## Backups, retention and restore

```bash
npm run backup
npm run backup -- --verify=BACKUP_DIRECTORY
npm run retention
npm run retention -- --apply=PLAN_PATH --hash=EXACT_PLAN_SHA256
npm run restore -- --from=BACKUP_DIRECTORY --to=NEW_DIRECTORY
npm run restore -- --from=BACKUP_DIRECTORY --to=NEW_DIRECTORY --apply --hash=MANIFEST_SHA256
```

Backups use consistent SQLite `VACUUM INTO`, integrity checks and a SHA-256 manifest. They include private database state, source/location configuration, image evidence, enrichment checkpoints, durable inventory/session/progress metadata and the matching active snapshot generation/pointer, plus its validated private marker when locally available. A catalog-bearing backup also includes every derived catalog/detail shard. Verification requires the pointer/canonical generation and entire graph to be declared in its manifest and to match the backed-up canonical bytes; an omitted shard cannot pass merely because its file still exists beside the backup. Older backups without a catalog retain their existing verification/restore path. Destinations inside `public/`, `out/` and `.git/` are rejected before any SQL. `.env` is excluded; preserve secrets separately. Docker uses its named volume, not the host `data/` database. `docker compose down -v` deletes that volume; do not use it as routine shutdown.

Retention defaults in `config/retention.json` keep cache 30 days, immutable evidence/reports 90 days, backups/rotated logs 30 days, and at least two verified backups. It protects database-referenced evidence, current reports/publication, open logs and audit history. Accepted-inventory baseline and session metadata are durable protected records regardless of age, together with their referenced component/progress/quality reports; an old resumable session is not treated as disposable cache. The 10-GiB managed-storage budget can warn when protected data prevents reclaiming enough. Optional `--price-history-days=365` selects only old intermediate price points and creates a fresh verified backup before pruning; first/latest points are retained. Apply rechecks file hashes, symlinks, live references and exclusive leases. A changed plan or newly referenced file refuses the operation. No automatic prune schedule was installed.

Retention only scans its fixed managed roots: `data/cache`, `data/evidence`, `data/refresh-runs`, `data/backups` and `logs`. Legacy backups without a verifiable manifest are not automatically disposable; dated research/release folders and nested backups outside those roots need separate review. Plans expire after 24 hours by default, so regenerate before any later approved application. [CLEANUP_REVIEW.md](CLEANUP_REVIEW.md) records the October 20 dry-run and candidate register; the owner-approved high-confidence cleanup subsequently removed 14 expired cache entries plus build/incremental/Finder caches (271 files total, 356.5 MiB). No backup pruning or price-history deletion was applied; medium/low/optional groups still need separate approval. Do not delete individual files from a manifest-bound backup to deduplicate it.

Restore first verifies and previews exact mappings. Apply writes **only into a new directory**, refuses existing destinations/symlink ancestors and rechecks copied hashes. It never replaces a running database or starts a service. Inspect the restored database/configuration, stop the intended writers, and deliberately choose it for recovery. Free-space checks reserve 512 MiB by default (`MIN_FREE_DISK_BYTES`) plus estimated write needs before collection/export/backup.

## Historical archives and bounded file logs

Use archival for an explicitly reviewed historical selection, not as a broader retention sweep. The tool accepts dated `data/refresh-YYYY-MM-DD`/`data/pages-YYYY-MM-DD` trees, `data/p1p2`, `data/validation`, release/backup trees, and individual immutable public snapshot/catalog/detail JSON files. Live databases, evidence, current reports, accepted baselines and sessions are outside its retirement scope. A backup bundle can be copied into an archive, but its members cannot be retired through this tool; use verified backup retention instead.

```bash
npm run archive -- --help
npm run archive -- preview --path=HISTORICAL_PATH --run-id=ORIGINATING_RUN_ID --purpose="Explain the audit being preserved"
# Review the returned exact paths, hashes, references, blockers and plan SHA-256.
npm run archive -- pack --plan=PLAN_PATH_FROM_PREVIEW --hash=EXACT_PLAN_SHA256
npm run archive -- verify --archive=PACKAGE_DIRECTORY_FROM_PACK
npm run archive -- restore --archive=PACKAGE_DIRECTORY_FROM_PACK --destination=NEW_PRIVATE_DIRECTORY
npm run archive -- verify --archive=PACKAGE_DIRECTORY_FROM_PACK --restored=NEW_PRIVATE_DIRECTORY
```

The uppercase values are placeholders for actual outputs and existing authorized artifacts; `--run-id` is operator-supplied origin information and must describe the real retained run. Preview and pack remove nothing. Run them after other report-producing jobs settle: the reference inventory includes scanned-file counts and changed references, so new reports can invalidate a preview even before retirement. Save preview receipts under `data/archives/` to keep them outside that reference scan. Plans live privately under `data/archives/plans/`, expire after 24 hours for packing/retirement, and bind the current project, exact file bytes/metadata, Git HEAD at preview, supplied originating run/purpose, reference inventory and retirement policy. Packages at `data/archives/packages/<plan-sha256>/` contain a hashed manifest and content-addressed objects, deduplicated within that package. Verification/restore of an intact package remains available after the retirement plan expires. Restore requires a nonexistent private directory and rechecks the reproduced file bytes; it never overlays the original audit or activates a site.

Reference previews inspect source/configuration/docs and ignored dated helpers, publication/release/backup metadata and public catalog manifests. Paths, content hashes and conservative filename matches identify blockers; unresolved symlinks or oversized uninspected text fail retirement closed. Copying a referred-to artifact is allowed so the copy can be verified; retirement requires a separate exact-hash approval and rechecks current files, live database/audit references and application writer leases. An archive package is not an external/off-machine backup.

The separate deletion command is `npm run archive -- retire --archive=PACKAGE_DIRECTORY_FROM_PACK --hash=EXACT_PLAN_SHA256`. It has **not** been run against the pending medium/low cleanup candidates. Default public policy is `keep-direct-links`. A deliberate new preview can include `--public-retirement=allow-broken-direct-links`, recording that decision in its plan hash; it permits only a genuinely unreferenced obsolete generation. Active/previous pointer, journal, release, backup, helper, catalog or database references still block retirement, even if a referring helper/manifest is selected in the same package. Do not rewrite dated helpers blindly to make a blocker disappear. Retain the per-file retirement receipt and verified package; an interrupted retirement preserves remaining originals and records partial progress.

The file sink defaults to `logs/boatscout.log`, **10 MiB per newly written file and at most 12 retained rotations**. `LOG_FILE`, `LOG_MAX_BYTES` and `LOG_MAX_ROTATIONS` in private `.env` override these settings; keep the file under `logs/` for the existing retention scope. Existing oversized history is preserved rather than truncated. App and worker share a short exclusive filesystem lock for each write/rotation and reopen the active file for each record, so a rename does not leave a process writing to a detached old file. Numeric epoch suffixes such as `.log.<number>` match the existing rotated-log retention rule.

Rotation never deletes a young log or silently exceeds its configured count budget. At the rotation cap, or for a single oversized record, full records continue to stdout while the file sink pauses. A throttled stderr warning and `boatscout.log.rotation.json` record the condition. Review a fresh retention preview; only approved eligible expired rotations are removed by retention. Once a slot is free, a later record resumes file logging. For an oversized record, inspect the payload/limit rather than expecting retention alone to fix it. Service-manager stdout files are a separate destination with their own lifecycle.

A dead ordinary log-writer lock can be recovered after its owning PID exits; an incomplete owner record waits at least 30 seconds before recovery. An abandoned `.lock.recovery` barrier or `data/archives/operation.lock` requires operator inspection. Check the intended app/worker process and working directory, stop those writers if necessary, and confirm no live owner before clearing an abandoned lock; leave unrelated projects and original logs alone. No archival retirement, new retention schedule or OS service installation was performed as part of implementing these features.

## Reviewed GitHub Pages release and rollback

On September 10 the owner authorized making [PNelsonFTP/BoatMarket](https://github.com/PNelsonFTP/BoatMarket) public. GitHub Pages is configured for Actions with HTTPS enforced at [pnelsonftp.github.io/BoatMarket](https://pnelsonftp.github.io/BoatMarket/); the first reviewed public deployment passed September 10, and the latest recorded inventory deployment and desktop/mobile verification passed October 19. See [LIVE_DATA.md](LIVE_DATA.md) for the exact dated snapshot and coverage. The earlier September 8 HTTP 422 applied to the then-private repository. The database, collectors and worker remain local; Pages serves the reviewed static snapshot.

```bash
npm run sbom
npm run release -- prepare
# Inspect the private review manifest, quality warnings and listing content.
npm run release -- approve --review=REVIEW_SHA256 --privacy-reviewed --note="What was reviewed" --accept-warnings
npm run release -- verify --review=REVIEW_SHA256
npm run build
npm run release -- verify --review=REVIEW_SHA256 --built=out
```

Only use `--accept-warnings` after reviewing source-published contact details, age/partial-coverage warnings and unusual count changes. Approval stages files locally; it does not publish. After committing the matching source/snapshot/SBOM/release manifest, ensure GitHub Pages uses Actions and `BOATSCOUT_ENABLE_PAGES=true`. Manually run **Deploy reviewed BoatScout release** with the exact review hash. It verifies source/snapshot/SBOM correspondence, builds the correct Pages path, records matching build provenance and runs desktop/mobile browser smoke tests against that exact built artifact before deployment. Main pushes run validation, not collection or automatic deployment. Fresh public inventory requires another local collection/export, review, matching commit and manual deployment.

`npm run release -- status` reads local activation. To stage an older retained generation, use `npm run release -- rollback --activation=UUID --current=ACTIVE_SHA256`; the expected-current check prevents overwriting an intervening update. Review, build and deploy that generation to roll back the public site. A repository push or local activation alone is not a Pages deployment.

## Validation and troubleshooting

`npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run test:production`, `npm run benchmark:snapshot`, `npm run sbom` and Docker smoke/runtime inventory commands are recorded in [VALIDATION.md](VALIDATION.md). Development-server browser tests use isolated port 3002 by default; `E2E_PORT` changes it. Reuse requires explicit `E2E_REUSE_SERVER=true`; preserve unrelated applications on port 3000.

The production suite serves the existing `out/` export on isolated loopback port 4390 by default, with no existing-server reuse. Build for the same path you test. In a POSIX shell:

```bash
npm run build
npm run test:production
NEXT_PUBLIC_BASE_PATH=/BoatMarket npm run build
BUILT_BASE_PATH=/BoatMarket npm run test:production
# Equivalent manual Pages-suite entry point; defaults to /BoatMarket:
npm run verify:pages
npm run benchmark:snapshot -- --output=data/benchmarks/snapshot.json
```

For PowerShell, set the corresponding environment variable with `$env:NEXT_PUBLIC_BASE_PATH="/BoatMarket"` or `$env:BUILT_BASE_PATH="/BoatMarket"` before running the npm command, and remove/reset it before a root-path build/test. `BUILT_PORT` changes the isolated port; `BUILT_DIRECTORY` changes the export directory. To inspect an already served matching build, `QA_BASE_URL` configures `verify:pages` without starting another server; direct production-suite equivalents are `BUILT_BASE_URL` and `BUILT_SKIP_WEBSERVER=1`. These checks do not refresh seller data or publish a site.

Production desktop/mobile checks cover both deterministic data-independent fixtures and real-snapshot compatibility: asset/base-path loading, pointer/hash integrity, search/filter/no-result behavior, grouping, images, detail hydration/fallback and layout. They do not depend on a Falcon listing or a hardcoded dev-server port. Failures retain traces/screenshots and per-path HTML/JSON summaries under `test-results/production-{root,pages}` and `playwright-report/production-{root,pages}`. CI validates root and Pages builds; the reviewed Pages workflow repeats the smoke suite on its final artifact.

`benchmark:snapshot` compares current/full and compact catalog bytes, Node JSON/schema/filter timings and observed heap growth, checks every searchable field and representative filtered/grouped results, then evaluates 25%-larger synthetic inventory and a 10,000-record ceiling scenario. CI enforces the 8-MiB catalog ceiling and at least 50% initial-byte reduction from the current compact canonical inventory. A growth ceiling may be refused explicitly instead of publishing an oversized index. Reports are private observational measurements; Node heap deltas include garbage-collection noise and are not peak mobile memory, network transfer or timing guarantees. Production-suite attachments separately compare cold desktop/mobile full/catalog loads, resource bytes and application work. Keep before/after evidence on the same profiles when assessing a regression.

For partial/blocked sources, inspect quality/detail/pagination metrics and the dated access ledger. Do not bypass denial/challenge responses or repeatedly retry HTTP 429. For stale jobs, inspect leases and activation before recovery. For failed saves, refresh/review the workspace revision conflict and export private state. For a full disk, review retention's protected paths instead of deleting the last backup or raw evidence blindly. First-party metadata remains `UNLICENSED` with npm `private: true`, despite public GitHub visibility; no license change accompanied publication.
