# October 21 engineering improvements

This implements **items 1–7, 10 and 11** from [the engineering review](IMPROVEMENT_REVIEW_2026-10-21.md), following the owner's request. The classic-car project stays separate. Operational commands are in [OPERATIONS.md](OPERATIONS.md), dated validation in [VALIDATION.md](VALIDATION.md), and dependency/advisory evidence in [SBOM.md](SBOM.md).

This is an implementation and historical normalization update. It does **not** represent a fresh inventory scan. The 2,429-ad dataset retains its October 19 generation date, original partial collection outcome, observation range, prices, statuses and histories. Four verified Vexus ads have corrected hull makes; grouping metadata and derived catalog files are new packaging. GitHub pushes validate the project; the reviewed Pages workflow remains a separate manual deployment.

## Delivery map

| Item | Delivered behavior | Main regression coverage |
| ---: | --- | --- |
| 1 | Listing files support 64 MiB and 10,000 records independently of the unchanged 12 MiB/1,000-record request limit. Whole-file preview, oversized single-record rejection and accepted/failed/uncertain transfer outcomes remain. Workspace files retain their own 12 MiB limit. | Generated oversized files, actual full formatted export, chunk boundaries, browser imports on desktop/mobile. |
| 2 | Structured hull evidence and title hull candidates are separate from motor brands. Conflicts/uncertainty remain visible; credible unfamiliar hull brands are preserved. Multiple title engine brands remain ambiguous. Provenance dates come from the actual capture, including cached/reparsed and retained-detail paths. | Vexus/Yamaha, Lund/Mercury, genuine Yamaha hull/PWC, Tige/Tiger, overlapping brands, structured/title conflicts, original capture dates and retained engines. |
| 3 | Accepted inventories have configuration-specific durable baselines, independently of detail success. Complete discovery, quality checks and successful writes are required. Strict captured-empty Craigslist markup is distinguished from broken/challenged/blank pages. | Detail-failed accepted scans, caps/rejections, interrupted writes, configuration changes, legacy fallback, two real empty-capture fixtures plus contradictory/challenge cases. |
| 4 | Durable sessions reconcile bounded passes by source/ad identity and URL/capture time. Start/continue collect without activating the website; explicit finalization preserves complete/partial coverage and refuses conflicting outside writes or configuration changes. | Restart/interruption, no double-counting, pass/attempt limits, denied/429 exclusions, backoff, configuration/write conflicts, explicit finalization, backup/restore metadata. |
| 5 | Root and `/BoatMarket` exports have shared production browser checks using deterministic no-Falcon fixtures and the real snapshot. CI tests built assets, hashes, filters, navigation, images, lazy evidence and exports on desktop/mobile. | Production Playwright suite, current/full-versus-catalog benchmark, existing development E2E and actual full import. |
| 6 | Market shows reviewed groups, HIN-only groups and unresolved research records for the filtered results. Basis uses complete available membership before filtering, while linked ads remain inspectable. Missing/conflicting metadata and one-ad results stay unresolved. | Filtered representatives, out-of-filter links, mixed metadata, standalone/split outcomes and browser counts. |
| 7 | Coalesced durable progress records expose source/phase, page/detail counters, elapsed time, checkpoint age, intentional waits, cancellation and stalls. Private JSON writes are throttled; source/final boundaries flush immediately. | Slow source observed mid-scan, bounded checkpoint writes, cancellation/status, operations API and browser progress/session controls. |
| 10 | The versioned search catalog removes only provenance from initial loading. Every shared filter field, description, photo, price history and grouping input remains. Immutable detail chunks hydrate when opened or exported; full canonical compatibility and visible integrity-checked fallback remain. | Full field/filter/group equivalence, current/125%-size inventories, payload ceiling, corruption/membership/generation checks, global request limit, stalled connection/body deadlines, evidence-preserving merge/full export. |
| 11 | Reviewed archive plans, content-addressed packages, verification, restore-to-new-directory and separately authorized retirement are implemented. Concurrent writers share safe bounded log rotation. Baselines, unfinished sessions/progress and referenced reports are protected. | Archive round trip/corruption/references/symlinks/expiry, public-link policy, backup integrity, concurrent writers and stdout fallback. |

## Compatibility and operational contracts

No package was added, removed or upgraded; no database migration is needed. Refresh metadata is versioned private JSON under `REFRESH_REPORT_DIR` (default `data/refresh-runs`) in `inventory-baselines`, `sessions` and `progress`. The first upgraded scan can use a clearly labeled prior successful-ingestion count or retained-ad fallback; historical accepted baselines are never fabricated. Only a newly accepted complete inventory becomes the durable baseline. Manual parser previews retain their conservative scope checks.

Session defaults are five passes and three attempts per source, with explicit bounded configuration. Denied/robots/challenge/429, quality and inventory-cap failures require review instead of automatic continuation. Eligible transient and deferred detail work can continue within limits. Reports keep component attempts and original capture times; old reports without new fields remain readable. Finalization rechecks source configuration and writes under the export lease; an unrelated scan/import cannot silently inherit the session's success. Partial export remains explicit. Scheduling, external providers and notification destinations are unchanged.

