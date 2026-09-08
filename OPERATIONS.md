# BoatScout operations guide

This guide describes the September 8, 2026 implementation. Commands run from the BoatMarket project root. See [HANDOFF.md](HANDOFF.md) for architecture, [LIVE_DATA.md](LIVE_DATA.md) for dated inventory, and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md) for remaining work.

## Start, stop, and connect

On an initialized checkout:

```bash
npm run dev
```

This starts the website at `http://127.0.0.1:3000`, API at `http://127.0.0.1:4310`, and collection/alert worker. Ctrl+C stops that group and requests cancellation of active work. Independently started processes must be stopped in their own terminals. Do not start another group on occupied ports.

On a fresh machine, use Node 22.12 or newer, `npm ci`, and `npm run setup`. Setup generates the Prisma client and applies committed migrations. It creates a random password when creating a new `.env`; it preserves an existing `.env` and database. Fill an existing empty password deliberately. [macOS](Start-BoatScout.command), [Windows](Start-BoatScout.bat), and [Cursor/VS Code tasks](.vscode/tasks.json) provide local launchers.

In **Settings → Your backend**, enter the API address and private `.env` password, then choose **Connect backend**. Tokens expire after 12 hours and an API restart invalidates them. The browser does not retain the password. An unconnected browser uses the bundled snapshot; a newly created backend database is empty until collection or import. `npm run db:seed` adds fictional examples, not live inventory.

| Command | Effect |
|---|---|
| `npm run dev:web` | Development website only |
| `npm run dev:api` | API with source watching |
| `npm run worker` | Continuous collection, with optional complete refresh |
| `npm run collect` | One collection cycle; alerts evaluated only after successful collection |
| `npm run refresh` | Backup → collection → outcome check → validated atomic snapshot export |
| `npm run backup` | Consistent SQLite backup and supporting files, with hashes |
| `npm run build` | Static output in `out/` |
| `npm start` | API; also serves `out/` at port 4310 when present |

Development uses `.next-dev/`; production builds use `.next/`.

## Refresh the data

Collection, location enrichment, browser reload, snapshot export, and GitHub publication are separate actions. The complete refresh command coordinates the first steps and deliberately does not build, commit, push, or publish.

### Recommended complete refresh

```bash
npm run refresh
```

The job writes a durable report, creates and validates a consistent SQLite backup, copies the previous snapshot/configuration, collects enabled sources, and checks the actual outcome. It then reserves collection ownership while validating and atomically replacing `public/snapshot.json`. It enables `public/data-mode.json` snapshot mode. Samples, raw captures, private workspace records, and recognizable credential/workspace spec keys are excluded from the public artifact.

To include bounded missing-city enrichment:

```bash
npm run refresh -- --geocode
```

Geocoding runs only after an acceptable collection result. Ambiguous places remain for review; request failures stop export. SQLite and already collected records can change during a partial job, but the existing website snapshot remains intact when collection or requested enrichment fails. A backup is recovery material, not an automatic rollback of the entire job.

### Outcomes and partial results

| Exit | Meaning |
|---|---|
| `0` | Successful collection/refresh; also explicit `--skip-busy` skips |
| `1` | Failed collection or another fatal job/validation/backup error |
| `2` | Partial collection; some configured work incomplete |
| `3` | Busy: another owner holds the necessary lease |
| `130` | Operator cancellation |

Both `npm run collect` and `npm run refresh` now expose these outcomes. A successful collection can consist entirely of cached observations. Inventory/detail caps produce explicit incomplete results. `--skip-busy` changes only the busy exit code; the report still says busy and does not claim sources were refreshed.

By default, partial collection **does not replace the public snapshot**. Inspect source errors and observation dates first. An intentional partial export is available:

```bash
npm run refresh -- --allow-partial
```

That snapshot contains `refresh.partial: true`, run identity, collection timestamps, and the partial status. The CLI still exits `2`, even when that explicitly allowed export succeeds. `--allow-partial` never permits export after failed, busy, cancelled, or failed requested-geocode work. The older successful snapshot and the database backup remain in the backup directory.

Other options:

```bash
npm run refresh -- --cache-hours=48
npm run refresh -- --target=data/review-snapshot.json
npm run refresh -- --help
```

A custom target does not change the default website mode. Increasing the cache age reuses observations longer; it does not make them newer. Use `npm run export:snapshot -- [target]` only when deliberately exporting the current database without a preceding collection outcome check. That low-level exporter validates content, makes a snapshot backup, rejects an empty real-data export by default, and replaces the file atomically. Its explicit `--allow-empty` option is for an intentional empty dataset.

