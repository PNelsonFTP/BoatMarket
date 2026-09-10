# Future improvements and remaining limitations

Re-audited September 8, 2026 when the owner requested winding down the P1/P2 goal for local review. Delivered work and partial criteria from the previous roadmap are mapped in [P1_P2_IMPLEMENTATION.md](P1_P2_IMPLEMENTATION.md). Verification results are in [VALIDATION.md](VALIDATION.md); exact source access observations are in [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and [config/source-access.json](config/source-access.json).

## P1/P2 work delivered

- **Identity:** reviewed known reposts, conflicting-HIN stock protection, permanent vessel identities, reversible aliases and membership, source/price/review timelines, active/nearby/changed review filters, original-image identity and bounded optional perceptual evidence.
- **Location and provenance:** reversible actual-boat corrections, persistent original source points, field observation history, configured and dated road routes, four-hour filtering, shared geocoder throttling/cache/backoff and ambiguous ZIP/locality review.
- **Lake policy:** the latest publicly linked official rulebook was found and reviewed. Its December 2, 2025 edition permits hulled boats up to **21.0 ft inclusive**, including molded platforms. Reviewed factory-profile reconciliation preserves customized settings. Association confirmation remains separate.
- **Operations:** singleton worker supervision, service templates/installers, cooperative cancellation, expired-job recovery with snapshot evidence, explicit alert events and retry diagnostics, fenced delivery leases and retained channel outcomes.
- **Collection and maintenance:** bounded rotating detail checkpoints, intentional summary-only policy, immutable captured evidence, redacted fixtures, parse/diff preview, source quality gates and reviewed reparse.
- **Storage and releases:** free-space checks, reviewed retention, protected backups/current evidence, verified restore into a new directory, atomic snapshot activation and rollback, privacy/quality/size/source/SBOM publication gates, pinned build dependencies and runtime inventory, Windows/Ubuntu CI.

This does not make the inventory exhaustive. Each row is an advertisement until identity evidence links it to another; absence from a scrape is not a sale confirmation.

## External access and owner decisions still open

| Remaining issue | Current handling | What would resolve it |
|---|---|---|
| Boat Trader and several nearby dealers reject robots/page requests | Dated restrictions remain visible; collectors stop at denials | Dealer permission, supported API/feed/export, or reviewed manual import. Do not bypass blocks |
| One Huber’s Marine detail denies access | All 31 inventory summaries were accepted; the 2026 Harris Cruiser 190 SL detail returned HTTP 403 and missing facts stay unknown | Permitted dealer feed or reviewed manual evidence; do not bypass the detail restriction |
| MarineSource throttles requests | Stops on HTTP 429; no retries that evade the throttle | Supported feed or later permitted access under its rate policy |
| SkipperBud’s inventory data is not yet accessible through the permitted path | Public HTML and restricted inventory response distinguished in ledger | Documented permitted inventory endpoint/feed, representative capture and quality review |
| Facebook, eBay Motors, iboats, YachtWorld/CPO generic integrations | Manual imports or disabled configuration; no claim of live completeness | Authorized API/export with active status, auction/asking-price semantics and representative fixtures |
| Seller availability, boat measurements and lake registration | Source dates, uncertainty, policy evidence and inspection packet are shown | Seller/association confirmation; no automatic collection can certify ownership, condition or approval |
| Routing provider and public geocoder policy | Configured-provider support; caches work without enabling a public endpoint | Owner selects provider and accepts applicable policy. Routing failures stay unknown |
| Daily/weekly service and outbound notifications | Preserved cadence, service installers and delivery diagnostics | Owner chooses cadence/machine, installs the service, and configures intended destinations |
| Public website and first-party license | GitHub Pages creation returned HTTP 422: current plan does not support this private repository. The reviewed local website works; repository remains private and `UNLICENSED` | Pages-compatible account plan or explicit future repository-visibility decision. First-party licensing is a separate owner choice |

## Findings from the final engineering review

- **Duplicate adjudication remains an ongoing task.** Two reviewed groups consolidate seven ads in the original 1,538-ad baseline; many other suggestions can still be cross-listings or separate stock. Shared dealer photos and copied descriptions are not proof. Perceptual auditing only accepts bounded operator-provided local files with recorded provenance.
- **At-least-once delivery can repeat after an uncertain remote acknowledgement.** Stable webhook/email identities and saved channel outcomes reduce repeats; only a cooperating receiver can guarantee remote deduplication.
- **A current capture can still contain old seller data.** Observation timestamps describe what BoatScout saw, not when the seller verified it. Quality gates detect configured coverage regressions, not every parser mistake or hidden marketplace ad.
- **Retained history has a deliberate storage cost.** Current evidence, recent verified backups and audit events are protected. A size budget can therefore warn without deleting enough bytes. Review retention reports and external backup needs; do not assume all data grows within a fixed cap.
- **Service templates are portable; scheduler installation is machine-specific.** Windows/Ubuntu CI exercises application paths and generated templates; consult VALIDATION.md for actual hosted results and the portability corrections they prompted. It does not install a persistent user task on the owner's Windows computer. Laptop sleep, account logout and network failures still affect collection.
- **Market counts are research counts.** Matching advertisements and grouped chart records are shown separately, with historical copies counted separately. The chart does not yet distinguish reviewed identities from automatic HIN matches, or estimate how many unresolved cross-listings remain.
- **Image inventory is exact for the built image, not every future image.** Regenerate runtime SBOMs after package/base-image/browser changes. npm's full optional-tree command limitation and unresolved optional peer declarations remain documented in [SBOM.md](SBOM.md).
- **Local activation and public deployment are separate.** A reviewed build must match its snapshot, source and SBOM manifest. A local rollback does not by itself roll back GitHub Pages; review and deploy that generation.
- **Browser-only workspace and import manifests need exports.** Connected SQLite is authoritative; offline state remains browser scoped. Durable resumable browser transfer manifests and cloud workspace sync are still later work.

## P1 — Deferred at the review checkpoint

Market needs a separate breakdown of reviewed identities, HIN-only groups and unresolved research records. The current chart shows matching ads, grouped records and associated copies, and clearly states its classification limit. Complete this later by exposing bounded public grouping-basis metadata, preserving merge/split history and testing that chart totals never imply unreviewed ads are verified unique boats. The schema/repository expansion was stopped at the owner's wind-down request.

## P2 — Container snapshot-refresh follow-up

The container supports collection into its shared database and viewing that data through a connected workspace. Its built static snapshot is fixed at image build time. Container `WORKER_AUTO_EXPORT` and the default full refresh/export command are not yet supported: the app and worker need a deliberately shared writable publication directory, with validated snapshot routes and preserved activation/backup/rollback semantics. Leave automatic export off in containers; rebuild the image from a host-generated snapshot to update the standalone view. The final pass fixes readability of private-mode snapshot files copied into the non-root image, while the shared-publication layout remains deferred at the owner's wind-down request.

## P3 — Later enhancements

1. Persist buying checklists, confirmed availability/date, measured dimensions, motor-capacity evidence, appointments, towing plans and private attachments. The comparison packet is printable; it is not yet a persisted inspection tracker.
2. Add reviewed regional presets and measure useful incremental boats before increasing crawl volume. Wider-region source profiles are opt-in; a local search filter does not expand remote discovery.
3. Improve long-term market analysis around reviewed vessel timelines, asking-price history and coverage uncertainty. Do not infer actual sale prices or appraisals from asking prices.
4. Benchmark large snapshots and filter/render time before adding pagination/compression/background search. Multi-user remote hosting requires a separate identity, authorization, HTTPS, secrets and backup design.
5. Expand parser fixture diversity with permitted captures, especially offsite boats, auction prices, discontinued models, sold/relisted ads and ambiguous dimensions. Keep privacy review before committing fixtures.
6. Improve long-scan progress reporting. Fresh scans can take tens of minutes under source crawl delays, and an active source's final counters are written when that source completes. Persist bounded live page/detail progress and show elapsed time before considering concurrency across independent hosts. Preserve per-host delays, cancellation and write fencing; a faster scan must not bypass source limits.

Before a follow-up, reproduce the issue and inspect current reports. Record shipped behavior, tests, dated observations and proposals separately. Preserve the independent classic-car project.
