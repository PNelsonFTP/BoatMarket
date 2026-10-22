# BoatScout improvement review — October 21, 2026

The highest-value next work is to **restore full-inventory import/export compatibility, correct hull-make inference, and make multi-pass refreshes reproducible**. These changes improve the data you use to choose a boat and reduce the manual work needed to renew the website.

This review follows the owner-approved cleanup. Commit **`e3ec52e16d06cf1d2fad6683ee847f743689c316`** committed and pushed the nine audit/cleanup documentation files to `main`. The 271 removed files were ignored build/cache/metadata files; private audit evidence remains local. No additional cleanup, inventory refresh, product changes, scheduler installation or Pages deployment accompanied this review. The recommendations below are proposals.

## Evidence and current health

The second pass revisited application modules, source adapters, refresh/reporting/worker logic, data normalization, browser imports and storage, duplicate/market views, database schema/migrations, configuration, npm/launcher commands, Docker, CI/Pages workflows, tests and the remaining roadmap. The October 20 full hidden/ignored filesystem inventory and approved removal evidence remain in [CLEANUP_REVIEW.md](CLEANUP_REVIEW.md). This pass checked the current source and actual published-data file rather than treating every old roadmap item as still missing.

- Fresh local `npm run typecheck`: **passed**.
- Fresh local `npm test`: **36 files passed; 218 tests passed, 1 skipped**. No production build or full local browser run was repeated; the cleaned build caches remain absent.
- Post-review checks: existing exact reviewed-release verification and SQLite `quick_check` passed; logical database contents and protected snapshot/config/lock/SBOM hashes are unchanged.
- Current snapshot: **2,429 real ads**, last collected October 19. Source access was **not re-probed** during this review; October 19 HTTP failures remain dated observations.
- Snapshot file: **18,602,774 bytes** with formatting; **13,419,396 bytes** with compact `JSON.stringify`. Both exceed the browser's **12,582,912-byte** file limit. A direct normalization reproduction also confirms an explicit `make: Vexus` is replaced with `Yamaha` when Yamaha appears in the title.
- The October 19 [validation run 39257813829](https://github.com/PNelsonFTP/BoatMarket/actions/runs/39257813829) failed the full-export connected-import E2E test on desktop/mobile on both Windows and Ubuntu. Its two container jobs passed. The separate Pages deployment passed; deployment success does not establish a green full validation matrix.
- **Current cleanup-commit CI checkpoint:** [run 39702836613](https://github.com/PNelsonFTP/BoatMarket/actions/runs/39702836613) has both container jobs successful. Its completed Ubuntu browser job reports **18 passed / 2 failed**, both failures in the same full-export import test at `transfers.spec.ts:225`; Windows is still running at this checkpoint. The completed Ubuntu job log was retrieved directly while the overall run remained in progress. Windows completion was not awaited; the linked run records its eventual result. The cleanup commit changes documentation only, so application and snapshot bytes are the same as the previously failing revision.

Read-only measurements, reproduction results, test logs and retrieved CI evidence are retained privately under `data/improvement-review-2026-10-21/`. This is not a fresh vulnerability assessment, marketplace completeness guarantee or verification of seller availability. Effort estimates below are relative change sizes: **S** = bounded change, **M** = several connected modules/tests, **L** = coordinated design across storage/UI/runtime. External permissions and service selection are separate dependencies.

## Prioritized recommendations

| # | Priority | Suggested improvement | Expected benefit | Effort / main dependency |
| ---: | --- | --- | --- | --- |
| 1 | P1 | Make full-size inventory exports importable | Restores a broken data-transfer path and addresses failing CI | M; coordinate file and request limits |
| 2 | P1 | Separate hull make from engine brand during normalization | Prevents good fishing boats being classified under the wrong brand | S–M; captured evidence and regression fixtures |
| 3 | P1 | Give inventory acceptance its own baseline and legitimate-empty outcome | Reduces false quality failures while keeping drift detection | M; source outcome schema/report compatibility |
| 4 | P1 | Add one reproducible refresh session spanning recovery passes | Replaces dated manual helpers with a reviewable operator workflow | L; depends on #3 for precise outcomes |
| 5 | P1 | Validate the actual built Pages site with data-independent browser checks | Catches deployment/path/data regressions that unit tests miss | M; repair #1 first |
| 6 | P1 | Complete grouping-basis counts in Market | Makes ad counts, reviewed groups and HIN groups easier to trust | M; public grouping metadata |
| 7 | P2 | Show bounded live scan progress | Explains long scans and makes stalls visible | M; collector progress checkpoints |
| 8 | P2 | Add an owner preference profile for fishing and towing | Aligns discovery with 150+ hp, the budget and the 60/40 use case | M; versioned opt-in presets |
| 9 | P2 | Manage permitted coverage gaps as a measurable backlog | Finds additional useful local ads without evading blocked sites | M plus dealer/feed permission |
| 10 | P2 | Reduce initial snapshot payload and benchmark browser work | Improves mobile startup and gives nationwide expansion a measured path | L; publication/client schema versioning |
| 11 | P2 | Add a safe lifecycle for historical artifacts and rotated logs | Controls storage growth without losing recovery evidence | M; archive manifest and retirement rules |
| 12 | P2 | Exercise real backup recovery and support a chosen external copy | Proves recovery beyond checking backup hashes | M; owner-selected archive destination |
| 13 | P2 | Persist a private buying and inspection workflow | Turns a shortlist into an organized purchase process | L; private model/migration and export rules |
| 14 | P2 | Finish container publication-directory support | Allows refreshed standalone snapshots in Docker | L; shared writable publication contract |
| 15 | P2 | Establish dependency/advisory maintenance with reproducible setup | Keeps dated SBOM evidence useful as dependencies evolve | M; reviewed update and release workflow |

## 1. Make full-size inventory exports importable

**Confirmed current defect.** [WorkspaceTransfer](components/workspace-transfer.tsx#L100) rejects any selected file larger than `IMPORT_MAX_BYTES` before it parses or chunks records. [The import module](lib/import-listings.ts#L3) reuses the 12 MiB request limit as that file limit. [The full-export browser test](tests/e2e/transfers.spec.ts#L124) loads the real snapshot and expects a validated import preview. Its current compact file is 13,419,396 bytes, above 12 MiB; the normally formatted file is larger still. [Downloads](lib/client.ts#L391) use formatted JSON. Request chunking therefore cannot rescue these files: the UI rejects them first.

Separate the bounded **input-file limit** from the **per-request byte/row limits**. Choose a supported file envelope based on measured memory use, or supply a reviewed multi-file/streaming format for larger inventories. Keep the existing maximum of 1,000 records and 12 MiB per API chunk; retain accepted/failed/uncertain record outcomes. Do not fix this by raising the API body limit or weakening the test assertion. A later phase can persist the existing import manifest so reloads can reconcile and resume an interrupted transfer.

**Acceptance:** the current formatted snapshot and a file larger than 12 MiB reach preview and import successfully; every request stays within both existing chunk limits; imports preserve notes/favorites/source identity; oversized single records and unsupported input sizes produce clear errors. The full-import desktop/mobile tests pass on Windows and Ubuntu. Keep one generated oversized fixture as well as the real-snapshot compatibility check, so this boundary cannot regress silently as inventory grows.

## 2. Separate hull make from engine brand

**Confirmed current defect.** [normalizeListing](server/adapters/normalize.ts#L72) searches title brands in descending name length before falling back to structured `raw.make`. As a result, `2027 Vexus ADX 200 w/ 250hp Yamaha SHO!!` becomes `make: Yamaha` even when `raw.make` explicitly says `Vexus`. The current snapshot contains **four ads** with Vexus titles and Yamaha hull-make values; these are advertisements, not a count of four distinct boats.

Prefer credible structured hull-make evidence, then source-specific hull-title evidence, with engine manufacturer parsed separately. Record conflicts and uncertainty instead of choosing the longest brand substring. Reuse the [field-provenance model](lib/provenance.ts) and preserve the previously fixed Tiger/Tige and PWC cases. Repair existing rows only through captured-evidence preview, identity/fingerprint checks and a verified backup.

**Acceptance:** Vexus + Yamaha, Lund + Mercury, compact Tige model names, genuine Yamaha hulls and ambiguous titles have explicit fixtures. A motor brand cannot override a supported hull make. Evidence-backed corrections preserve ad IDs, notes, prices, history and original observation times; the change is not presented as a fresh seller observation.

## 3. Separate inventory acceptance from detail completeness

**Observed implementation limit.** [The collector](server/collector.ts#L718) advances its count baseline using only completed `IngestRun` rows whose overall status is `success`. [The same run status](server/collector.ts#L787) becomes `error` for unrelated detail failures or deferred complete-policy details. An accepted inventory can therefore fail to become the next count baseline. The October 19 correction removed the historical-archive count problem, but this coupling remains.

Store a successful **inventory observation** independently of detail/alert completion, with source/config identity, accepted count, capture time and quality result. A failed or incomplete inventory must not advance it. Keep retained-history field regression checks and make baseline provenance visible. In the same source-outcome work, add narrowly verified empty Craigslist fixtures: [verifiedEmptyRegionalPage](server/adapters/pagination.ts#L97) currently handles Huber/Bass Boat Central cases, while [the collector](server/collector.ts#L549) conservatively rejects other empty parses.

**Acceptance:** an accepted 722-ad inventory with one failed detail can anchor the next count comparison; rejected, capped or challenged inventory cannot. A genuinely empty supported regional result is distinct from a challenge, selector failure and empty HTTP body. Retain drop thresholds, originals and warning dates. Backfill baseline records only from verifiable historical reports, not guessed counts.

## 4. Make a multi-pass refresh one reproducible session

**Observed operator burden.** [The refresh pipeline](server/refresh.ts#L387) processes one collection outcome and records a protected export. Later recovery passes and privacy/contact comparisons have been assembled with helpers under dated `data/refresh-*` folders. Existing detail rotation/backoff already works; the missing layer is a durable session connecting discovery, permitted recovery, review and the final snapshot.

Create a session manifest with component run IDs, per-source inventory outcome, distinct fresh/cache observations, remaining detail work, typed failure reasons and final coverage. Offer bounded continuation for eligible work and transient network failures. Keep HTTP 403/robots restrictions and HTTP 429 policy outcomes explicit. A final operator preview should explain exactly what is still partial before publication review.

**Acceptance:** one command or Settings workflow can start, inspect and continue a session after interruption without double-counting ads/pages or refreshing cached observation dates. All original reports survive. Denied sources stay partial, cancellation remains cooperative, and an unsuccessful session preserves the last reviewed website. Tests cover DNS recovery, detail-budget continuation, repeated source IDs, cancellation and failure during activation.

## 5. Validate the built Pages artifact

**Verified coverage gap.** [The main workflow](.github/workflows/checks.yml#L32) runs development-server E2E before building; the Pages workflow verifies exact release/build correspondence. These are valuable checks but do not replace browser execution against the final base-path build. [The manual Pages verifier](scripts/verify-pages.mjs#L33) searches for `Falcon`, so a valid future inventory without Falcon ads can fail it. [The older browser verifier](scripts/verify-browser.mjs) assumes port 3000.

Add a data-independent browser smoke suite for a built root-path site and the `/BoatMarket/` site. Derive a search assertion from the fixture/snapshot rather than a particular make; explicitly test a no-results case. Parameterize URL/output paths and consolidate manual checks only when equivalent assertions are preserved. Upload traces and per-test summaries on failure.

**Acceptance:** CI covers production assets, data-mode pointer/hash, actual snapshot loading, base-path navigation, search/filters, images, mobile layout and absence of runtime/missing-local-asset errors. The suite passes with zero Falcon ads. Distinguish deterministic fixture tests from a separate real-snapshot compatibility check, and require both where appropriate. Keep privacy/source/SBOM verification and manual Pages approval intact.

## 6. Complete Market's grouping-basis breakdown

**Explicit deferred requirement.** [Market](components/market.tsx#L221) says it cannot separate reviewed groups from HIN-only matches. [Duplicate review](server/duplicates.ts#L393) already calculates overall reviewed/HIN group counts, so the project has useful underlying evidence. Those overall counts cannot simply be copied into a filtered Market view.

Expose bounded grouping-basis metadata for each displayed vessel, including reviewed evidence, valid-HIN grouping, unresolved single-ad records and relevant conflicts. Compute counts over the actual filtered result and keep associated ads outside the filter separately labeled. Preserve merge/split history and HIN conflict vetoes.

**Acceptance:** Market subtotals reconcile to its filtered research-record total, and ad counts reconcile separately. A single-ad record is never called a verified unique boat. Changing a filter, undoing a decision or splitting a group updates the breakdown consistently in connected and published-snapshot modes. Extend [market-count tests](tests/e2e/market-counts.spec.ts) with reviewed/HIN/conflicting cases.

## 7. Show bounded live progress during collection

**Observed usability gap.** [OperationStatus](components/operation-status.tsx) polls every 15 seconds and shows stage/lease state; [source-health UI](components/source-health.tsx) shows detailed finalized metrics. [Collector metrics](server/collector.ts#L471) change inside long page/detail loops, while persisted ingestion outcomes finalize near source completion. A live lease proves ownership, not useful progress.

Persist throttled progress with current source, phase, completed/discovered inventory pages, attempted/eligible details, elapsed time, intentional backoff and last successful checkpoint. Show cancellation-pending and a possible-stall explanation. Use source crawl-delay information for context rather than promising an exact ETA. Polling is sufficient initially; streaming is optional.

**Acceptance:** a slow fixture advances the UI while its source is still running; checkpoints do not overwhelm SQLite/filesystem writes; stalled progress is distinguishable from a source-mandated wait. Cancellation, lease loss and restart leave an intelligible final report. No cross-host concurrency increase is required for this improvement.

## 8. Add an owner preference profile matching the actual purchase

**Observed fit gap.** [Factory presets](lib/lake-holiday.ts#L67) start at 200 hp; the fishing preset also requires a reported 200+ hp and has no asking-price criterion. The owner's later brief allows **150+ hp**, favors **$50,000 or less** with a ceiling of **$85,000**, needs two fishing seats/up to four for towing, and weights use about **60% fishing / 40% tubing or skiing**. Current presets can hide relevant 150–199 hp options.

Offer a versioned, editable owner profile with explicit hard filters and softer preferences. Provide separate fishing/outboard and premium-ski profiles so a universal 250 hp ceiling does not accidentally exclude an otherwise wanted inboard. Add an optional explained ranking based on fishing suitability, tow setup, nearby location/known road time, asking price, evidence quality and reported capacity. Keep unknown values visible for review. Existing filters and saved searches should continue to work.

**Acceptance:** 150–199 hp boats can appear when selected; budget target and ceiling are visible; every score explains its inputs and missing facts. Customized searches are never overwritten by a factory update. Use the current editable Lake Holiday screening profile and retain measurement/registration uncertainty. Asking-price filters do not claim to calculate taxes, fees or lake approval. Do not fabricate driving time when no route is known.

## 9. Turn source coverage gaps into a permitted acquisition plan

**Observed external constraint.** [SOURCE_COVERAGE](SOURCE_COVERAGE.md), [the access ledger](config/source-access.json) and the remaining roadmap document restricted/deferred sources. October 19 Huber/Gordy captures failed; their 66 retained ads were stale then. No new probe was made for this review. More retries alone will not make inventory exhaustive.

Maintain a small coverage backlog per region/dealer/source: last permitted result, access type, authorized feed/export option, manual import process, expected incremental local ads and freshness. Prioritize sources likely to add relevant boats near Lake Holiday, and measure incremental **ads plus reviewed identities** after integration. Reuse source health and fixture/reparse tools rather than adding a second status system. Dealer permission/feed procurement is external work, not a guaranteed code fix.

**Acceptance:** every enabled source has dated collection scope and limitations; new integrations arrive with permitted representative captures, pagination/field tests and a rollback/disable path. Manual imports retain original source/observation dates. Fresh coverage increases are reported with duplicate uncertainty; blocked sources do not become “fresh” because a cached or manually assembled file was reprocessed.

## 10. Reduce the initial public payload and measure browser work

**Measured growth.** The current formatted snapshot is **18.6 million bytes**, and [the client](lib/client.ts#L143) fetches its text, hashes it, parses it and validates the complete listing array during startup. Provenance is one of its largest field families. Filtering already uses memoization and results already have a “load more” limit in [app/page.tsx](app/page.tsx#L215), so merely adding those features would repeat existing work.

Benchmark cold startup, parse/validation, memory and filter response first. Design a compact versioned search catalog containing every field needed by the shared filter/grouping logic, then load detailed provenance/history on demand. Preserve immutable hashes and an offline-compatible fallback. Add a tested manifest for optional detail/history partitions instead of a silent schema change. A local gzip estimate was about 1.2 MB; that is a compression experiment, **not measured production transfer size or parse cost**.

**Acceptance:** publish before/after measurements on the same mobile/desktop profiles; search/filter/group results remain equivalent to the complete canonical dataset; missing partitions fail visibly and do not create misleading unknown matches. CI enforces agreed payload/performance budgets and tests current and larger synthetic inventories. GitHub currently limits published Pages sites to 1 GB, so storage growth also needs #11; this review does not claim the current site exceeds that limit. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## 11. Give historical artifacts and logs a safe lifecycle

**Measured storage gap.** Thirteen `public/snapshots` generations total **162,200,414 bytes** and are copied into the export. Dated baselines, CI downloads and review bundles add intentional copies. [Retention](server/retention.ts#L53) scans fixed roots; historical review folders and nested backups can sit outside normal eligibility. [The logger](server/logger.ts#L18) writes to one `boatscout.log`, while [retention](server/retention.ts#L338) protects nonrotated logs. Old evidence therefore has a purpose even when its bytes repeat, and the active log has no built-in rotation here.

Define an archive package with a manifest, hashes, references, originating revision/run and a tested restore recipe. Migrate old baseline helpers toward stable content-addressed references. Add bounded log rotation compatible with retention and concurrent app/worker writers. Separately define public-generation retirement while preserving active/previous generations, direct-link policy and rollback records. Generate previews before any archival deletion.

**Acceptance:** archive/restore reproduces an older audit; a referenced generation cannot be silently removed; backup manifest members remain intact. Logging survives rotation without corruption or detached writers, and only expired rotations become eligible. The medium/low cleanup candidates remain pending separate approval; this report authorizes no further deletion.

## 12. Exercise a real recovery drill and choose an external backup copy

**Enhancement beyond existing safeguards.** Consistent SQLite backup, manifests, integrity validation and restore-to-new-directory already exist and have [integration tests](tests/refresh-backup.test.ts). The next value is an operator-facing recovery exercise against an actual retained backup, plus a deliberately chosen copy that survives loss of this checkout/machine.

Provide a drill command that restores to a new isolated directory, checks schema/data/publication consistency, starts a loopback-only temporary API on an unused port with fresh test credentials, and reads a shortlist/search without collection or outbound delivery. Report recovery age and the operator steps needed for real cutover. Support a user-selected encrypted external copy and verification; `.env` secrets remain separately managed because ordinary backups deliberately exclude them.

**Acceptance:** an interrupted/corrupted/old-schema backup fails clearly, the live database is unchanged, and every temporary process started by the drill is stopped by the drill. A chosen external copy verifies and can restore without relying on another file in the same project directory. No remote destination, schedule or alert channel is enabled by a recommendation alone.

## 13. Persist a private buying and inspection workflow

**Product opportunity.** [Comparison packets](lib/comparison-export.ts#L129) provide intentionally blank seller/inspection worksheets. Notes/favorites exist, but [the schema](prisma/schema.prisma) has no structured inspection/appointment/purchase tracker. For the owner's fishing/towing mix, a listing becomes useful only after capacity, condition, tow equipment, location and availability are confirmed.

Add private per-vessel stages such as researching, contacted, availability confirmed, inspection scheduled, inspected and passed/declined. Store dated seller confirmations, measured hull/platform length, capacity-plate/motor evidence, tow-pylon compatibility, service history and cost notes with provenance. Keep private attachments and appointments out of public snapshot exports. Preserve ad-level notes and reversible vessel identity behavior.

**Acceptance:** information survives refresh, merge and split/undo without attaching to the wrong vessel; confirmations have dates and sources; private fields never enter published snapshots or public comparison exports by default. Offline users can export/restore their own tracker state. No inspection result or lake approval is inferred from an advertisement.

## 14. Finish writable container publication support

**Explicit deferred requirement.** [Docker](Dockerfile#L29) copies the built site into `out/`; [Compose](compose.yaml) shares data/config/log volumes but no writable publication directory. The existing host publication/backup/rollback model cannot be enabled inside Docker merely by switching on worker auto-export.

Define one shared publication directory with atomic immutable-generation activation, safe static routes, correct non-root ownership and the same release/backup/privacy gates used on the host. Separate application assets from changing data. Make app/worker configuration agree on that directory and keep automatic export opt-in.

**Acceptance:** both default and rendered images can collect and stage an allowed partial/successful snapshot for the intended standalone view; restart and concurrent-worker tests preserve activation consistency. A failed write leaves the prior site usable. Backup/restore includes the active generation and marker. No host-only path is assumed. If Docker is not the intended operating mode, schedule this after the core host workflow fixes.

## 15. Establish reviewed dependency and advisory maintenance

**Observed maintenance gap.** The retained SBOM/advisory reports are dated September 8. [CI](.github/workflows/checks.yml#L23) installs without audit and runs SBOM generation, but not `sbom:audit`; no Dependabot configuration is present. `@radix-ui/react-tooltip` has no detected application import, as documented in the cleanup review. These observations do not establish a current vulnerability.

Propose a weekly reviewed dependency-update queue and dated advisory job, covering npm and pinned container/workflow inputs with appropriate tools. GitHub's documented Dependabot configuration supports scheduled update checks; use its supported configuration rather than an ad hoc scheduler. Remove unused direct dependencies through the package manager with graph/SBOM validation. Change both launchers to a reviewed `npm ci`-based fresh-install path and open the actual chosen dev port. Record supported Node/tool versions and keep global/machine state out of assumptions. [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

**Acceptance:** advisory records show when and what was checked; dependency PRs produce valid lock/SBOM evidence and relevant tests; container inventories are regenerated for changed image inputs. Resolve the distinction between ordinary development CI and exact publication approval so update proposals can be tested without fabricating a release approval. A published change still needs a new reviewed source/SBOM/snapshot correspondence. Enabling scheduled jobs/update PRs requires an implementation request; no schedule is installed by this report.

## Suggested delivery order

1. **Correct the current failures:** #1 import compatibility, #2 make inference, and #5 reliable browser validation. Add narrow regression tests and review any data repairs separately.
2. **Make refreshes routine:** #3 inventory outcomes, #4 refresh sessions, and #7 progress. Then use #9's permitted coverage plan to add measurable inventory rather than increasing blind crawl volume.
3. **Improve the buying decision:** #6 grouping clarity, #8 owner profile, and #13 buying/inspection records.
4. **Keep operation sustainable:** #10 payload measurement, #11 archive/log lifecycle, #12 recovery drills, and #15 maintenance. Place #14 earlier only if Docker is the selected operating mode.

Use separate reviewable changes and preserve the existing no-bypass network policy, original observation dates, unknown-value semantics, reversible identity decisions, backup integrity and exact reviewed Pages deployment. No broad framework/database migration is required to address the first delivery group. The existing [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md) remains the longer-term roadmap; this report supplies a prioritized October 21 implementation queue with verified evidence and acceptance checks.
