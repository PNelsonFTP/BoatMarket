# BoatScout software bill of materials

This package records the dependencies actually locked for BoatScout 1.0.0. It contains three schema-validated CycloneDX 1.5 JSON SBOMs, the complete lockfile inventory, exact metadata from the verified optional WASM bundle, generation evidence, and fresh read-only vulnerability reports. Two SBOMs come from npm; the all-platform artifact adds verified bundled contents to the locked package graph. It does not change or install dependencies.

Generated **September 8, 2026 at 12:01 PM America/Chicago** (`2026-09-08T17:01:48.335Z`) with Node `v26.7.0` and npm `11.19.0` on macOS arm64. The project supports Node `>=22.12.0`; GitHub Actions and Docker use Node 22. The actual tested Docker runtime reports Node `22.23.2`. These recorded generation/runtime versions describe their respective environments.

The source [package-lock.json](package-lock.json) is lockfile version 3. Its SHA-256 is:

```text
07da22e2a6a002c0c9ea2c2836257d28d4c60b011439f5d645f8c57ec173b15e
```

## Deliverables and scope

| Artifact | Contents |
| --- | --- |
| [All-platform lock and verified bundle CycloneDX SBOM](sbom/boatscout-all-platforms.cdx.json) | 441 physical third-party package instances and 721 dependency edges: all 435 lock entries plus six exact bundled package instances. Includes development and platform-optional contents; not an installed deployment inventory. |
| [Production CycloneDX SBOM](sbom/boatscout-production.cdx.json) | 255 third-party components and 419 dependency edges; npm `--omit=dev`, including optional and peer dependencies reachable in that scope. Prisma CLI and Playwright library are now explicit runtime dependencies. |
| [Development/build/runtime CycloneDX SBOM, optional packages omitted](sbom/boatscout-full-required.cdx.json) | 319 third-party components and 568 dependency edges; includes development/build tools, omits optional dependency branches. The filename's `required` distinguishes this scope; it is not the complete platform-optional tree. |
| [Complete available lock inventory](sbom/package-lock-inventory.json) | All 435 non-root lock entries, including 113 entries marked optional, exact locked versions, package paths, source URLs, integrity strings, license metadata, platform conditions, declared dependency edges, and explicit unresolved declarations. This supplemental JSON is not CycloneDX. |
| [Verified bundled-package evidence](sbom/bundled-package-evidence.json) | Exact published package manifests, licenses, per-file SHA-256 inventory, archive integrity verification and timestamp. No package code was installed or executed. |
| [Enriched dependency evidence](sbom/enriched-dependency-evidence.json) | Dependency edges resolved against lock and bundled paths; 18 absent optional peer declarations remain explicitly unresolved. |
| [Vendored schema provenance](sbom/schemas/provenance.json) | Official CycloneDX 1.5 and referenced schemas pinned to an upstream commit, with file hashes and Apache-2.0 license. |
| [Generation provenance and validation](sbom/provenance.json) | Commands, timestamps, tool versions, source/output SHA-256 values, transformations, scope counts, and validation results. |
| [Full optional-tree generation limitation](sbom/full-sbom-generation-limitation.json) | npm's failed full lock-only generation attempt remains documented. The separately generated all-platform artifact resolves that metadata gap using verified bundle evidence. |
| [Audit provenance](sbom/audit-provenance.json) | Exact audit commands, times, lock hash, report hashes, and results. |
| [Runtime image inventory directory](sbom/runtime/) | Two actual linux/arm64 Docker image CycloneDX inventories, scanner/digest provenance and isolated smoke reports; operating-system packages, Node, native Prisma files and optional browser binaries are recorded separately from the source lock graph. |

All 435 available lock entries carry declared license metadata and an integrity value. All three SBOMs include an application root component in addition to the counts above. The six bundled copies are distinct physical package instances even where the same name/version also exists elsewhere in the lock. Component counts differ because dependency reachability and omission rules differ; do not add these overlapping counts together.

