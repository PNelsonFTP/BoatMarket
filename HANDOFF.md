# BoatScout handoff

BoatScout is a static Next.js website and authenticated local Fastify/Prisma/SQLite API/worker. It searches advertisements around **Lake Holiday, Illinois**, prioritizes nearby premium fishing boats with larger motors and offers MasterCraft/peer ski profiles. [BoatPrompt.md](BoatPrompt.md) is the original brief. [MuscleCarPrompt.md](MuscleCarPrompt.md) is only a separate project specification; the car application, processes and data remain independent.

The September 8, 2026 P1/P2 goal is documented in [P1_P2_IMPLEMENTATION.md](P1_P2_IMPLEMENTATION.md). Use [VALIDATION.md](VALIDATION.md) for dated tests, final inventory and hosted CI results, [OPERATIONS.md](OPERATIONS.md) for commands, and [SBOM.md](SBOM.md) for dependency/image evidence. Do not infer current liveness from an old session or heartbeat.

**Delivery checkpoint:** further enhancement work has been wound down. The owner reviewed the local website, authorized commit/push, and the implementation and compatibility corrections have been pushed to `main`. GitHub rejected Pages setup with HTTP 422 on September 8 while the repository was private. On September 10 the owner authorized public visibility; the repository is now public and Pages configuration succeeded with HTTPS enforced. The reviewed release is live at [pnelsonftp.github.io/BoatMarket](https://pnelsonftp.github.io/BoatMarket/); deployment and public desktop/mobile verification passed. The refreshed local website remains available at port 4310. Final commit/deployment/CI evidence is recorded in VALIDATION.md. The Market grouping-basis breakdown is the explicitly deferred part of the original P1 acceptance criteria; ad/group counts and an uncertainty explanation are implemented.

**CI handoff completed September 10:** commit `5b8c05c` passed all four jobs in [run 34261682769](https://github.com/PNelsonFTP/BoatMarket/actions/runs/34261682769) on September 8, including Windows/Ubuntu unit tests, 20 browser tests on each platform, builds and both AMD64 container inventories. [VALIDATION.md](VALIDATION.md) records the exact counts and completion time. This closes the interrupted CI record and does not replace the dated inventory scan evidence.

**September 10 refresh checkpoint:** run `cc9d1814-d2af-4aad-b0d6-d725724b6efa` completed at 20:48:10 UTC. All twelve inventory quality gates passed; two Huber detail access failures leave the outcome explicitly partial. The retained pool is **1,636 ads: 1,619 active and 17 sold**, with 1,557 observed during this run and 79 retained from earlier observations. Eight narrow classification corrections were applied from current captured evidence with a verified backup and record fingerprints. The reviewed partial snapshot is activated locally; production build, exact reviewed-release verification and desktop/mobile website checks passed. The final 20:51:56 UTC audit confirmed HTTP 200 health, the expected served snapshot hash and no unfinished ingestion or active job locks. At that local checkpoint the refresh had not been committed, pushed or publicly deployed; the earlier handoff documentation commit `8df1000` was already pushed before the scan finished. A subsequent public release review, `abc34fe3d34418647bf9a0ba1981fb7ea96f2963224e0cead02b10c08775f001`, covers the same 1,636-ad snapshot, committed and pushed as `e0970f6` and deployed successfully by Pages run `34547047357`. Public snapshot/build hashes and desktop/mobile filters were verified on September 10 at 7:36 PM CDT. See [LIVE_DATA.md](LIVE_DATA.md) and the separate September 10 section in [VALIDATION.md](VALIDATION.md).

**September 12 refresh checkpoint:** run `45193ea2-80fb-483c-a267-d1ded9697538` completed at 2026-09-12T12:40:58.254Z. All twelve inventory quality gates passed: 359 freshly fetched pages, 31 newly indexed ads, twelve price drops and no status changes. The 1,667-ad pool has 1,650 active / 17 sold; 1,548 were observed this run and 119 retain earlier dates. A single Huber’s Bennington detail HTTP 403 keeps the outcome partial. A separate verified-backup export preserved that status. Committed and pushed as `e6a83dd`, the exact reviewed snapshot is live through successful Pages run `34694488481`. Public desktop/mobile checks passed at 2026-09-12T12:46:36.964Z, including snapshot and build provenance. Local health returned HTTP 200; 52 samples and eight saved searches remain intact, with no unfinished ingestion runs or active locks. See LIVE_DATA.md and VALIDATION.md for evidence. Source, presets, dependencies and three SBOM artifacts are unchanged. The September 10 checkpoint above remains historical.

## Architecture

```text
Configured permitted sources
  → inventory discovery / pagination / cache / immutable source observations
  → normalization / field provenance / bounded rotating detail enrichment
  → per-source staged quality gate
  → lease-fenced repository / permanent vessel identity / price and event history
  → SQLite
      → authenticated local API → private connected workspace
      → event evaluation → per-channel alert ledger / retry backoff
      → verified backup → validated public snapshot generation
          → atomic mode pointer → static Next build
          → reviewed source/SBOM/build manifest → manual GitHub Pages deployment
```

GitHub Pages cannot run Node, a database or a worker. The API can also serve `out/` locally from port 4310. SQLite replaces the original prompt's PostgreSQL/PostGIS/Redis proposal for this single-user local deployment. Frontend and backend share the filter engine. No external account or hosted backend is needed for offline snapshots.

## Files and contracts

| Area | Main files / responsibilities |
|---|---|
| UI and state | `app/page.tsx`, `components/*`, `lib/client.ts`: deployment/mode/backend-scoped storage, revision-aware saves, imports, discovery/compare/shortlist/settings |
| Filtering and lake rules | `lib/search.ts`, `lib/types.ts`, `lib/catalog.ts`, `lib/lake-holiday.ts`, `lib/lake-verification.ts`, `lib/routing.ts` |
| Collectors | `server/collector.ts`, `server/adapters/*`, `config/sources.json`: robots-first permitted HTTP, same-origin discovery, explicit caps and coverage policies |
| Source maintenance | `server/evidence.ts`, `server/enrichment-state.ts`, `lib/source-quality.ts`, `server/source-tools.ts`: immutable evidence, rotation/backoff, quality, reviewed reparses |
| Identity | `server/dedup.ts`, `server/duplicates.ts`, `server/vessel-identity.ts`, `server/vessel-timeline.ts`, `server/image-evidence.ts`, `lib/image-identity.ts` |
| Locations | `server/locations.ts`, `server/geocoder.ts`, `server/provider-limiter.ts`, `server/boat-location-review.ts`, `server/routing.ts`, `server/configured-service.ts` |
| Persistence | `prisma/schema.prisma`, committed migrations, `server/repository.ts`, `server/db.ts`; SQLite lives in ignored `data/` |
| Worker/alerts | `server/worker.ts`, `server/lease.ts`, `server/alerts.ts`, `lib/alert-events.ts`, `server/job-control.ts`, `server/operations.ts`, `server/service-config.ts` |
| Backup/retention | `server/refresh.ts`, `server/backup-restore.ts`, `server/retention.ts`, `server/disk-space.ts`, `config/retention.json` |
| Publication | `scripts/export-snapshot.ts`, `server/publication.ts`, `server/release.ts`, `scripts/release.ts`, `.github/workflows/pages.yml` |
| Packaging | `Dockerfile`, `compose.yaml`, runtime packaging/probe/SBOM scripts, `.github/workflows/checks.yml` |

Canonical listings have stable source IDs, a permanent `vesselId`, and a nullable `groupId` for multi-ad display groups. Merges retain an anchored identity and aliases; undo can split membership. Private state continues to reference listing IDs, so group changes preserve per-ad notes/favorites. HINs are normalized only when supported by the modern structural format, including a separable or unseparated `US` country prefix; structural validity is not registry/ownership verification. Different valid HINs and reviewed different-vessel edges veto transitive merging.

The original 1,538-ad baseline had 1,533 reviewed/ungrouped display identities: five Butler Crestliner ads form one group and the Fenton Skeeter pair forms another; seven ads remain inspectable. Two Wauconda Alumacraft stock units have different HINs and stay separate. Every decision records captured evidence, timestamps and fingerprints. The September 8 checkpoint retained 1,593 ads and 1,587 research records. The September 10 checkpoint retains 1,636 ads and 1,630 research records; three multi-ad groups still contain nine ads, including the existing HIN-matched group. Consult the latest validation record for filter-specific counts.

## Data quality and provenance

`firstSeenAt` means first seen by BoatScout. Cached HTML retains its actual observation time and does not become a fresh seller check. Price and status obey observation-time precedence; failed/deferred detail requests retain known detail facts and show their age. Field history captures dimensions, power, engine hours and equipment sources. The rotating policy intentionally defers details within a fixed budget; actual request/parser failures and inventory caps remain partial outcomes.

Quality thresholds compare staged source inventory/field coverage with existing source records before applying that source. Empty or failed captures never mark all prior inventory removed. A reviewed reparse stores input/parser/config hashes, per-record database fingerprints and a verified backup. It rejects old captures that would replace newer observations and does not delete records missing from one captured page. A partial application preserves an apply manifest and requires a fresh preview.

Raw HTML, credentials, private notes, manual location evidence and routing origins do not belong in public snapshots. Immutable capture objects and observations live under `data/evidence`; ordinary per-URL cache remains a reuse mechanism. Redaction of exported fixtures is heuristic and requires review before sharing. Source URLs/photos/descriptions remain third-party content; collection access does not grant redistribution rights.

The September 10 parser correction prevents `Tiger`/`TIGER` from inferring the boat make `Tige`, while preserving genuine compact names such as `Tige21`. Explicit personal-watercraft/jet-ski/WaveRunner labels take precedence over generic ski terms; ordinary jet boats are not automatically PWC. Four dedicated regression tests are included in the 34 passing focused tests across five files, and typecheck passed. The eight applied record repairs preserve ad identity and observation times; they are not new seller observations. Broader make inference remains imperfect: a 2027 Vexus ADX200 title mentioning a Yamaha engine still infers Yamaha as the boat make. Ambiguous accessory/PWC cases remain for review. The September 8 CI/images predate this correction.

## Location and lake policy

Actual boat overrides have separate current/revision/event records and preserve the changing original source point. Refresh cannot erase a saved override. Reverting restores the latest source coordinates; city-wide approximate corrections remain a different workflow. Public export restores source coordinates and omits the private override, original-source wrapper, route estimate and review evidence.

Geocoding shares provider-wide database spacing/backoff across interactive and batch callers. Cached city/state/ZIP queries and ambiguous candidate evidence are retained. The public Nominatim service is disabled unless `GEOCODER_PUBLIC_POLICY_ACCEPTED=true` is an informed owner choice; recurring batches comply with its four-per-minute policy. No confidential address or autocomplete service is implemented. A configured alternative can use an explicitly allowed private service origin.

Routing uses an explicitly configured OSRM-compatible endpoint and chosen origin/destination. Results have provider/date/expiry and remain unknown on failure. The optional four-hour filter excludes unknown routes by default. Routes are estimates without live traffic, stops or trailer restrictions; straight-line radii remain separate.

The official publicly linked **December 2, 2025** Lake Holiday rulebook was reviewed on September 8, 2026. Section 4.15 permits hulled boats **up to and including 21.0 ft** by manufacturer US specifications, including molded platforms; bolt-on platforms are accessories. Pontoons have a separate 28-ft limit; power may not exceed the capacity plate. Wake-enhancer use and wakesurfing remain prohibited. See `LAKE_RULE_DOCUMENT` for exact PDF URL/hash/sections. The factory-profile reconciliation changes untouched old rules, preserves customized rules/search settings, and is idempotent. Only explicit association confirmation may set that stronger verification status. Neither this document nor the app grants registration approval.

## Operations and recovery

Collector, pipeline, alerts and worker leases have distinct identities. Long jobs renew and fence writes; cooperative cancellation aborts network work. The worker heartbeat is selected by the database owner, preventing a second daemon from overwriting the authoritative report. Service templates are project-specific and do not kill unrelated Node processes. No persistent service was installed as part of this goal.

Saved-search event types include new match, price drop/change, status change and no longer matching. A sold ad leaving an active-only filter still produces the selected status event. First evaluation establishes a baseline, and changed search criteria reset it. Channels persist success separately; retries do not resend confirmed successful channels. Remote delivery remains at least once, with stable email/webhook identity. A timeout after remote acceptance can still repeat on a non-deduplicating receiver. Never enable destinations or send test messages without authorization.

Full refresh backs up before collection and preserves the current snapshot on partial/failed/busy/cancelled results unless partial export is explicit. Reports distinguish collection, alert outcome and publication activation. Recovery requires exclusive leases and preserves the original interrupted report; a committed snapshot pointer remains committed even if the process died before its final report.

Retention is dry-run by default. Applying requires the exact reviewed plan/hash, fresh reference/path checks and leases. It protects current evidence, publication generations/markers, recent verified backups, open logs and audit history. Optional old intermediate price pruning preserves first/latest points and makes a fresh backup. Protected content may exceed the configured advisory budget. Verified restore only writes into a new directory; live replacement is a separate operator action after stopping writers.

## Deployment and resuming work

Use Node 22.12+, the committed lockfile and `npm run setup` for a fresh clone. `npm run dev` starts the local development processes. Port 3000 can be occupied by another application; check the actual Next output and preserve unrelated processes. Browser tests use isolated port 3002 by default and refuse unrelated server reuse. `npm run build && npm start` serves the built website and API together at 4310; the worker is a separate command/service.

Compose's shared database supports collection and connected reloads. Container snapshot export/automatic snapshot refresh remains unsupported: the built website is in `out/`, with no shared writable `public/` publication directory. Keep `WORKER_AUTO_EXPORT=false`; rebuild from a host checkout for updated static snapshot bytes. Docker now copies built website assets as the non-root runtime owner so a mode-0600 activation pointer remains readable. The focused ownership probe is separate from the earlier captured-image SBOMs.

The repository is public at [PNelsonFTP/BoatMarket](https://github.com/PNelsonFTP/BoatMarket); first-party `UNLICENSED` metadata and npm `private: true` remain unchanged. Main pushes run validation, not automatic Pages publication. Pages requires an approved exact-hash release, `BOATSCOUT_ENABLE_PAGES=true`, GitHub Pages configured for Actions, and a manual workflow dispatch with that review hash. The build verifies source, snapshot, SBOM and output correspondence. Future snapshot updates require local collection/export, review, matching commit and manual deployment; the backend and worker remain local. A local rollback must be reviewed/built/deployed to become a public rollback. HTTPS-to-local-HTTP browser restrictions still apply; static mode or the local same-origin website is often simplest.

Before continuing: inspect `git status`, the current worker/lease status, latest source and refresh reports, the publication pointer, and [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md). Back up before database changes. Never reset/reseed a live database to repair a collector. Do not stop the classic-car project's processes or treat its paths as BoatScout data. Public source restrictions, external destinations/providers, scheduler installation, publication visibility and first-party licensing remain explicit owner decisions.
