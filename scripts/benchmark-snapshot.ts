import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parseListingImport } from "../lib/import-listings";
import { searchCatalogSchema } from "../lib/snapshot-catalog";
import { FIELDS } from "../lib/catalog";
import { fieldValue, searchListings } from "../lib/search";
import { DEFAULT_FILTERS, type Filters, type Listing } from "../lib/types";
import {
  buildSearchCatalog,
  SEARCH_CATALOG_MAX_BYTES,
} from "../server/snapshot-catalog";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "npm run benchmark:snapshot -- [--snapshot=public/snapshot.json] [--output=data/benchmarks/snapshot.json]\nRead-only payload, JSON parse, schema, heap and filter-equivalence measurements. The optional report is private. Browser desktop/mobile cold-load measurements are attached by npm run test:production. No network collection or snapshot activation.",
  );
} else {
  try {
    for (const arg of args)
      if (!/^--(?:snapshot|output)=.+$/.test(arg))
        throw new Error(`Unknown argument ${arg}`);
    const value = (key: string) =>
      args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
    const canonicalBody = await readFile(
      value("snapshot") || "public/snapshot.json",
      "utf8",
    );
    const canonical = parseListingImport(JSON.parse(canonicalBody));
    const now = canonical.generatedAt
      ? Date.parse(canonical.generatedAt)
      : Date.now();
    const filters: Filters[] = [
      DEFAULT_FILTERS,
      { ...DEFAULT_FILTERS, q: canonical.listings[0]?.make || "Lund" },
      {
        ...DEFAULT_FILTERS,
        criteria: {
          horsepower: { min: 150, max: 250 },
          price: { min: 20000, max: 85000 },
          photoCount: { min: 3 },
          priceDrop: { min: 1 },
        },
      },
      {
        ...DEFAULT_FILTERS,
        sort: "distance",
        reference: { lat: 41.618, lng: -88.668 },
        areas: [
          {
            id: "near",
            name: "Nearby",
            kind: "radius",
            lat: 41.618,
            lng: -88.668,
            radius: 250,
          },
        ],
      },
      {
        ...DEFAULT_FILTERS,
        excludeUnknown: true,
        criteria: { length: { max: 20 }, engineHours: { max: 500 } },
      },
    ];
    function measure<T>(work: () => T, repeats = 5) {
      const times: number[] = [];
      let heapGrowthBytes = 0;
      for (let i = 0; i < repeats; i++) {
        const before = process.memoryUsage().heapUsed,
          started = performance.now();
        work();
        times.push(performance.now() - started);
        heapGrowthBytes = Math.max(
          heapGrowthBytes,
          process.memoryUsage().heapUsed - before,
        );
      }
      times.sort((a, b) => a - b);
      return {
        medianMs: +times[Math.floor(times.length / 2)].toFixed(2),
        maximumMs: +times.at(-1)!.toFixed(2),
        heapGrowthBytes,
        repeats,
      };
    }
    const signature = (records: Listing[], filter: Filters) =>
      JSON.stringify(searchListings(records, filter, now), (key, value) =>
        key === "fieldProvenance" ? undefined : value,
      );
    function scenario(listings: Listing[], body: string) {
      const built = buildSearchCatalog(body),
        catalogBody = built.files[0].body;
      for (let i = 0; i < listings.length; i++)
        for (const field of FIELDS)
          if (
            JSON.stringify(
              fieldValue(listings[i], field.key, DEFAULT_FILTERS, now),
            ) !==
            JSON.stringify(
              fieldValue(
                built.catalog.listings[i],
                field.key,
                DEFAULT_FILTERS,
                now,
              ),
            )
          )
            throw new Error(
              `Search field mismatch: ${listings[i].id}/${field.key}`,
            );
      for (const filter of filters)
        if (
          signature(listings, filter) !==
          signature(built.catalog.listings, filter)
        )
          throw new Error("Search/filter/group result mismatch");
      const bytes = Buffer.byteLength(body),
        compactBytes = Buffer.byteLength(JSON.stringify(JSON.parse(body)));
      return {
        listings: listings.length,
        canonicalBytes: bytes,
        compactCanonicalBytes: compactBytes,
        initialCatalogBytes: Buffer.byteLength(catalogBody),
        detailChunks: built.catalog.details.length,
        detailBytes: built.files
          .slice(1)
          .reduce((sum, file) => sum + file.bytes, 0),
        initialReductionFromFormattedPercent: +(
          100 *
          (1 - Buffer.byteLength(catalogBody) / bytes)
        ).toFixed(2),
        initialReductionFromCompactPercent: +(
          100 *
          (1 - Buffer.byteLength(catalogBody) / compactBytes)
        ).toFixed(2),
        full: {
          parse: measure(() => JSON.parse(body)),
          validate: measure(() => parseListingImport(JSON.parse(body))),
          filters: measure(() =>
            filters.forEach((f) => searchListings(listings, f, now)),
          ),
        },
        catalog: {
          parse: measure(() => JSON.parse(catalogBody)),
          validate: measure(() =>
            searchCatalogSchema.parse(JSON.parse(catalogBody)),
          ),
          filters: measure(() =>
            filters.forEach((f) =>
              searchListings(built.catalog.listings, f, now),
            ),
          ),
        },
        fieldAndFilterEquivalence: "passed",
      };
    }
    const current = scenario(canonical.listings, canonicalBody);
    if (current.initialReductionFromCompactPercent < 50)
      throw new Error(
        "Current snapshot misses the 50% initial-payload reduction budget",
      );
    const count = Math.ceil(canonical.listings.length * 1.25);
    const larger = Array.from({ length: count }, (_, i) => ({
      ...canonical.listings[i % canonical.listings.length],
      id: `growth-${i}`,
      sourceListingId: `growth-${i}`,
      groupId: null,
      vesselId: null,
    }));
    const growth = scenario(
      larger,
      JSON.stringify({
        version: 1,
        generatedAt: canonical.generatedAt,
        listings: larger,
      }),
    );
    const ceilingRecords = Array.from({ length: 10000 }, (_, i) => ({
      ...canonical.listings[i % canonical.listings.length],
      id: `ceiling-${i}`,
      sourceListingId: `ceiling-${i}`,
      groupId: null,
      vesselId: null,
    }));
    let ceilingOutcome = "fits publication budget";
    try {
      buildSearchCatalog(
        JSON.stringify({
          version: 1,
          generatedAt: canonical.generatedAt,
          listings: ceilingRecords,
        }),
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("8 MiB publication budget")
      )
        throw error;
      ceilingOutcome =
        "publication safely refused at 8 MiB; further search partitioning required";
    }
    const report = {
      measuredAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      snapshotGeneratedAt: canonical.generatedAt,
      catalogBudgetBytes: SEARCH_CATALOG_MAX_BYTES,
      current,
      growth,
      tenThousandRecords: ceilingOutcome,
      processMaximumRssBytes: process.resourceUsage().maxRSS * 1024,
      limitations:
        "Node measurements, not mobile timings or production transfer/compression. Five repeats are observational, not a timing SLA. Heap deltas include GC noise and are not peak heap. Playwright desktop/mobile cold-load comparisons are separate attached evidence. No seller observations were refreshed.",
    };
    const output = value("output");
    if (output) {
      if (resolve(output).startsWith(resolve("public") + "/"))
        throw new Error("Benchmark receipts must stay outside public/");
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
