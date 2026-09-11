# BoatScout operations

Use Node 22.12+ and the committed lockfile. The website is static; collection, database storage and alerts need the local Node backend/worker. GitHub Pages does not execute them. Keep this checkout separate from ClassicCars and inspect process working directories before stopping anything.

## Startup and routine refresh

```bash
npm ci
npm run setup
npm run dev
```

Setup preserves existing `.env` and data, generates a password for a new installation, applies migrations and generates Prisma. Development normally starts the website at 3000 and API at 4310; read Next's actual startup URL if a port is occupied. The bundled launchers and Cursor tasks invoke these commands. Stop your foreground processes with Ctrl+C.

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

`public/data-mode.json` activates an immutable `public/snapshots/<sha256>.json` generation. The browser checks its SHA-256 before loading. Legacy `public/snapshot.json` remains a compatibility/export file. `data/publication` records private prepared/committed generations; recovery examines the pointer so a hard kill after activation does not invent a rollback. A fresh clone can validate the public generation without this private journal: it is reported as imported, with no claimed local run or commit time. Backups retain its verified pointer and generation; a private marker is included only when it exists and matches. An export is local staging, not a GitHub deployment.

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

`data/enrichment` retains detail attempt/success/backoff checkpoints. `data/cache` is the per-URL reuse cache; `data/evidence` retains immutable captured bodies and dated observation records. These are private. Capture/preview/reparse tools:

```bash
npm run source:tools -- --help
npm run source:tools -- capture --source=SOURCE_ID --url=SOURCE_URL --output=data/fixture.html
# Add --file=local-capture.html to use an existing authorized local capture.
npm run source:tools -- preview --source=SOURCE_ID --url=SOURCE_URL --file=data/fixture.html
npm run source:tools -- apply --review=EXACT_PREVIEW_SHA256
```

Review automatic redaction before committing/sharing a fixture. A downloaded fixture's file modification time may differ from its source observation time; pass `--observed-at=ISO` when needed. Preview shows schema/quality checks and field differences without changing listings. Apply is bounded to 1,000 records, checks input/parser/configuration/database fingerprints, makes a verified backup, and preserves a per-record apply report. Old captures cannot overwrite newer observations. Records missing from a captured page are never mass-removed. Re-preview after a conflict or partial apply.

## Identity, location and current rules

Duplicate review in Settings has active, nearby and changed-since-review filters. Same/different/undo decisions preserve all ads and per-ad private notes. Different supported HINs veto grouping. `npm run duplicates:review -- --dry-run` previews reindexing; `--apply` applies it. Vessel timelines show membership, review, price and status observations. `npm run images:audit -- --help` explains bounded operator-provided local-image evidence; no unrestricted photo downloader is enabled.

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

Backups use consistent SQLite `VACUUM INTO`, integrity checks and a SHA-256 manifest. They include private database state, source/location configuration, image evidence, enrichment checkpoints and the matching active snapshot generation/pointer, plus its validated private marker when locally available. Destinations inside `public/`, `out/` and `.git/` are rejected before any SQL. `.env` is excluded; preserve secrets separately. Docker uses its named volume, not the host `data/` database. `docker compose down -v` deletes that volume; do not use it as routine shutdown.

Retention defaults in `config/retention.json` keep cache 30 days, immutable evidence/reports 90 days, backups/rotated logs 30 days, and at least two verified backups. It protects database-referenced evidence, current reports/publication, open logs and audit history. The 10-GiB managed-storage budget can warn when protected data prevents reclaiming enough. Optional `--price-history-days=365` selects only old intermediate price points and creates a fresh verified backup before pruning; first/latest points are retained. Apply rechecks file hashes, symlinks, live references and exclusive leases. A changed plan or newly referenced file refuses the operation. No automatic prune schedule was installed.

Restore first verifies and previews exact mappings. Apply writes **only into a new directory**, refuses existing destinations/symlink ancestors and rechecks copied hashes. It never replaces a running database or starts a service. Inspect the restored database/configuration, stop the intended writers, and deliberately choose it for recovery. Free-space checks reserve 512 MiB by default (`MIN_FREE_DISK_BYTES`) plus estimated write needs before collection/export/backup.

## Reviewed GitHub Pages release and rollback

On September 10 the owner authorized making [PNelsonFTP/BoatMarket](https://github.com/PNelsonFTP/BoatMarket) public. GitHub Pages is configured for Actions with HTTPS enforced at [pnelsonftp.github.io/BoatMarket](https://pnelsonftp.github.io/BoatMarket/); the reviewed snapshot is live, with deployment and desktop/mobile verification passed on September 10. The earlier September 8 HTTP 422 applied to the then-private repository. The database, collectors and worker remain local; Pages serves the reviewed static snapshot.

```bash
npm run sbom
npm run release -- prepare
# Inspect the private review manifest, quality warnings and listing content.
npm run release -- approve --review=REVIEW_SHA256 --privacy-reviewed --note="What was reviewed" --accept-warnings
npm run release -- verify --review=REVIEW_SHA256
npm run build
npm run release -- verify --review=REVIEW_SHA256 --built=out
```

Only use `--accept-warnings` after reviewing source-published contact details, age/partial-coverage warnings and unusual count changes. Approval stages files locally; it does not publish. After committing the matching source/snapshot/SBOM/release manifest, ensure GitHub Pages uses Actions and `BOATSCOUT_ENABLE_PAGES=true`. Manually run **Deploy reviewed BoatScout release** with the exact review hash. It verifies source and snapshot correspondence, builds the correct Pages path and records matching build provenance. Main pushes run validation, not collection or automatic deployment. Fresh public inventory requires another local collection/export, review, matching commit and manual deployment.

`npm run release -- status` reads local activation. To stage an older retained generation, use `npm run release -- rollback --activation=UUID --current=ACTIVE_SHA256`; the expected-current check prevents overwriting an intervening update. Review, build and deploy that generation to roll back the public site. A repository push or local activation alone is not a Pages deployment.

## Validation and troubleshooting

`npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run sbom` and the Docker smoke/runtime inventory commands are recorded in [VALIDATION.md](VALIDATION.md). Browser tests use isolated port 3002 by default; `E2E_PORT` changes it. Reuse requires explicit `E2E_REUSE_SERVER=true`; preserve unrelated applications on port 3000.

For partial/blocked sources, inspect quality/detail/pagination metrics and the dated access ledger. Do not bypass denial/challenge responses or repeatedly retry HTTP 429. For stale jobs, inspect leases and activation before recovery. For failed saves, refresh/review the workspace revision conflict and export private state. For a full disk, review retention's protected paths instead of deleting the last backup or raw evidence blindly. First-party metadata remains `UNLICENSED` with npm `private: true`, despite public GitHub visibility; no license change accompanied publication.
