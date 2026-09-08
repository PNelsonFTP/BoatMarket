# Verification record

Final improvement-pass checks: **September 7, 2026, America/Chicago** (September 8 UTC), using Node.js 26.7 and npm 11.19 on macOS. Node.js 22.12+ remains the supported minimum; GitHub Actions and Docker use Node 22. Earlier checks are identified separately below.

## Current integrated results

| Check | Result |
|---|---|
| TypeScript | `npm run typecheck` passed |
| Unit/integration suite | **106 tests across 19 files passed** |
| Desktop/mobile browser suite | **18 tests passed** in Chromium |
| Root production export | `npm run build` passed; normal root build restored after the subpath check |
| GitHub Pages path | `/BoatMarket/` production build and `scripts/verify-pages.mjs` passed: search/images/public assets, zero runtime errors or missing local assets |
| Real review panels | `scripts/verify-review-tools.mjs` passed desktop 1440×1000 and mobile 390×844 against the local API: source health, 163 candidate pairs, city review, zero runtime errors/overflow |
| Database migration/reindex | Pre-upgrade backup created; additive migration applied; dry-run then apply indexed HINs with zero changed group assignments |
| Real-data full pipeline | Ten enabled sources succeeded; 1,538 ads; protected alternate-target export; public snapshot unchanged |
| Backup verification | Actual full-pipeline backup passed five available-file hashes, SQLite integrity and readable table counts; temporary-database recovery/altered-file tests also passed |
| SBOM | Three CycloneDX outputs schema/graph/evidence validated; all-platform inventory 441 package instances; no lockfile or dependency changes |
| Advisory checks | Fresh full and production npm audits at 03:09 UTC reported zero advisories; see [SBOM.md](SBOM.md) for exact scope and bundle-only audit limits |

## What the tests cover

- Catalog filters, unknown-value semantics, areas/radii, rules, sorting, prices and sample separation.
- Source normalization and pagination fixtures, engine/length ambiguity, quote-only prices, out-of-area/offsite handling and network restrictions.
- Modern HIN validation across inconsistent model metadata and same-source ads, conflicting HINs, transitive different-boat decisions, reversible grouping, stable ad identity and preserved workspace/history.
- Actual one-shot CLI exit codes against isolated migrated SQLite databases: success 0, failed 1, partial 2, busy 3 and explicit skip-busy behavior. Lease expiry/renewal/cancellation, stale-run recovery, protected snapshot replacement and retained detail evidence.
- Older detail observations cannot overwrite fresher summary price/sold facts; newer details can record subsequent relisting. Source metrics remain tied to their correct run.
- Queued API refresh outcomes survive later alert-evaluation failure; alert outcome is separately reported. Authentication, invalid input, per-row import failure manifests, source-ID mapping, whole-chunk prevalidation, persistence and stale workspace revisions.
- City/state/ZIP/suburb ranking, ambiguous candidates, conflicting ZIP aggregation, exact coordinate preservation and offsite uncertainty.
- Whole 1,538-ad JSON transfer in bounded chunks, UTF-8 byte limits, failure/uncertainty manifests, storage isolation, explicit legacy migration and reviewed merge/replace behavior.
- Grouped advertisement notes stay visible when the representative changes after a price change; editing one ad does not overwrite another ad's notes.
- Comparison HTML escapes listing content, permits only safe links and exports no scripts/private notes. A three-boat packet was visually inspected and printed to PDF in an ignored scratch directory.
- Full CycloneDX schema validation, rejection of unsupported fields/invalid license IDs, exact bundle evidence and detection of stale/tampered evidence.

Browser tests use fixtures/mocked endpoints for mutation scenarios, preserving the user's live notes and listings. The separate review-panel smoke check logs into the real API but performs no listing, duplicate-decision or workspace mutations. Screenshots are under `/tmp/boatscout-review-qa/`; they are not repository assets.

## Real-data pipeline evidence

Run `8b436711-57c5-4cbe-8569-e4311030cad7` completed at **2026-09-08T03:08:41Z**. All ten configured sources succeeded, processing **70 inventory pages and 216 eligible detail pages**, with **286 cache hits and zero newly fetched inventory/detail HTML pages**. No page/detail caps or source errors were reported. There were zero new ads, zero removals and zero price changes. Metrics recorded 36 content comparisons changed and 1,502 metadata-only updates during the new provenance/merge implementation.

The accepted source observation range was **01:06:08Z–02:15:18Z**, earlier than the pipeline timestamp. This was a successful cached validation, **not a new network research pass or seller-availability confirmation**. Blocked/unsupported sources were not retested or enabled. The alternate export went to ignored `data/validation/refreshed-snapshot.json`. The published `public/snapshot.json` retains its previous SHA-256:

```text
2b93db5c5010a17ab661637a7ce6c09bdf938ab7ff56bbb3e256f0960d392adc
```

The database still contains 1,538 real ads plus 52 separate fictional seed rows. The identity reindex found **144 usable modern-format HINs**, **zero automatic groups**, and **163 suggested review pairs**. No same/different decisions were invented for the user. Backup verification read the original user/search/history tables; it did not restore over the live database. The API and original 30-minute worker were restarted after validation; auto-export and auto-geocoding remain off unless configured by the operator.

## Historical checks retained from the initial build

The September 7 initial build passed 45 unit/integration tests, eight browser tests, root/subpath exports, live snapshot/profile/photo checks, a Docker image build, Compose configuration validation and isolated Docker startup with a fresh SQLite database. Initial GitHub validation of commit `f12ac90` also passed.

The **Docker image/startup was not rebuilt during this improvement pass**. Windows execution, rendered-source Chromium inside the shipped image, SMTP/webhook delivery, paid/authenticated marketplaces, nationwide routing, current Lake Holiday rules and exhaustive marketplace coverage are not verified by these tests. The optional WebMCP path was not executed because the test browser did not expose `document.modelContext`.

GitHub Pages remains disabled. Local export validation is not a live Pages deployment. Check [GitHub Actions](https://github.com/PNelsonFTP/BoatMarket/actions) for commit-specific hosted CI results rather than treating this document as a permanent green status.

## Reproduce

```bash
npm run setup
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run sbom
```

For the Pages path, build with `NEXT_PUBLIC_BASE_PATH=/BoatMarket npm run build`, run `node scripts/verify-pages.mjs`, then rebuild without the environment variable to restore local root output.

With the local website and API running, `node scripts/verify-review-tools.mjs` uses the `.env` password without printing it, inspects the real panels and captures desktop/mobile screenshots. Existing `scripts/verify-browser.mjs` and `scripts/verify-live-data.mjs` cover the earlier general/live-data workflows. See [OPERATIONS.md](OPERATIONS.md) for safe full refresh, backup verification and manual restore. The live pipeline logs and reports are ignored private operational data, not checked-in test fixtures.
