# BoatScout operations guide

This guide describes the implementation delivered on September 7, 2026, in America/Chicago time. For the engineering context see [HANDOFF.md](HANDOFF.md); for the dated inventory see [LIVE_DATA.md](LIVE_DATA.md). Run commands from this project's root directory.

## Start, stop, and connect

On an initialized checkout:

```bash
npm run dev
```

This starts the website at `http://127.0.0.1:3000`, API at `http://127.0.0.1:4310`, and collection/alert worker. Use Ctrl+C in that terminal to stop the group. Independently started processes must be stopped in their own terminals. Do not launch another group if those ports are already occupied by this project.

For a fresh machine, install the project dependencies with `npm ci`, then run `npm run setup` before starting. The build/deployment runtime is Node 22; the original desktop verification used Node 26.7. Setup generates the Prisma client and applies committed migrations. It creates a random password only when creating a new `.env`; it preserves an existing `.env` and database. If an existing `.env` has an empty password, fill it deliberately rather than expecting setup to replace it.

The [macOS launcher](Start-BoatScout.command), [Windows launcher](Start-BoatScout.bat), and [Cursor/VS Code tasks](.vscode/tasks.json) provide the same local workflow. Use your editor to read `BOATSCOUT_PASSWORD` in the private `.env`; it is not shown in these documents.

In the website, open **Settings → Your backend**, enter the API address and password, and choose **Connect backend**. Connection tokens expire after 12 hours and are invalidated by an API restart. Reconnect when requested. The password is not stored by the browser.

The default unconnected website opens the published snapshot. A fresh SQLite database starts empty even when that snapshot is bundled with the website. `npm run db:seed` explicitly inserts fictional examples; it is not a live-data bootstrap command. Collect real inventory to populate a fresh backend.

### Separate process commands

| Command | Effect |
|---|---|
| `npm run dev:web` | Development website only |
| `npm run dev:api` | API with source watching |
| `npm run worker` | Continuous collection and alert evaluation |
| `npm run collect` | One collection/alert cycle |
| `npm run build` | Static output in `out/` |
| `npm start` | API; also serves `out/` at port 4310 if the build exists |

The development server uses `.next-dev/`; production builds use `.next/`. A production build can run while the development preview is open.

## Refresh the data

There are four distinct actions: **collect source observations**, **enrich missing locations**, **reload the browser's database view**, and **export/publish a snapshot**. Refreshing a browser page does not crawl marketplaces.

### Connected website

1. Connect the backend in Settings.
2. Under **Sources & collection**, choose **Run enabled sources**.
3. Use **Refresh status** to inspect completion and errors for the run. A request acknowledgment means the job was requested, not completed.
4. When collection is finished, choose **Refresh data** under **Your backend** to load the database into the browser.
5. Run `npm run geocode:listings` separately if new cities need coordinates, inspect ambiguous results, then refresh connected data again.

**Refresh data** alone reads existing database records. **Refresh status** reads source/run status. Neither action starts collection.

### Full local snapshot update

```bash
npm run collect
```

Inspect Settings run history or `logs/boatscout.log` before continuing. The current one-shot worker can exit with status zero even when sources fail or another collector holds the lease. Check each source's `status`, `errors`, and completion time; do not use shell success alone as the publication decision.

Then, as needed:

```bash
npm run geocode:listings
npm run export:snapshot
npm run build
```

These commands are sequential steps, not a promise of all-or-nothing refresh. The geocoder may leave ambiguous cities unresolved. Export writes all real database records, including sold/stale records with their status, to `public/snapshot.json`, and enables snapshot mode in `public/data-mode.json`.

