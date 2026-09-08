# Verification record

Verified locally on September 7, 2026 (America/Chicago), using Node.js 26.7 on macOS and Node.js 22 inside Docker. Node.js 22 LTS is the recommended deployment runtime.

## Passed

- TypeScript source type checking, independently of generated Next.js build files.
- 45 Vitest unit/integration tests across 7 files.
- 8 Playwright browser tests across desktop and mobile Chromium.
- Filter types for every field in the catalog, unknown handling, multiple search areas, seller vs. boat locations, rules, sorting, grouping, price windows and unit conversions.
- Fixture parsing for Boat Trader and Craigslist, generic dealer selectors, and shared structured-data parsing for the remaining supported adapters.
- Fresh temporary database migrations; authentication and logout; invalid input; note/favorite/search persistence; version conflicts; first-seen preservation; idempotent price history; alert baselining and subsequent price-change alerts.
- Browser search, shortlist, notes, reload persistence, comparison, saved searches, rule editing, maps, filter controls, empty states, and manual entry without losing saved boats.
- Light/dark screenshot review, and mobile horizontal-overflow checks.
- Live browser connection to the local API, with zero browser runtime errors during that check.
- Production static exports at the site root and under the `/BoatMarket/` GitHub Pages repository path. The subpath export was browser-tested for search, images and public assets with no failed local asset requests.
- Docker image build; Compose configuration validation; isolated container startup from an empty database; HTTP 200 for the API health endpoint and static website.
- Expanded live inventory runs: 1,538 ads from all ten enabled sources, with no errors on the final validation pass. The last pass reused today’s cached observations. Unsupported and restricted sources are recorded in SOURCE_COVERAGE.md.
- Dedicated regional/dealer parsing; same-origin pagination; stable ad identities; strict 21-ft exclusion and unknown-length review; installed engine units; quote-only prices; proximity ordering; actual source photos. Tests guard against interpreting an accessory dimension as hull length, engine displacement as power, and dealer JSON-LD catalogs as single boats.
- Complete real-data snapshot and Lake Holiday preset checks in desktop and mobile Chromium; ten-source coverage table; broader nearby and unknown-length views; authenticated API connection; zero browser runtime errors.
- Snapshot export excludes fictional sample records and raw payloads.
- One public example.com request through the DNS-pinned network client.
- `npm audit --omit=dev`: zero reported vulnerabilities after upgrading the static server and email dependencies and applying tested PostCSS / deepmerge-ts overrides.

## Documentation and SBOM handoff checks

The documentation pass checked the actual source configuration, worker/refresh behavior, API bounds, deduplication path, snapshot counts, and known source failures against the code and retained collection evidence. Repository-local Markdown links and fenced code blocks were checked, and the new SBOM generation script passed Node's syntax check.

The npm-generated CycloneDX files were checked for exact version/integrity correspondence to the unchanged lockfile, unique/complete dependency references, and output hashes. The supplementary inventory includes all 435 non-root lock entries. Scoped production and development/build inventories contain 222 and 319 components respectively; [SBOM.md](SBOM.md) explains optional/bundled exclusions. Full CycloneDX JSON Schema validation and container/binary inventory were not performed.

Fresh read-only full and production npm audits completed September 7, 2026 at 9:35 PM CDT, both reporting zero known advisories. The timestamped reports and hashes are in [audit provenance](sbom/audit-provenance.json). This supplements the initial audit noted above; it does not certify application security.

The lockfile and published 1,538-record snapshot remained unchanged during this documentation pass. Application behavior tests, live collection, Docker startup, and static builds were not rerun solely for documentation changes. The earlier results remain a dated baseline. Added npm commands only expose SBOM generation/auditing.

## Scope of verification

Live collection succeeded for the ten sources documented in [LIVE_DATA.md](LIVE_DATA.md). Restricted sites, unparsed inventories and marketplaces outside this collection are documented in [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md). These are ad counts; remaining cross-posts and unreported sold status can inflate the count of available vessels. Other marketplace adapters remain fixture-only. No email/webhook destinations were configured; optional browser rendering and external alert delivery remain unverified.

Docker and initial API/network checks above were completed during the initial build. The expanded research pass reran TypeScript, unit tests, desktop/mobile browser tests, live-data checks and both static export modes. Dependency audits were also refreshed during the documentation pass as recorded above.

The supplied directory originally had no repository. It is now versioned in the private [PNelsonFTP/BoatMarket](https://github.com/PNelsonFTP/BoatMarket) repository. The validation workflow runs on pushes to main and pull requests; inspect [Actions](https://github.com/PNelsonFTP/BoatMarket/actions) for commit-specific results. Pages jobs require BOATSCOUT_ENABLE_PAGES=true and remain disabled. The static output and repository base path were verified locally; no Pages site has been published.

The optional feature-detected WebMCP filter tool is implemented. The test browser did not expose `document.modelContext`, so its native registration/execution was not verified. Ordinary browser workflows do not depend on it.

The UI was inspected at desktop and mobile widths. Map tiles are external; their availability is not under BoatScout’s control.

## Reproduce

```bash
npm run setup
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
docker build -t boatscout:local .
docker compose config --quiet
```

For the explicit Pages-path smoke test, run `NEXT_PUBLIC_BASE_PATH=/BoatMarket npm run build`, then `node scripts/verify-pages.mjs`. Rebuild without that environment variable to restore the root-address local export.

`scripts/verify-browser.mjs` requires the development website and API to be running. It reads the local `.env` password without printing it and writes temporary screenshots to `/tmp/boatscout-qa` (or `QA_OUTPUT`). It does not alter backend notes or listings.

`scripts/verify-live-data.mjs` checks the current real snapshot, source coverage and broader views, both Lake Holiday category presets, listing-rule guidance, photo decoding, mobile overflow and authenticated local API connection. It does not modify backend listings or personal notes.
