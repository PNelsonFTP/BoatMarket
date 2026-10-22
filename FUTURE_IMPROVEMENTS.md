# Future improvements and remaining limitations

Re-audited September 8, 2026 when the owner requested winding down the P1/P2 goal for local review; September 10 classification findings and September 24–29 access/recovery findings are added with their own dates. Delivered work and partial criteria from the previous roadmap are mapped in [P1_P2_IMPLEMENTATION.md](P1_P2_IMPLEMENTATION.md). Verification results are in [VALIDATION.md](VALIDATION.md); exact source access observations are in [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [config/source-access.json](config/source-access.json).

## October 21 implementation follow-through

The owner requested and this pass implements **#1–7, #10 and #11** from [IMPROVEMENT_REVIEW_2026-10-21.md](IMPROVEMENT_REVIEW_2026-10-21.md). See [IMPLEMENTATION_2026-10-21.md](IMPLEMENTATION_2026-10-21.md) for the delivered behavior and dated validation. The import-size and Vexus/Yamaha defects below are historical reproductions, now fixed. Market grouping-basis counts and bounded live progress are delivered. Archive/restore/retire tooling and concurrent log rotation are implemented; historical cleanup candidates remain pending separate retirement approval.

The remaining priority queue is **#8 owner preference profile; #9 permitted coverage backlog; #12 recovery drill/external copy; #13 private inspection workflow; #14 writable container publication; #15 dependency maintenance**. The October 21 read-only audit now reports **13 full-scope advisories (4 critical) and 7 production-scope advisories (0 critical)**; dependency versions were not changed in this scope. Review the dated reports in [SBOM.md](SBOM.md) before a separate tested dependency update. No advisory finding is a claim of application exploitability.

Follow-ups revealed by implementation: persist browser import manifests for resumable transfer; partition/search off the main thread before growth exceeds the 8 MiB catalog budget; retain and migrate old helper references before retiring historical artifacts; expand permitted empty-page fixtures as source markup changes; upload only newly generated runtime image evidence in CI rather than rebundling historical SBOM files; review duplicate suggestions and source permissions continually. A 10,000-record expansion of today’s rich listings exceeds the catalog budget and is refused, rather than silently publishing a slow or incomplete catalog.

## October 21 prioritized engineering review (historical findings)

[IMPROVEMENT_REVIEW_2026-10-21.md](IMPROVEMENT_REVIEW_2026-10-21.md) provides 15 prioritized proposals with code evidence, effort, dependencies and acceptance checks. The first fixes should address full-inventory import compatibility, hull-make inference and production browser validation, followed by independent inventory outcomes, reproducible refresh sessions and grouping-basis counts. These are recommendations, not shipped changes.

Two defects were reproduced without changing inventory: the current snapshot exceeds the browser’s 12 MiB file limit before request chunking, and an explicit Vexus make becomes Yamaha when the engine brand appears in its title. The current snapshot has four affected Vexus advertisements. The October 19 full CI run failed the full-export import E2E test on both platforms; the October 21 cleanup-documentation push also reproduces that failure in its completed Ubuntu job. The separate Pages deployment was successful. Current CI evidence and fresh local 218-test/typecheck results are recorded in the report and VALIDATION.md.

The longer-term constraints below remain useful; use the dated review to distinguish confirmed failures, unfinished criteria and new product opportunities. No additional deletion, source access or feature implementation accompanies the report.

## P1/P2 work delivered

- **Identity:** reviewed known reposts, conflicting-HIN stock protection, permanent vessel identities, reversible aliases and membership, source/price/review timelines, active/nearby/changed review filters, original-image identity and bounded optional perceptual evidence.
- **Location and provenance:** reversible actual-boat corrections, persistent original source points, field observation history, configured and dated road routes, four-hour filtering, shared geocoder throttling/cache/backoff and ambiguous ZIP/locality review.
- **Lake policy:** the latest publicly linked official rulebook was found and reviewed. Its December 2, 2025 edition permits hulled boats up to **21.0 ft inclusive**, including molded platforms. Reviewed factory-profile reconciliation preserves customized settings. Association confirmation remains separate.
- **Operations:** singleton worker supervision, service templates/installers, cooperative cancellation, expired-job recovery with snapshot evidence, explicit alert events and retry diagnostics, fenced delivery leases and retained channel outcomes.
- **Collection and maintenance:** bounded rotating detail checkpoints, intentional summary-only policy, immutable captured evidence, redacted fixtures, parse/diff preview, source quality gates and reviewed reparse.
- **Storage and releases:** free-space checks, reviewed retention, protected backups/current evidence, verified restore into a new directory, atomic snapshot activation and rollback, privacy/quality/size/source/SBOM publication gates, pinned build dependencies and runtime inventory, Windows/Ubuntu CI.

This does not make the inventory exhaustive. Each row is an advertisement until identity evidence links it to another; absence from a scrape is not a sale confirmation.

**September 24 operational follow-up:** a temporary DNS interruption affected four sources. One targeted recovery pass completed all four after resolution recovered and normal detail backoff elapsed. A future operator workflow could assemble an explicit multi-pass refresh report and offer bounded retries for transient network failures, while retaining every original report and never retrying access denials as though they were network errors. This refresh documented that recovery manually; no collector behavior changed.

**October 19 empty-region recheck (first recorded September 29):** fresh Craigslist captures contain two Decatur ads and four Champaign–Urbana ads, and both regions parsed successfully with no warning today. The collector still conservatively flags genuinely empty search pages, as seen on October 9 and earlier. Add narrowly verified support for legitimate empty Craigslist search pages while keeping denial, challenge and unexpected markup responses reviewable. Historical warnings retain their original dates; no parser behavior changed.

**October 19 inventory-baseline correction:** automatic collection formerly compared each fresh source inventory with every historical ad retained for that source. Craigslist's 722-ad scan was wrongly quarantined against the 1,465-ad archive despite the last successful scan having 727 ads. The collector now uses the most recent completed successful ingestion count for the drop check, records that baseline in its private quality report and keeps the existing threshold. Failed/running ingestions cannot reset the baseline; all historical rows remain available for field-regression checks and change reporting. Four regression tests and the full 218-test suite passed. The original failure is retained; cached reprocessing applied the accepted inventory. Manual parser previews retain their conservative archive comparison.

**October 19 detail-budget follow-up:** the initial OnlyInboards pass deferred two of 152 eligible details under its temporary 150-detail budget. The cached recovery completed both. A reusable operator workflow could assemble reviewed multi-pass coverage and totals without manual helper scripts; deliberate rotation, failures and denied access must remain distinct. A future refinement could record a successful inventory baseline separately from detail-warning status, since the current conservative baseline advances only on an error-free source run. Permanent source configuration is unchanged.

## External access and owner decisions still open

| Remaining issue | Current handling | What would resolve it |
|---|---|---|
| Boat Trader and several nearby dealers reject robots/page requests | Dated restrictions remain visible; collectors stop at denials | Dealer permission, supported API/feed/export, or reviewed manual import. Do not bypass blocks |
| Huber’s Marine inventory access is currently blocked | October 22: the inventory endpoint again returned HTTP 403 and failed its quality gate; all 31 retained ads remain beyond the existing 14-day threshold and are stale. September 24 retained 29 active and two stale. Earlier detail failures remain historical | Permitted dealer feed or reviewed manual evidence; do not bypass restrictions or relabel older observations as fresh |
| Gordy’s Marine inventory access blocked since October 9 | October 22: inventory endpoint again returned HTTP 403 and failed its quality gate; all 35 retained ads now meet the existing 14-day stale threshold and keep their original observation dates. No denied-access retry was attempted | Permitted dealer feed or reviewed manual evidence; preserve the gap and dates until permitted access returns |
| MarineSource throttles requests | Stops on HTTP 429; no retries that evade the throttle | Supported feed or later permitted access under its rate policy |
| SkipperBud’s inventory data is not yet accessible through the permitted path | Public HTML and restricted inventory response distinguished in ledger | Documented permitted inventory endpoint/feed, representative capture and quality review |
| Facebook, eBay Motors, iboats, YachtWorld/CPO generic integrations | Manual imports or disabled configuration; no claim of live completeness | Authorized API/export with active status, auction/asking-price semantics and representative fixtures |
| Seller availability, boat measurements and lake registration | Source dates, uncertainty, policy evidence and inspection packet are shown | Seller/association confirmation; no automatic collection can certify ownership, condition or approval |
| Routing provider and public geocoder policy | Configured-provider support; caches work without enabling a public endpoint | Owner selects provider and accepts applicable policy. Routing failures stay unknown |
| Daily/weekly service and outbound notifications | Preserved cadence, service installers and delivery diagnostics | Owner chooses cadence/machine, installs the service, and configures intended destinations |
| Public deployment and first-party license | September 10: owner authorized public repository visibility; reviewed Pages deployment succeeded with HTTPS enforced and public desktop/mobile verification passed. September 8's private-repository HTTP 422 is historical. `UNLICENSED` and npm `private: true` remain unchanged | An open-source licensing change remains a separate owner choice; future data updates require local collection/export, review, commit and manual deployment |

## Findings from the final engineering review

- **Duplicate adjudication remains an ongoing task.** Two reviewed groups consolidate seven ads in the original 1,538-ad baseline; many other suggestions can still be cross-listings or separate stock. Shared dealer photos and copied descriptions are not proof. Perceptual auditing only accepts bounded operator-provided local files with recorded provenance.
- **At-least-once delivery can repeat after an uncertain remote acknowledgement.** Stable webhook/email identities and saved channel outcomes reduce repeats; only a cooperating receiver can guarantee remote deduplication.
- **A current capture can still contain old seller data.** Observation timestamps describe what BoatScout saw, not when the seller verified it. Quality gates detect configured coverage regressions, not every parser mistake or hidden marketplace ad.
- **Make/category inference still needs review.** September 10 fixed `Tiger`/`TIGER` falsely matching `Tige` and explicit PWC labels losing to generic ski terms; eight supported current-capture repairs were applied. October 21 separates hull/engine evidence and corrects the four verified Vexus/Yamaha ads with original capture dates; ambiguous brands still need review. Ambiguous PWC/accessory and trailer cases were intentionally left for review. Future corrections need source evidence and identity-preserving regression coverage, not broad speculative relabeling.
- **Retained history has a deliberate storage cost.** Current evidence, recent verified backups and audit events are protected. A size budget can therefore warn without deleting enough bytes. Review retention reports and external backup needs; do not assume all data grows within a fixed cap.
- **Service templates are portable; scheduler installation is machine-specific.** Windows/Ubuntu CI exercises application paths and generated templates; consult VALIDATION.md for actual hosted results and the portability corrections they prompted. It does not install a persistent user task on the owner's Windows computer. Laptop sleep, account logout and network failures still affect collection.
- **Market counts are research counts.** Matching advertisements and grouped chart records are shown separately, with historical copies counted separately. October 21 adds reviewed/HIN-only/unresolved counts. These are research classifications, not a claim that every unresolved record is a distinct vessel or a duplicate.
- **Image inventory is exact for the built image, not every future image.** Regenerate runtime SBOMs after package/base-image/browser changes. npm's full optional-tree command limitation and unresolved optional peer declarations remain documented in [SBOM.md](SBOM.md).
- **Local activation and public deployment are separate.** A reviewed build must match its snapshot, source and SBOM manifest. A local rollback does not by itself roll back GitHub Pages; review and deploy that generation.
- **Browser-only workspace and import manifests need exports.** Connected SQLite is authoritative; offline state remains browser scoped. Durable resumable browser transfer manifests and cloud workspace sync are still later work.

## P1 — Market grouping deferral closed October 21

Market now exposes bounded public grouping-basis metadata and separate reviewed, HIN-only and unresolved record counts. Classification uses complete available membership before filtering; source links remain inspectable when one ad misses a filter. Missing/conflicting metadata and single-ad results are conservative unresolved records. Reversible identity/history semantics are preserved; the counts cannot establish exhaustive deduplication.

## P2 — Container snapshot-refresh follow-up

The container supports collection into its shared database and viewing that data through a connected workspace. Its built static snapshot is fixed at image build time. Container `WORKER_AUTO_EXPORT` and the default full refresh/export command are not yet supported: the app and worker need a deliberately shared writable publication directory, with validated snapshot routes and preserved activation/backup/rollback semantics. Leave automatic export off in containers; rebuild the image from a host-generated snapshot to update the standalone view. The final pass fixes readability of private-mode snapshot files copied into the non-root image, while the shared-publication layout remains deferred at the owner's wind-down request.

## October 20 storage and maintenance follow-ups

The project review in [CLEANUP_REVIEW.md](CLEANUP_REVIEW.md) was followed by owner-approved high-confidence cleanup: 271 files (356.5 MiB) and 48 empty build directories removed. Medium/low/optional candidates remain pending; backup/evidence/archive work below has not been applied. Before future storage work, distinguish reconstructible build/dependency output from historical evidence and manifest-bound backup members. The main follow-ups are:

- Archive/retirement tooling is delivered October 21; using it on the pending historical bundles still needs a reviewed plan and separate retirement approval. Older helper scripts read their local baseline paths; content-addressed references need a migration that preserves reproducible audits and rollback routes. Legacy and nested backups currently sit outside normal manifest/retention eligibility.
- Remove the apparently unused direct Radix Tooltip dependency only through a validated lockfile/SBOM/source-release update; do not hand-prune installed package files or shared transitive dependencies.
- Production QA now shares the built-site Playwright suite, supports root/Pages paths and deterministic no-Falcon fixtures; the legacy browser verifier defaults to 4310. Preserve equivalence when consolidating remaining dated private helper scripts.
- Consider changing launcher installation from `npm install` to `npm ci` for lockfile reproducibility, and open the actual development URL when the default port is occupied. These are documented proposals, not implemented changes.

## P3 — Later enhancements

1. Persist buying checklists, confirmed availability/date, measured dimensions, motor-capacity evidence, appointments, towing plans and private attachments. The comparison packet is printable; it is not yet a persisted inspection tracker.
2. Add reviewed regional presets and measure useful incremental boats before increasing crawl volume. Wider-region source profiles are opt-in; a local search filter does not expand remote discovery.
3. Improve long-term market analysis around reviewed vessel timelines, asking-price history and coverage uncertainty. Do not infer actual sale prices or appraisals from asking prices.
4. Extend the October 21 payload/parse/filter benchmarks with background search and additional partitions when inventory approaches the tested 8 MiB initial-catalog budget. Multi-user remote hosting requires a separate identity, authorization, HTTPS, secrets and backup design.
5. Expand parser fixture diversity with permitted captures, especially offsite boats, auction prices, discontinued models, sold/relisted ads and ambiguous dimensions. Keep privacy review before committing fixtures.
6. Bounded live progress is delivered October 21 with coalesced durable checkpoints, elapsed time, phase/source, waits and stall/cancellation explanations. Any later concurrency across independent hosts must retain per-host delays, cancellation and write fencing; faster scans must not bypass source limits.

Before a follow-up, reproduce the issue and inspect current reports. Record shipped behavior, tests, dated observations and proposals separately. Preserve the independent classic-car project.
