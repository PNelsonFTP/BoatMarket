import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  rm,
  writeFile,
  readFile,
  symlink,
  mkdir,
  open,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeSeed } from "../lib/seed";
import { FIELDS } from "../lib/catalog";
import { DEFAULT_FILTERS, type Listing } from "../lib/types";
import { fieldValue, searchListings } from "../lib/search";
import {
  buildSearchCatalog,
  writeSearchCatalog,
  verifiedCatalogFiles,
} from "../server/snapshot-catalog";
import {
  createCatalogLoader,
  fetchVerifiedJson,
  searchCatalogSchema,
} from "../lib/snapshot-catalog";
const at = "2026-10-19T12:00:00.000Z";
const seeds = makeSeed();
const sample = (index = 0): Listing => ({
  ...seeds[index % seeds.length],
  id: `ad-${index}`,
  sourceListingId: `ad-${index}`,
  isSample: false,
  firstSeenAt: at,
  lastSeenAt: at,
  fieldProvenance: {
    length: [
      {
        value: 19,
        source: "Dealer",
        sourceUrl: "https://example.com/ad",
        observedAt: at,
        method: "source",
      },
    ],
  },
});
const body = (listings = [sample()]) =>
  JSON.stringify({ version: 1, generatedAt: at, listings });
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
it("preserves every searchable value, complete photo count, price history and grouped result", () => {
  const input = Array.from({ length: 80 }, (_, i) => sample(i));
  const built = buildSearchCatalog(body(input));
  expect(built.catalog.listings.every((l) => !("fieldProvenance" in l))).toBe(
    true,
  );
  for (let i = 0; i < input.length; i++)
    for (const field of FIELDS)
      expect(
        fieldValue(
          built.catalog.listings[i],
          field.key,
          DEFAULT_FILTERS,
          Date.parse(at),
        ),
        field.key,
      ).toEqual(
        fieldValue(input[i], field.key, DEFAULT_FILTERS, Date.parse(at)),
      );
  for (const filters of [
    DEFAULT_FILTERS,
    { ...DEFAULT_FILTERS, q: input[0].description.slice(0, 12) },
    {
      ...DEFAULT_FILTERS,
      criteria: { photoCount: { min: 2 }, priceDrop: { min: 0 } },
    },
  ])
    expect(
      searchListings(built.catalog.listings, filters, Date.parse(at)).map(
        (b) => b.id,
      ),
    ).toEqual(searchListings(input, filters, Date.parse(at)).map((b) => b.id));
  expect(buildSearchCatalog(body(input)).reference).toEqual(built.reference);
});
it("hydrates only requested immutable chunks, deduplicates requests, and reconstructs complete records", async () => {
  const input = Array.from({ length: 111 }, (_, i) => sample(i));
  const built = buildSearchCatalog(body(input));
  const fetcher = vi.fn(
    async (url: string | URL | Request) =>
      new Response(built.files.find((f) => String(url).endsWith(f.path))!.body),
  );
  const loader = createCatalogLoader(
    built.catalog,
    (p) => `https://example.com${p}`,
    fetcher as typeof fetch,
  );
  const first = await loader.load(["ad-0"]);
  expect(first.size).toBe(50);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await loader.load(["ad-3"]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const all = await loader.load(input.map((l) => l.id));
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(
    built.catalog.listings.map((l) => ({
      ...l,
      fieldProvenance: all.get(l.id),
    })),
  ).toEqual(input);
});
it("rejects corrupted or mismatched chunks and permits deliberate retry", async () => {
  const built = buildSearchCatalog(body());
  const file = built.files[1];
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(file.body + " "))
    .mockImplementation(async () => new Response(file.body));
  const loader = createCatalogLoader(built.catalog, (p) => p, fetcher);
  await expect(loader.load(["ad-0"])).rejects.toThrow("size");
  expect((await loader.load(["ad-0"])).size).toBe(1);
  await expect(
    fetchVerifiedJson("/bad", file.sha256, {
      fetcher: async () => new Response("tampered"),
    }),
  ).rejects.toThrow("integrity");
  await expect(
    fetchVerifiedJson("/huge", file.sha256, {
      maximumBytes: 4,
      fetcher: async () => new Response(file.body),
    }),
  ).rejects.toThrow("size");
});
it("validates membership and keeps private source evidence out of derived files", () => {
  const built = buildSearchCatalog(body());
  expect(() =>
    searchCatalogSchema.parse({
      ...built.catalog,
      details: [{ ...built.catalog.details[0], ids: ["missing"] }],
    }),
  ).toThrow("membership");
  expect(() =>
    buildSearchCatalog(
      body([{ ...sample(), rawPayload: { private: "do not publish" } }]),
    ),
  ).toThrow("privacy");
});
it("enforces the publication payload budget as inventories grow", () => {
  const records = Array.from({ length: 1000 }, (_, i) => ({
    ...sample(i),
    description: "x".repeat(9000),
  }));
  expect(() => buildSearchCatalog(body(records))).toThrow(
    "8 MiB publication budget",
  );
});
it("shares a four-request limit across overlapping detail loads", async () => {
  const input = Array.from({ length: 451 }, (_, i) => sample(i));
  const built = buildSearchCatalog(body(input));
  let active = 0,
    peak = 0;
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return new Response(
      built.files.find((f) => String(url).endsWith(f.path))!.body,
    );
  });
  const loader = createCatalogLoader(
    built.catalog,
    (p) => p,
    fetcher as typeof fetch,
  );
  await Promise.all([
    loader.load(input.slice(0, 201).map((l) => l.id)),
    loader.load(input.slice(200).map((l) => l.id)),
  ]);
  expect(peak).toBe(4);
  expect(fetcher).toHaveBeenCalledTimes(built.catalog.details.length);
});
it("bounds both connection waits and stalled response streams and supports cancellation", async () => {
  await expect(
    fetchVerifiedJson("/stalled-connect", "a".repeat(64), {
      timeoutMs: 15,
      fetcher: () => new Promise(() => {}),
    }),
  ).rejects.toThrow("timed out");
  const cancel = vi.fn();
  await expect(
    fetchVerifiedJson("/stalled-stream", "a".repeat(64), {
      timeoutMs: 15,
      fetcher: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("{"));
            },
            cancel,
          }),
        ),
    }),
  ).rejects.toThrow("timed out");
  expect(cancel).toHaveBeenCalledOnce();
  const controller = new AbortController();
  const request = fetchVerifiedJson("/cancel", "a".repeat(64), {
    signal: controller.signal,
    fetcher: () => new Promise(() => {}),
  });
  controller.abort();
  await expect(request).rejects.toThrow("cancelled");
});
it("verifies derived bytes against the entire canonical generation and refuses symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "boatscout-catalog-"));
  dirs.push(root);
  const canonical = body();
  const reference = await writeSearchCatalog(root, canonical);
  const files = await verifiedCatalogFiles(root, reference, canonical);
  expect(files).toHaveLength(2);
  await expect(
    verifiedCatalogFiles(root, reference, body([sample(2)])),
  ).rejects.toThrow("reviewed snapshot");
  const chunk = files[1];
  await writeFile(join(root, chunk.path), "corrupt");
  await expect(
    verifiedCatalogFiles(root, reference, canonical),
  ).rejects.toThrow("integrity");
  const alias = root + "-alias";
  dirs.push(alias);
  await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
  await expect(writeSearchCatalog(alias, canonical)).rejects.toThrow("symlink");
});