The npm implementation uses the checkout directory as the root display name in lock-only mode. The generator normalizes only that field to `boatscout`, the name in the lockfile. Within those two npm-generated artifacts, third-party components and dependency graph edges remain npm's output. npm's lock-only mode excludes additional information available only from installed dependency manifests, such as descriptions or homepages. [npm SBOM documentation](https://docs.npmjs.com/cli/v11/commands/npm-sbom/)

## Optional bundled contents: now enumerated

The npm all-platform lock-only command still reports `ESBOMPROBLEMS`: the optional `@tailwindcss/oxide-wasm32-wasi@4.3.3` package bundles dependencies whose individual package paths are not listed in the lockfile. The generator now separately resolves this inventory gap from the exact published archive, after its SHA-512 matches the parent package's lock integrity:

| Bundled package | Verified exact version | Declared license |
| --- | --- | --- |
| `@emnapi/core` | 1.11.1 | MIT |
| `@emnapi/runtime` | 1.11.1 | MIT |
| `@emnapi/wasi-threads` | 1.2.2 | MIT |
| `@napi-rs/wasm-runtime` | 1.1.4 | MIT |
| `@tybys/wasm-util` | 0.10.2 | MIT |
| `tslib` | 2.8.1 | 0BSD |

The archive SHA-256 is `d5b61fbe10d237f7565032a74b03b5be6c83b309037ee407e2b5b46f24738823`. Inspection was limited to in-memory archive reading and hashing; there was no extraction into the dependency tree, installation, lifecycle-script execution, or lockfile modification. The reproducible implementation is [sbom-evidence.mjs](scripts/sbom-evidence.mjs). Per-file hashes and manifest hashes describe the inspected files; they are not invented standalone package-archive digests. The six bundled components therefore carry evidence hashes as named properties instead of claiming independent distribution hashes.

The supplemental raw lock inventory still correctly records four unresolved bundled declarations and 18 absent optional peers. The separate enriched graph resolves the bundled paths and leaves only the 18 absent optional peers, which are not invented as installed components. All 441 all-platform components carry exact version and license metadata; 435 carry lockfile distribution-integrity hashes. The all-platform BOM describes the source/build dependency universe represented by this lock plus the inspected bundle, not a complete container, operating system, or deployed runtime.

Ordinary generation verifies the committed evidence against the current parent package entry and checks its manifest/file-inventory hashes. It does not download the archive again. `--refresh-bundles` explicitly fetches and re-verifies the current locked tarball; a changed parent package causes ordinary generation to stop until evidence is refreshed. npm's own failure is retained as tooling evidence, not presented as an unresolved exact-version gap.

## Direct dependencies

These are the exact locked versions, rather than the version ranges in the manifest. Dependencies categorized as production by npm can still serve build or local execution needs: for example, `next` creates the static website and `tsx` runs the local TypeScript backend.

No locked package version changed in this implementation pass. `prisma` moved from development to runtime for container database migrations; already-locked `playwright` became an explicit runtime dependency for the optional rendered collector. `@playwright/test` remains development-only. Those reachability changes explain the larger production scope and changed lock hash/edge counts. The new identity/source adapters add no packages. Optional locally supplied image auditing uses the existing `sharp` dependency available through the full Next installation; URL-based duplicate evidence works independently of it.

| Application dependency | Locked version |
| --- | --- |
| `@fastify/cors` | 11.3.0 |
| `@fastify/rate-limit` | 10.3.0 |
| `@fastify/static` | 10.1.3 |
| `@prisma/client` | 6.19.3 |
| `@radix-ui/react-dialog` | 1.1.23 |
| `@radix-ui/react-tooltip` | 1.2.16 |
| `cheerio` | 1.2.0 |
| `clsx` | 2.1.1 |
| `dotenv` | 17.4.2 |
| `fastify` | 5.12.3 |
| `ipaddr.js` | 2.5.0 |
| `leaflet` | 1.9.4 |
| `leaflet.markercluster` | 1.5.3 |
| `lucide-react` | 0.468.0 |
| `next` | 15.5.25 |
| `nodemailer` | 10.0.1 |
| `pino` | 9.14.0 |
| `playwright` | 1.63.0 |
| `prisma` | 6.19.3 |
| `react` | 19.2.8 |
| `react-dom` | 19.2.8 |
| `recharts` | 3.10.1 |
| `robots-parser` | 3.0.1 |
| `tailwind-merge` | 3.6.0 |
| `tsx` | 4.23.13 |
| `zod` | 3.25.76 |

| Development/build/test dependency | Locked version |
| --- | --- |
| `@playwright/test` | 1.63.0 |
| `@tailwindcss/postcss` | 4.3.3 |
| `@types/leaflet` | 1.9.22 |
| `@types/leaflet.markercluster` | 1.5.6 |
| `@types/node` | 22.20.1 |
| `@types/nodemailer` | 7.0.12 |
| `@types/react` | 19.2.18 |
| `@types/react-dom` | 19.2.7 |
| `concurrently` | 9.2.4 |
| `prettier` | 3.9.6 |
| `tailwindcss` | 4.3.3 |
| `typescript` | 5.9.3 |
| `vitest` | 3.2.7 |

The manifest overrides `postcss` to `8.5.28` and `deepmerge-ts` to `8.0.2`. The lock records `whatwg-encoding@3.1.1` as deprecated; its publisher points to `@exodus/bytes`. Deprecation alone is not a vulnerability finding. Update through the owning dependency after checking compatibility.

## License metadata and external materials

The manifest explicitly marks BoatScout's own code **`UNLICENSED`**, and there is no first-party `LICENSE` file granting redistribution rights. `private: true` also prevents normal npm publication. Any future open-source license remains an owner decision before distribution.

Third-party declared licenses are not all MIT. The lock includes Apache-2.0, BSD variants, ISC, LGPL-3.0-or-later and compound expressions, MPL-2.0, CC-BY-4.0, BlueOak-1.0.0, MIT-0, and 0BSD. The exact per-package declaration is retained in the inventory; use it to locate applicable upstream notices when preparing a release. These are metadata declarations, not a review of license texts, bundled contents, or obligations for a particular distribution.

Boat advertisements, seller photos, externally fetched HTML, lake-rule documents, map tiles, and geocoding results are data or services, not npm packages. This SBOM does not grant rights to redistribute those materials. Source attribution and collector restrictions are described in [SOURCE_COVERAGE.md](SOURCE_COVERAGE.md) and the application documentation.

## Fresh vulnerability checks

Read-only npm audits against `https://registry.npmjs.org` completed at `2026-09-08T17:01:49.066Z` and `17:01:49.465Z` (September 8, 12:01 PM CDT), matching the source lock hash above:

| Scope | Info | Low | Moderate | High | Critical | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [Full declared dependency audit](sbom/npm-audit-full-2026-09-08T17-01-48Z.json) | 0 | 0 | 0 | 0 | 0 | 0 |
| [Production audit](sbom/npm-audit-production-2026-09-08T17-01-48Z.json) | 0 | 0 | 0 | 0 | 0 | 0 |

Both commands exited successfully. These results mean the registry reported no known advisories for the audited dependency descriptions at that time. They are not a security certification, an application penetration test, a container scan, or a separate advisory scan of the enriched bundle-only components. Exact bundled metadata is now verified, but npm audit still operates on its lock-derived scope. npm audit reports package metadata to its configured registry; the script explicitly selects the public npm registry and never runs `npm audit fix`. [npm audit documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/)

## Regenerate and validate

Run from the project root after a deliberate dependency update:

```sh
npm run sbom
```

To also request new read-only registry audit reports:

```sh
npm run sbom:audit
```

To re-inspect the exact locked optional archive (network access, without installation), run:

```sh
npm run sbom -- --refresh-bundles
```

The ordinary run reads local manifests, lock metadata, committed bundle evidence and vendored schemas; it does not refresh audit reports or access the package tarball. `--audit` creates timestamped audit JSON files and updates `audit-provenance.json`. Existing dated audit reports remain as historical evidence. Keep the matching provenance with any archived release. Generation timestamps and npm's serial UUIDs change between runs, so semantic dependency content is reproducible with the same lockfile and npm version, not byte-for-byte output. Review this human-readable document when versions or counts change.

The script checks the complete vendored CycloneDX 1.5 JSON Schema with Ajv and ajv-formats already present in the dependency lock. It also validates component/graph references, exact name/version correspondence to lock entries or verified bundle evidence, every emitted integrity hash against the lock, preservation of all lock entries, and that generation left the lock unchanged. Invalid fields, unknown SPDX license identifiers, stale bundle evidence, and modified manifest evidence have regression tests.

The official schemas are pinned to [CycloneDX specification commit c320fc0](https://github.com/CycloneDX/specification/tree/c320fc0f0b46873864927d9d5684eea7ba439728/schema); their [Apache-2.0 license](sbom/schemas/LICENSE) and hashes are included. All schema constraints and formats are evaluated. IRI-reference and international-email formats currently accept their ASCII URI/email subsets only and reject international forms rather than silently skipping format validation. The emitted documents fit that subset. A future generator emitting international addresses needs a broader format implementation.

This is not package-signature validation, independent hashing of every locked distribution, or complete semantic version-range validation of every edge (the project deliberately overrides two transitive package versions). Among locked npm distribution contents, the optional parent archive has independently verified evidence; this generation reused that earlier verified evidence. Scanner downloads and installed runtime binaries have their separate evidence described below. npm execution uses its JavaScript entry point when available, avoiding direct `.cmd` spawning on Windows; generation was exercised on macOS, not on a Windows host.

## Actual Docker runtime inventories

Both Docker targets were built and smoke-tested as non-root UID 1000 on linux/arm64, using an isolated temporary database. Migrations, authenticated listing queries and health checks passed; the rendered target also executed a loopback-only JavaScript rendering fixture. This validates those captured images, not an unbuilt later source revision or every CPU/OS platform.

| Target | Immutable local image ID | Inventory |
| --- | --- | --- |
| Default runtime, browsers omitted | `sha256:aa977f37e52af9ebeb1af2d403fee8b82bbbc8d04f56d7b3a3e367cd6728737e` | [3,955 components](sbom/runtime/sha256-aa977f37e52af9ebeb1af2d403fee8b82bbbc8d04f56d7b3a3e367cd6728737e.2026-09-08T17-00-09.468Z.cdx.json): 91 Debian, 346 npm and 3,515 file entries, plus other runtime components. [Provenance](sbom/runtime/sha256-aa977f37e52af9ebeb1af2d403fee8b82bbbc8d04f56d7b3a3e367cd6728737e.2026-09-08T17-00-09.468Z.provenance.json), [smoke/native evidence](sbom/runtime/sha256-aa977f37e52af9ebeb1af2d403fee8b82bbbc8d04f56d7b3a3e367cd6728737e.2026-09-08T17-00-09.468Z.smoke.json). |
| Optional rendered collector | `sha256:a0bdc9633bc35d948f484839735748dd26b72963bde8919ee0bc31275f9e820d` | [5,290 components](sbom/runtime/sha256-a0bdc9633bc35d948f484839735748dd26b72963bde8919ee0bc31275f9e820d.2026-09-08T16-59-31.851Z.cdx.json): 199 Debian, 346 npm and 4,742 file entries, plus other runtime components. [Provenance](sbom/runtime/sha256-a0bdc9633bc35d948f484839735748dd26b72963bde8919ee0bc31275f9e820d.2026-09-08T16-59-31.851Z.provenance.json), [smoke/browser/native evidence](sbom/runtime/sha256-a0bdc9633bc35d948f484839735748dd26b72963bde8919ee0bc31275f9e820d.2026-09-08T16-59-31.851Z.smoke.json). |

Syft `1.51.1` generated these full-schema-validated CycloneDX 1.5 inventories. Its downloaded scanner archive was SHA-256 verified against the reviewed asset pin in [runtime-toolchain.json](scripts/runtime-toolchain.json); per-image provenance records the scanner binary hash and output hash. Two Debian license identifiers outside the vendored SPDX enumeration (`SMAIL-GPL` and `Artistic-dist`) are retained as named licenses with their original scanner identifiers recorded, rather than replaced with invented SPDX values. Scanner file entries and Node's bundled npm tree make these counts different from lockfile component counts; the inventories overlap and must not be added together.

The [Dockerfile](Dockerfile) pins the official Node 22 bookworm-slim image index to `sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5`. Both probes report Node `22.23.2`, Debian 12 and three native Prisma executable copies with exact paths, sizes and SHA-256 hashes. The rendered image records Chromium/Chrome Headless Shell `153.0.8010.12`, Playwright browser revision `1243`, and FFmpeg revision `1011`; executable hashes are in its smoke report. A browser catalog entry alone is not proof that the corresponding browser was installed: the default image explicitly reports no browser files.

Runtime pruning retains the backend's direct dependencies and removes the Next/React build package trees, test runners, TypeScript, Tailwind tooling, concurrently and prettier; absence of eight named development/frontend packages is checked by the smoke probe. The original build manifest/lock and pruned runtime lock hashes are retained separately. Optional local `images:audit` requires the full development installation's Sharp package; it is not included in these pruned runtime targets.

Reproduce image evidence with the documented `docker:smoke` and `sbom:runtime` commands in [OPERATIONS.md](OPERATIONS.md). The local daemon's repository-digest metadata does not imply that an image was pushed to a registry. Temporary validation containers were removed; no production volume was used.

## Remaining inventory and validation limits

A later packaging correction copies `out/` as the runtime user, preserving readable ownership even for a mode-0600 snapshot pointer. An isolated September 8, 2026 probe at `17:41:44Z`, based on the recorded default image, reproduced `EACCES` with root ownership and succeeded with `COPY --chown=node:node` as UID 1000; temporary images were removed. This synthetic copy/read regression is not a rebuilt application image or replacement SBOM. The smoke script now also checks HTTP readability of the website, pointer and selected snapshot. Its [focused rerun on the recorded default image](sbom/runtime/sha256-aa977f37e52af9ebeb1af2d403fee8b82bbbc8d04f56d7b3a3e367cd6728737e.2026-09-08T17-42-51.928Z.smoke.json) passed website/pointer/snapshot checks plus isolated migration/authentication checks. Container snapshot export remains unsupported/default-off; shared SQLite collection and connected reloads are supported, while updating static snapshot bytes requires a host build and image rebuild.

- Source/npm and image SBOMs describe their recorded scopes; neither proves which code executes or fully inventories statically linked libraries. Hosting infrastructure and actual end-user browser packages are outside these artifacts.
- The digest-pinned base image and recorded installed packages improve traceability, but `apt` dependencies still resolve at image-build time. A later rebuild can differ until a reviewed Debian snapshot/package pinning policy is adopted.
- The two linux/arm64 image tests ran locally. Configured Windows and Ubuntu/amd64 CI require a GitHub run before claiming those platforms passed.
- Fresh npm audit results cover registry advisory metadata for the source dependency graph. No container OS/native/browser vulnerability scan or separate advisory scan of enriched bundle-only packages is claimed.
- Release generation now checks source/build/SBOM provenance and snapshot quality; regenerate image inventories and review dated advisory evidence for the exact release image. A local image inventory is not GitHub Pages publication or a registry deployment.