The canonical full snapshot stays version 1 at `snapshots/<hash>.json`, with `snapshot.json` as the compatibility alias. `data-mode.json` can additionally identify a version-1 `catalogs/<hash>.json` and its canonical snapshot hash. Provenance chunks live at `catalog-details/<hash>.json`; membership, generation, exact bytes and SHA-256 are checked. Detail reads share a four-request limit across overlapping actions and a 30-second connection/body deadline. Failed chunks can retry; inventory changes invalidate in-flight merges. Manual additions and merged browser imports hydrate originals before replacing a lazy loader; full exports cannot silently omit provenance.

Release preparation checks the 8 MiB initial-catalog budget before approval. Activation writes immutable objects before switching the pointer. Release/build checks and backups recompute the derived graph from reviewed canonical bytes and verify every member. Restore rejects undeclared/missing/corrupt catalog members and writes only to a new directory. Catalog/detail symlinks, including user-controlled ancestors, are refused. Normal macOS `/var` and `/tmp` aliases remain supported.

Archive preview and pack preserve originals. Exact-hash retirement is a separate action with a 24-hour reviewed plan, unchanged bytes/references and writer leases. Active/previous/publication/release/backup/helper/database references remain blockers. Public direct links are protected by default; an explicit broken-link policy can only permit otherwise unreferenced generations. Backup members and databases cannot be retired through this tool. **No pending medium/low cleanup candidate or historical generation was retired in this implementation.**

Logs default to 10 MiB active and twelve rotations. A cross-process lock and reopening per write avoid detached writers during rotation. Reaching the rotation allowance preserves stdout and records a bounded warning/status instead of deleting young logs or growing indefinitely. Retention can later select expired rotations after normal review. Ordinary dead-writer locks can recover; abandoned recovery/archive barriers need deliberate operator review. No automatic prune schedule was installed.

## Historical repair and retained evidence

The verified pre-repair backup is private at `data/backups/improvements-2026-10-21-before-repair`. A hashed preview and original record fingerprints authorized exactly four Vexus-title/Yamaha-hull corrections. The repair separated `make: Vexus` from `engineMake: Yamaha` and recorded evidence at the original summary-capture dates, spanning September 12–October 19. It did not reobserve sellers or update `lastSeenAt`.

A read-only SQLite comparison against that backup verified that all other listing columns/rows, private tables, six duplicate decisions, eight saved searches, 52 samples, 2,641 price-history rows and all engine rows were unchanged. `quick_check` passed. Snapshot comparison confirmed only grouping metadata and the four make/evidence corrections changed; the original refresh metadata, generation time and observation range are identical. Private plans, receipts, benchmark results and test evidence are under `data/improvement-review-2026-10-21/`.

A real non-destructive archive drill also reproduced the retained September 12 inventory audit (20,442 bytes), with exact SHA-256 `1a86e5b77946401497c96929564b1c659393a6fab83659a86c9befb418f8f4b6`. Package/plan `eaf0a5279db67c3ed5f689bba6ab0d0081cb59573833e0f84f7f503a6fd83613` and restore receipts are private under `data/archives/`; the original remains present. Reference previews are deliberately strict: newly generated scanned reports can invalidate a plan, so preview/pack should run after those writers settle.

## Payload and execution measurements

Measured on the same macOS arm64 / Node 26.7 environment on October 21, after adding grouping metadata and correcting the four ads:

| Measure | Full canonical | Initial search catalog |
| --- | ---: | ---: |
| Current records | 2,429 | 2,429 |
| JSON bytes | 18,831,527 formatted / 13,562,166 compact | 5,632,015 compact |
| JSON parse median (five repeats) | 18.56 ms | 7.14 ms |
| Parse + schema validation median | 128.23 ms | 38.71 ms |
| Five shared filter scenarios median | 26.93 ms | 16.93 ms |
| 3,037-record growth catalog | — | 6,696,475 bytes |

Initial decoded JSON is **70.09% smaller than formatted / 58.47% smaller than compact canonical**. Thirty immutable detail chunks total 8,008,629 bytes, loaded only when needed. Every catalog field and five full shared filter/group result scenarios matched the canonical records for both current and 125% growth cases. A 10,000-record expansion of these rich records exceeds the 8 MiB initial budget and is safely refused; broader partitioning is still required before that scale.

These Node timings are observations, not production transfer or mobile-speed promises. Heap deltas include garbage-collection noise; the benchmark process peaked near 1.29 GB RSS while constructing/comparing all scenarios. Production Playwright uses Desktop Chrome and iPhone 13 Chromium emulation on the same host, not physical mobile hardware or a throttled network. It attaches separate before/after cold-load, decoded-byte, native validation/filter and diagnostic heap measurements for the **same desktop and mobile profiles**, including the larger dataset. Intercepted browser resources may report zero network transfer bytes, so reports distinguish exact JSON bytes from actual network compression. CI enforces payload/equivalence budgets; it does not use flaky wall-time thresholds.

## Remaining work

Review items **8, 9 and 12–15** remain open: owner preference profiles, permitted coverage backlog, recovery drill/external copy, private buying workflow, writable container publication, and dependency maintenance. Container connected collection works; its standalone snapshot remains fixed at image build time. No source block was bypassed or newly re-probed in this pass. Cross-listing review, incomplete marketplace coverage and association/seller verification remain ongoing limitations.

Fresh lock-based audits now report thirteen full-scope advisories (four critical) and seven production-scope advisories (no critical). Dependency versions were intentionally unchanged in this feature scope; [SBOM.md](SBOM.md) records exact dated evidence and the maintenance follow-up. Browser transfer manifests still need deliberate export rather than durable automatic resume. Historical helper migrations and actual retirement approvals remain separate from the newly implemented archive capability.