it("refuses user-controlled symlink ancestors while allowing macOS system temp aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "boatscout-catalog-parent-"));
  dirs.push(root);
  const actual = join(root, "actual");
  await mkdir(join(actual, "public"), { recursive: true });
  const link = join(root, "linked-parent");
  await symlink(
    actual,
    link,
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(
    writeSearchCatalog(join(link, "public"), body()),
  ).rejects.toThrow("ancestor cannot be a symlink");
  const normal = join(actual, "public");
  const reference = await writeSearchCatalog(normal, body());
  expect(
    (await verifiedCatalogFiles(normal, reference, body())).length,
  ).toBeGreaterThan(0);
  if (process.platform === "darwin") {
    const aliasRoot = await mkdtemp("/tmp/boatscout-catalog-system-alias-");
    dirs.push(aliasRoot);
    const reference = await writeSearchCatalog(
      join(aliasRoot, "public"),
      body(),
    );
    expect(
      (await verifiedCatalogFiles(join(aliasRoot, "public"), reference, body()))
        .length,
    ).toBeGreaterThan(0);
  }
});

it("rejects an oversized on-disk shard before allocating its contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "boatscout-catalog-size-"));
  dirs.push(root);
  const canonical = body(),
    reference = await writeSearchCatalog(root, canonical);
  const files = await verifiedCatalogFiles(root, reference, canonical);
  const shard = files.find((file) => file.path.startsWith("catalog-details/"))!;
  const handle = await open(join(root, shard.path), "r+");
  try {
    await handle.truncate(shard.bytes + 32 * 1024 * 1024);
  } finally {
    await handle.close();
  }
  await expect(
    verifiedCatalogFiles(root, reference, canonical),
  ).rejects.toThrow("integrity size mismatch");
});