### Connected website

1. Connect in Settings.
2. Under **Source health & refresh**, choose **Refresh data & snapshot** for the complete default job. The UI uses the configured cache policy and does not request optional geocoding.
3. Read the returned run identity and **Latest full refresh** status. The panel reloads status periodically; **Reload status** requests an immediate update. HTTP 202 acknowledges a queued request, not completion.
4. After completion, **Your backend → Refresh data** reloads connected records. A snapshot browser needs a page reload after export.

The older **Sources & collection → Run enabled sources** control performs collection only. **Refresh status** reads its source runs; it does not start another collection. API preflight rejects a known busy job, and the actual durable result remains authoritative if another process acquires a lease after preflight.

### Where the result appears

- **Development snapshot:** reload the website after export. Next reads `public/` directly.
- **Connected browser:** choose Refresh data; no frontend rebuild is necessary for database-only changes.
- **Local production:** run `npm run build` after export to copy the snapshot into `out/`, then serve that build.
- **GitHub Pages:** review public files, commit/push them, and use the configured opt-in Pages workflow. Refresh never publishes automatically. Repository: [PNelsonFTP/BoatMarket](https://github.com/PNelsonFTP/BoatMarket). Pages must be enabled and `BOATSCOUT_ENABLE_PAGES=true` set in repository Actions variables before that workflow publishes.
- **Existing Docker runtime image:** it serves `out/`; a default export to `public/` does not update that served directory. Rebuild the image with the reviewed snapshot, or deliberately use a custom `--target=out/snapshot.json` inside the container for a local served-data replacement. The latter changes container output, not GitHub Pages or the host checkout, and must have persistent storage if it needs to survive image recreation.

### Cache, observation age, and retained fields

Default cache age is **24 hours per URL**. Set `COLLECTION_CACHE_HOURS` globally, `cacheMaxAgeHours` on a source, or `--cache-hours=N` for one complete job. The explicit job option overrides source settings; source settings override the global default. Values are between 1 and 720 hours. New page requests still check robots rules, use crawl delays and request spacing, and stop at challenges. There is no force-bypass mode.

A cache hit preserves the page's original observation time. Snapshot `generatedAt` is its export time; `observationRange` describes observed summary/detail dates, and `refresh` identifies the generating complete job. A daily run can reuse a page still younger than 24 hours, especially when the previous cycle ended later. No run timestamp proves that every ad was newly fetched or remains available.

Failed detail enrichment retains previous successful detail values and their `detailsCheckedAt` age, with `detailEnrichmentStatus`, `retainedDetailFields`, and error/attempt evidence. Fresh summary asking price and availability remain usable. An older cached detail cannot overwrite a newer summary asking price or resurrect its sold/removed status. Equal-time sold/removed summaries take precedence. A newer detail with a missing price retains the known summary quote; a newer unknown-price summary stays unknown rather than taking an older detail quote. These rules resolve observation order, not seller accuracy.

The cache is overwritten on later successful fetch; it is not a permanent archive. Missing or challenged pages preserve prior records. Active records unobserved for 14 days become stale. Explicit sold/removed statuses are retained, and pending text is shown when exposed. Configured-source refresh does not discover new dealers or prove exhaustive market coverage.

## Daily, weekly, and alerts

No operating-system schedule, fixed-clock automation, or remote service was installed. The local worker runs immediately, completes a cycle, then waits the configured interval. Its next time is relative to completion. Keep the computer awake and worker running; a terminal process does not recover missed runs after a reboot.

Default worker behavior is collection plus alert evaluation after successful collection. Complete refresh is opt-in. For a roughly daily complete refresh, put these values in `.env` and restart the worker:

```dotenv
WORKER_INTERVAL_MINUTES="1440"
WORKER_AUTO_EXPORT="true"
WORKER_AUTO_GEOCODE="false"
COLLECTION_CACHE_HOURS="24"
```

For roughly weekly complete refreshes, use:

```dotenv
WORKER_INTERVAL_MINUTES="10080"
WORKER_AUTO_EXPORT="true"
WORKER_AUTO_GEOCODE="false"
COLLECTION_CACHE_HOURS="24"
```

Intervals must be finite and between 1 and 10,080 minutes. `WORKER_AUTO_GEOCODE=true` adds bounded enrichment to daemon complete refreshes. It has no effect while auto export is off. `npm run collect` remains collection-only even when the daemon's auto export option is enabled. Default `WORKER_INTERVAL_MINUTES=30` can remain useful for alert checks, but frequent auto-export cycles also create frequent backups; no automatic backup pruning is implemented.

Worker complete jobs preserve the snapshot on partial/failure and never build or publish. A separate weekly research pass for new sources remains a human/agent research task, not a worker feature. For fixed-clock execution, an operator can schedule `npm run refresh` with their chosen local scheduler and inspect its exit code; that scheduler is not installed by these examples.

Saved-search hourly/daily/weekly cadence controls alert evaluation separately. Lake Holiday defaults start with alerts off. Enable cadence/channel in a connected saved search when desired. Email/webhook delivery requires destination configuration; no real recipient delivery is claimed from fixture tests. Delivery deduplication/retry limits are described in [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).

## Reports, ownership, and recovery

`data/refresh-runs/` contains:

| File | Meaning |
|---|---|
| `<runId>.json` | Collection outcome, source runs, metrics and errors |
| `<runId>-refresh.json` | Complete job stages, backup path, collection outcome, export result |
| `latest-collection.json` | Latest collection attempt, including busy attempts |
| `latest-refresh.json` | Latest complete-refresh attempt/progress |
| `worker.json` | Worker PID, heartbeat, state, last result and next scheduled cycle |

Reports use atomic file replacement. `REFRESH_REPORT_DIR` changes their directory. Per-source telemetry counts configured/discovered/successful inventory pages, detail eligibility/attempts/failures/caps, duplicate ads skipped, cached/fetched HTML, observation ranges, content changes, metadata-only changes, price changes, and price drops. `fetchedPages` counts successful inventory/detail HTML fetches, not robots or browser resource requests. Content-change counts omit check timestamps and internal provenance; they are parsed listing changes, not verified seller transactions.

The collector renews its owner lease throughout inventory and detail work. Network waits are cancellable; lease loss stops subsequent work. Listing writes and the final stale-status update check ownership in their database transactions. Only an owner that acquires the collector lease reconciles abandoned `running` source runs as `interrupted`. Do not delete a live owner's lock to force a second collection. An expired lease can be acquired by a subsequent process.

`/api/health` checks database readiness separately from a recent worker heartbeat. Authenticated Settings exposes full source/refresh details. A heartbeat is a local process report, not an operating-system supervisor or guarantee of recent successful collection. Multiple manually launched workers share coordination but are not a managed fleet. After a crash, a last report can remain at its interrupted stage until the next relevant job updates state; inspect leases, timestamps and logs together.

## Location, duplicate, and personal-data maintenance

Distances remain approximate straight-line miles, not road/towing hours. Lake Michigan can make a nearby point a long drive. No route-time provider was installed.

`npm run geocode:listings` queries at most 100 unresolved, previously uncached listing cities per invocation. It compares structured locality/state/postal evidence, recognizes suburbs, and keeps ambiguous candidates for review instead of selecting the first plausible name. HTTP 403/429 stops the batch; request errors produce exit `2`. Standalone enrichment uses the collector lease, so it does not overlap a collector. Ordinary source coordinates are preserved; an explicit reviewed city override may replace an approximate point.

City cache: `config/locations.json` (or `LOCATION_CONFIG`). Private review/correction evidence: `data/location-review.json` (or `LOCATION_REVIEW_FILE`). Use **Settings → Location review** to inspect unresolved places and deliberately save corrections. This is separate from the API's `GeocodeCache` used for interactive place search. Clearing the latter does not erase reviewed city corrections. The Allendale regression covers competing Ottawa/Clare County localities; it does not make all cities unambiguous.

Use the connected duplicate review controls to inspect candidate evidence, mark same/different vessels, and undo decisions. Listing source links and histories remain separate. Conflicting valid HINs prevent automatic grouping. Human decisions and undo are not proof that all remaining cross-posts have been found. `npm run duplicates:review -- --dry-run` previews re-evaluation; `npm run duplicates:review -- --apply` applies it after review. The default command is a dry run. See the handoff before changing review state.

**Your data** supports a listing-import preview, bounded sequential backend chunks, and an outcome manifest. A later failure can leave prior accepted records saved. Download the manifest, refresh/reconcile uncertain IDs, and retry only the appropriate records. Workspace restore has merge/replace previews and a download of the previous workspace. It cannot restore a favorite/note's listing reference until that listing exists. Browser storage is separated by deployment/backend identity; deliberate legacy migration is described in the handoff.

Lake Holiday's under-21-ft reported-length screen remains preliminary. Confirm current association rules, actual measured hull/platform length and the boat's capacity plate before purchase. `npm run configure:lake-holiday` adds missing defaults while preserving existing named searches/rules/home points. Only `npm run configure:lake-holiday -- --reset-existing` deliberately resets the built-in definitions; do not put that reset in routine refreshes.

## Configuration reference

| Key/file | Purpose |
|---|---|
| `.env` / `DATABASE_URL` | Private database; default `file:../data/boatscout.db`, relative to Prisma schema |
| `BOATSCOUT_PASSWORD` | Backend password; restart API after change |
| `HOST`, `PORT`, `ALLOWED_ORIGINS` | API binding and permitted browser origins |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BASE_PATH` | Public backend default and static repository prefix; never credentials |
| `SOURCE_CONFIG` | Default `config/sources.json` |
| `COLLECTION_CACHE_HOURS` | Global cache age, default 24; 1–720 hours |
| Source `cacheMaxAgeHours` | Optional per-source cache override |
| `COLLECTION_CACHE_DIR` | Default `data/cache`; useful for isolated fixture work |
| `WORKER_INTERVAL_MINUTES` | Wait after cycle completion; default 30, range 1–10,080 |
| `WORKER_AUTO_EXPORT`, `WORKER_AUTO_GEOCODE` | Explicit `true` enables complete daemon refresh / optional enrichment |
| `REFRESH_REPORT_DIR`, `REFRESH_BACKUP_DIR` | Local report/backup roots |
| `LOCATION_CONFIG`, `LOCATION_REVIEW_FILE` | City cache and private review evidence paths |
| `GEOCODER_USER_AGENT` | Public-request user agent identifying the application |
| `LOG_LEVEL` | Pino log level |
| `SMTP_*`, `ALERT_EMAIL`, `ALERT_WEBHOOK_URL` | Optional delivery transport/destination |
| `config/source-access.json` | Dated blocked/unsupported-source ledger |
| `public/data-mode.json` | Default static-site dataset mode |

Keep secrets out of source URLs. Source configuration is for public inventory. Restart processes for environment changes; each collection rereads source configuration. `GEOCODE_COLLECTOR_OWNER` is an internal reservation handoff from refresh to its geocoder, not an operator setting.

## Backup, verify, and restore

Create a backup without stopping SQLite clients:

```bash
npm run backup
```

The command prints the generated private `data/backups/refresh/manual-<id>/` directory. Or choose a private directory explicitly:

```bash
npm run backup -- /private/path/to/boat-backup
```

SQLite `VACUUM INTO` makes a consistent database file, then a separate connection validates `PRAGMA quick_check`. The backup includes the backend workspace, duplicate decisions, histories and database metadata. Available snapshot, data-mode, source configuration, source-access ledger, city cache and private location-review evidence are copied beside it. `manifest.json` records SHA-256 hashes. The database and these separately copied files are **not one transaction across the entire folder**; pause config edits/enrichment if a precisely aligned multi-file recovery point is required.

Private backups are rejected under `public/`, `out/`, or `.git/`. `.env` secrets, raw HTML cache, logs, arbitrary custom config files, code/lockfile and browser-only workspace data are **not** included. Preserve those separately when needed. Browser workspace exports contain private notes and must not be published. Retain the matching code revision/lockfile and separately protect `.env` so a restore has compatible code and credentials. Backups are not automatically pruned.

Verify an existing backup without restoring it or starting a worker:

```bash
npm run backup -- --verify=data/backups/refresh/manual-REPLACE_WITH_ID
```

Replace the placeholder with the printed directory. Verification checks every manifest hash, SQLite integrity, and readable row counts by table. It fails on modified/missing files. The fixture drill creates a separate SQLite database, backs it up, reopens the backup, verifies hashes and reads preserved rows; it does not claim a live full-machine disaster recovery drill.

### Restore the default local layout

1. Export any browser-only workspace; take a new backup of current backend state before replacing it.
2. Stop the API, worker, import and enrichment processes. Keep them stopped through replacement. Verify the selected backup with the command above.
3. In a compatible checkout, set `BOAT_BACKUP_DIR` to the selected directory and run the following from the project root. This example targets the default `data/boatscout.db`; adapt paths to your `DATABASE_URL`, `SOURCE_CONFIG`, `LOCATION_CONFIG`, and `LOCATION_REVIEW_FILE` when customized.

```bash
export BOAT_BACKUP_DIR="/absolute/path/to/verified/backup"
node --input-type=module <<'JS'
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
const backup = process.env.BOAT_BACKUP_DIR;
if (!backup) throw new Error("Set BOAT_BACKUP_DIR first");
const manifest = JSON.parse(await readFile(join(backup, "manifest.json"), "utf8"));
const names = new Set(manifest.files.map(file => file.name));
await mkdir("data", { recursive: true });
for (const suffix of ["-wal", "-shm", "-journal"])
  await rm("data/boatscout.db" + suffix, { force: true });
await copyFile(join(backup, "boatscout.db"), "data/boatscout.db");
for (const [name, target] of [
  ["sources.json", "config/sources.json"],
  ["source-access.json", "config/source-access.json"],
  ["locations.json", "config/locations.json"],
  ["location-review.json", "data/location-review.json"],
  ["snapshot.json", "public/snapshot.json"],
  ["data-mode.json", "public/data-mode.json"],
]) if (names.has(name)) await copyFile(join(backup, name), target);
console.log("Default-layout backup restored. Services remain stopped.");
JS
npm ci
npm run setup
```

4. Inspect migration results before restarting. Restore `.env` separately if needed. Reconnect and compare real/sample counts, favorites, notes, saved searches, price history and duplicate decisions with the verified backup counts. Restoring older data rolls back later observations and private changes. The next collector reconciles abandoned source runs; a still-unexpired restored lease can temporarily report busy until it expires.
5. Rebuild for a local production `out/` website. Publish only through an intentional reviewed workflow. A snapshot-only restore does not restore the backend or browser workspace.

The restore snippet is a manual, default-layout procedure, not an automatic rollback service. It removes SQLite sidecars only while all database users are stopped. The backup verifier validates saved evidence; it does not guarantee compatibility with arbitrarily older application code.

Docker's SQLite lives in its named volume. Run backup/verify in the container or use Docker's volume tools, and copy backup artifacts to durable storage. Stop all database users before restoring a volume; ordinary `docker compose down` preserves named volumes, while deleting volumes deletes their data. Host `.env`, config mounts and logs require separate preservation.

## Troubleshooting and maintenance

| Symptom | Check and response |
|---|---|
| Error or stale browser tab | Open `http://127.0.0.1:3000/`; `/error` is not the app root |
| Login/port conflict | Check the existing terminal, configured origin and API URL; reconnect after API restart |
| Requested refresh but no changes | Check the run ID and final outcome, cache-hit count, observation dates and ownership; 202 is not completion |
| Partial refresh | Inspect source errors/caps and previous observations; fix coverage or explicitly choose a labeled partial export |
| Busy | Let the current owner finish; inspect lease expiry/heartbeat rather than deleting a live lock |
| Ads in SQLite but not visible | Refresh connected data, or export/reload/rebuild the appropriate snapshot deployment |
| Nearby count seems small | Compare strict shortlist with All nearby ads and Include unknown lengths; inspect location/coverage gaps |
| Duplicates remain | Review candidate evidence; different HINs may represent distinct same-model stock units |
| 403/429/challenge | Respect the restriction; keep the dated ledger and investigate permitted feeds or manual import |
| Import incomplete | Download the outcome manifest, reconcile accepted/uncertain IDs and retry appropriate records |
| Wrong/ambiguous city | Use location review; never invent a nearby point or driving time |
| Backup cannot be verified | Preserve the failing artifacts, compare hashes and choose a known-good backup before restoring |
| Healthy API but stale data | Database readiness, process heartbeat and last successful source observations are separate checks |
| Pages assets fail | Build and serve with the same repository prefix; use the Pages verification script |

Logs remain in `logs/boatscout.log`; source runs are in SQLite `IngestRun`; full-job reports/worker heartbeat are in the configured report directory. Run appropriate fixture/API/browser checks after changes, as listed in [VALIDATION.md](VALIDATION.md). Regenerate [SBOM.md](SBOM.md) and its artifacts when relevant. Source access and dependency audits are dated observations, not permanent guarantees.

The Docker runtime currently includes the full build dependency tree. The production-only dependency inventory is therefore not the complete image SBOM. Managed process supervision, alert-delivery renewal/retry improvements, cache/report/backup retention, broader permitted sources and optional road routing remain roadmap items.