- **Local development snapshot:** reload the website after export; the development server reads `public/` directly. A rebuild is not required just to see the new snapshot there.
- **Local production website:** rebuild so `out/` contains the exported snapshot.
- **Connected mode:** database changes become visible through **Refresh data**; rebuilding the static frontend is unnecessary for data-only changes.
- **GitHub Pages:** review the snapshot, commit and push its public files to the configured repository, and let the deployment workflow build/publish. The private repository is [PNelsonFTP/BoatMarket](https://github.com/PNelsonFTP/BoatMarket). Pages publication remains disabled; enable Pages and set `BOATSCOUT_ENABLE_PAGES=true` in repository Actions variables before expecting deployment.

For partial collection, preserved old records may coexist with fresh ones. Check observation times and report the failed sources. An exported `generatedAt` timestamp is the export time, not proof that every ad was freshly fetched.

### Cache and availability behavior

- Ordinary and optionally rendered pages are cached for **24 hours per URL**. Frequent cycles normally reread that cache. There is no supported force-refresh flag or configurable cache lifetime yet.
- Cached passes preserve the original page observation time. A daily fixed-clock run can still use a page younger than 24 hours if the preceding run finished later; inspect the timestamps rather than assuming a daily tick means a new request for every URL.
- Cache files are keyed by URL and overwritten on later fetch. They support re-parsing the current saved page; they are not an immutable archive of every historical page.
- Missing/challenged pages are recorded as errors. They do not mark every missing boat sold. Real active records without an observation for 14 days become stale.
- Explicit sold status is retained where parsers find it. Sale-pending text is shown when available, but a seller may have sold a boat without updating the source page.
- Source refreshes revisit the **ten enabled sources**. Discovering another dealer or marketplace is a separate research/integration task.

## Daily, weekly, and alert schedules

**Current state:** the worker is configured with `WORKER_INTERVAL_MINUTES=30`. Daily full refresh and weekly broader research were discussed as recommendations; no new fixed daily/weekly desktop automation or operating-system schedule was created during this work.

The worker runs immediately when started, completes collection and alert evaluation, then waits the configured interval. Its cadence is relative to completion, not a wall-clock appointment. Restart it after editing `.env`.

| Desired worker interval | `.env` value |
|---|---|
| 30 minutes | `WORKER_INTERVAL_MINUTES=30` |
| Roughly daily | `WORKER_INTERVAL_MINUTES=1440` |
| Roughly weekly | `WORKER_INTERVAL_MINUTES=10080` |

The computer must remain awake with the worker running for these intervals to execute. This is not an installed system service or a durable missed-run scheduler. Docker has restart policies while Docker itself is available; a terminal process does not automatically resume after a reboot.

The built-in worker performs **collection plus alert evaluation only**. It does not run batch geocoding, export snapshots, build the site, deploy Pages, or discover new sources. A future full-refresh schedule must include those chosen steps and inspect partial failures before publishing. [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md) tracks this work.

Saved-search hourly/daily/weekly cadence controls **alert evaluation**, separately from the worker's collection interval. The initial Lake Holiday presets have alerts off. To enable them, edit the saved search while connected and choose a cadence/channel. In-app alerts are available; external delivery needs the corresponding destination configuration. External email/webhook delivery has not been tested against a configured recipient in this checkout.

Suggested routine: daily refresh of the enabled sources with a reviewed snapshot export, and a weekly research/collector-health pass. The schedule, destination, and notification preference still need to be selected before setting that up.

## Location and search maintenance

The app uses approximate straight-line miles, not driving/towing hours. Lake Holiday is the reference for nearby presets. Locations across Lake Michigan can appear close while taking much longer to drive.

Batch geocoding reads/writes `config/locations.json`, queries up to 100 uncached cities per invocation, and currently targets IL/WI/IN/IA/MI. It preserves supplied listing coordinates and applies cached city coordinates to otherwise unresolved ads. Review ambiguous names and postal codes; the current first-result selection is not a comprehensive ambiguity resolver.

Settings place search uses a separate SQLite `GeocodeCache`. Clearing that UI cache does not clear the batch city file or automatically correct every listing. Maintain both deliberately. An Allendale, Michigan match was manually corrected to the Ottawa County locality during the expanded pass; preserve that correction.

Lake Holiday's strict presets screen reported lengths below 21 ft. The main nearby preset also has an 18-ft lower bound; dedicated fishing and ski presets have their own filters. The public 2024 association rulebook is a preliminary reference, not current registration approval. See [LIVE_DATA.md](LIVE_DATA.md) for the exact scope and [lib/lake-holiday.ts](lib/lake-holiday.ts) for the defaults.

`node --import tsx scripts/configure-lake-holiday.ts` is an **initializer/reset for the named home, rule, and six presets**. It replaces those named definitions, including resetting their alert cadence to off, while retaining other workspace content. Do not include it in routine refreshes when preserving edited searches. Existing saved searches can differ from newly updated quick-search defaults.

## Configuration reference

| Location/key | Purpose |
|---|---|
| `.env` / `DATABASE_URL` | Private database location; default `file:../data/boatscout.db`, resolved relative to Prisma's schema |
| `BOATSCOUT_PASSWORD` | Single-user backend password; restart API after changing |
| `HOST`, `PORT` | API binding; defaults loopback and 4310 |
| `ALLOWED_ORIGINS` | Exact permitted browser origins, comma-separated; no repository path |
| `NEXT_PUBLIC_API_URL` | Optional public default backend address; never a credential |
| `NEXT_PUBLIC_BASE_PATH` | Static build repository prefix, such as `/BoatMarket` |
| `SOURCE_CONFIG` | Source JSON file path; default `config/sources.json` |
| `WORKER_INTERVAL_MINUTES` | Relative worker interval, minimum one minute |
| `GEOCODER_USER_AGENT` | User agent used by the public-request client; default in `.env.example` |
| `LOG_LEVEL` | Pino logging level; defaults to `info` |
| `SMTP_*`, `ALERT_EMAIL` | Optional email transport and recipient |
| `ALERT_WEBHOOK_URL` | Optional HTTPS webhook destination |
| `config/sources.json` | Enabled sources, URLs, selectors, pagination/detail settings |
| `config/locations.json` | Reviewed/cached city coordinates for listing enrichment |
| `public/data-mode.json` | Whether the static site opens its bundled snapshot |

Keep source URLs free of secrets if they will be committed. Source configuration is intended for public listing pages. Restart processes for `.env` changes; collection reads source configuration at the next cycle.

## Backup and restore

Use a private backup destination outside the repository. Browser-local favorites/notes are different from backend data.

1. Export the browser workspace from Settings if using sample/snapshot mode. That export includes private notes; it is not a publication file.
2. Stop the API, worker, and any collection/geocoding/import processes before taking a filesystem database copy.
3. Back up the complete local `data/` directory, including the database and any SQLite sidecar files, plus `config/` and `.env`. The HTML cache can be large; preserve it when raw evidence matters. Also retain `public/snapshot.json` and `public/data-mode.json` if you need the exact published view.
4. Store a copy of the code/lockfile corresponding to that backup. `logs/` is optional for recovery but useful for investigating ingestion history.
5. To restore, first preserve the current state, keep services stopped, and restore into the matching paths on a compatible checkout. Run `npm ci` and `npm run setup` to generate the client/apply outstanding migrations; inspect migration results before restarting.
6. Reconnect the browser and verify sample/real counts, favorites/notes, source configuration, and latest run times. Restoring an older database rolls back its collected records and price history.

Docker stores SQLite in the named `boatscout-data` volume, not host `data/`. Stop both Compose services before backing up/restoring that volume with Docker's volume tools. Ordinary `docker compose down` preserves it; deleting volumes deletes the database. `.env`, `config/`, and `logs/` still require separate host backups. A clean restore into another directory/machine has not yet been exercised as a formal drill.

## Troubleshooting

| Symptom | Check and response |
|---|---|
| Website opens an error or stale tab | Open the actual root `http://127.0.0.1:3000/`; `/error` is not an app route. Confirm the development server is running |
| Port already in use | Identify the existing BoatScout process/terminal before starting another; stop that instance or deliberately configure a different port and matching origins |
| Backend login fails | Verify URL, `.env` password, and allowed origin; reconnect after expiry/restart. Setup does not replace an existing empty password |
| Collection says requested but nothing changed | Inspect run history and collector lease; inspect cache age and source errors. HTTP 202 and process exit zero do not prove success |
| New ads exist in SQLite but not on screen | In connected mode choose Refresh data; in snapshot mode export, reload, and rebuild/redeploy where applicable |
| Nearby count seems too small | Open View coverage, All nearby ads, or Include unknown lengths. Check selected make/power/length/location filters, source coverage, and unknown cities |
| Duplicate boats appear | Cross-posts and same-source reposts still remain. Compare links/specs/photos and retain private review notes; there is no manual merge/unmerge UI yet |
| Source returns 403/429 or a challenge | Stop that source's automated attempt, retain old observations, and consult SOURCE_COVERAGE.md. Manual import or an authorized feed is the fallback |
| Entire inventory JSON will not import into backend | API import allows at most 1,000 records/request and 12 MiB bodies. The current 1,538-record export needs batches; there is no automatic UI batching yet |
| Geocoder reports no city/wrong locality | Review city/state/ZIP and candidate evidence; correct the batch cache deliberately. Do not use a wrong point to make a boat appear nearby |
| Static assets fail under Pages | Build with the correct base path and serve `out/` under that same prefix; run the Pages verification script |
| Health endpoint returns OK but data/jobs fail | `/api/health` checks API responsiveness/password configuration, not database connectivity or worker health. Inspect authenticated admin state and logs |

Durable operational logs are in `logs/boatscout.log`; source runs are in SQLite `IngestRun`. Development command output and ignored `data/research/` files contain additional session evidence, but future operators should rely on documented scripts rather than scratch scripts. Test artifacts are ignored; the portable record is [VALIDATION.md](VALIDATION.md).

## Verification and maintenance

After a parser/application change, use the relevant unit tests and source fixtures, then the browser/build checks for affected workflows. See [VALIDATION.md](VALIDATION.md) for exact commands, prior results, and unverified integrations.

Regenerate the [software bill of materials](SBOM.md) when dependencies change. Its audit results are dated observations, not a permanent assurance about vulnerabilities. Keep [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [LIVE_DATA.md](LIVE_DATA.md) current when adding sources or publishing another snapshot.

The current Docker image copies the complete build `node_modules` tree into runtime. A production-dependency-only SBOM is therefore not the complete inventory of that image; see SBOM scope and the runtime-image improvement in [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md).
