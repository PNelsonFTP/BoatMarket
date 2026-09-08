import { realpath } from "node:fs/promises";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { readFile, mkdir, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const root = mkdtempSync(join(tmpdir(), "boatscout-parser-"));
process.env.DATABASE_URL = `file:${join(root, "test.db")}`;
process.env.SOURCE_CONFIG = join(root, "sources.json");
process.env.SOURCE_REVIEW_DIR = join(root, "reviews");
process.env.EVIDENCE_ARCHIVE_DIR = join(root, "evidence");
process.env.REFRESH_BACKUP_DIR = join(root, "backups");
const { db } = await import("../server/db");
const {
  previewSourceParse,
  applySourceParse,
  parserHash,
  captureSourceFixture,
} = await import("../server/source-tools");
const { redactFixture, archiveEvidence, contentHash } =
  await import("../server/evidence");
const { upsertListing } = await import("../server/repository");
const { listingSchema } = await import("../lib/types");
const url = "https://dealer.example/inventory";
const html = (price = 22000) =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "2020 Lund Pro V", sku: "boat", url: "https://dealer.example/boat", offers: { price, priceCurrency: "USD" } })}</script>`;
const request = () => ({
  sourceId: "dealer",
  url,
  observedAt: new Date().toISOString(),
  html: html(),
});
beforeAll(async () => {
  writeFileSync(join(root, "test.db"), "");
  const migrated = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: process.env, encoding: "utf8" },
  );
  if (migrated.status !== 0) throw new Error(migrated.stdout + migrated.stderr);
  const attached = await db.$queryRawUnsafe<{ file: string; name: string }[]>(
    "PRAGMA database_list",
  );
  expect(
    await realpath(attached.find((entry) => entry.name === "main")!.file),
  ).toBe(await realpath(join(root, "test.db")));
});
beforeEach(async () => {
  await db.listing.deleteMany();
  await db.jobLock.deleteMany();
  writeFileSync(
    process.env.SOURCE_CONFIG!,
    JSON.stringify([
      {
        id: "dealer",
        name: "Dealer",
        adapter: "dealer",
        enabled: true,
        urls: [url],
      },
    ]),
  );
});
afterAll(async () => {
  await db.$disconnect();
  rmSync(root, { recursive: true, force: true });
});
it("previews exact field differences without writes and applies only an unchanged reviewed plan", async () => {
  const preview = await previewSourceParse(request());
  expect(preview.applyAllowed).toBe(true);
  expect(await db.listing.count()).toBe(0);
  const result = await applySourceParse(preview.reviewHash);
  expect(result.status).toBe("success");
  expect(await db.listing.count()).toBe(1);
  expect((await db.listing.findFirst())?.price).toBe(22000);
  await expect(applySourceParse(preview.reviewHash)).rejects.toThrow("changed");
});
it("rejects changed records, configuration, and old or empty captures before applying", async () => {
  const preview = await previewSourceParse(request());
  await upsertListing(
    listingSchema.parse({ ...preview.preview[0], price: 23000 }),
  );
  await expect(applySourceParse(preview.reviewHash)).rejects.toThrow("changed");
  expect((await db.listing.findFirst())?.price).toBe(23000);
  const historical = await previewSourceParse({
    ...request(),
    observedAt: "2020-01-01T00:00:00.000Z",
  });
  expect(historical.applyAllowed).toBe(false);
  const empty = await previewSourceParse({
    ...request(),
    html: "<html></html>",
  });
  expect(empty.applyAllowed).toBe(false);
  await expect(applySourceParse(empty.reviewHash)).rejects.toThrow("Quality");
});
it("enforces source quality thresholds and keeps immutable evidence while redacting shared fixtures", async () => {
  writeFileSync(
    process.env.SOURCE_CONFIG!,
    JSON.stringify([
      {
        id: "dealer",
        name: "Dealer",
        adapter: "dealer",
        urls: [url],
        quality: { minRecords: 2 },
      },
    ]),
  );
  const preview = await previewSourceParse(request());
  expect(preview.applyAllowed).toBe(false);
  expect(await db.listing.count()).toBe(0);
  const old = await archiveEvidence(url, "first", new Date().toISOString()),
    current = await archiveEvidence(url, "second", new Date().toISOString());
  expect(old.sha256).not.toBe(current.sha256);
  expect(await readFile(old.objectPath, "utf8")).toBe("first");
  expect(
    redactFixture('me@example.com 630-555-1234 "api_key":"secret"'),
  ).not.toMatch(/me@example|630-555|secret/);
});

it("includes canonical schema/library changes in the reviewed parser fingerprint", async () => {
  const actual = await parserHash();
  const changed = await parserHash({
    read: (async (path: unknown) =>
      String(path) === "lib/types.ts"
        ? Buffer.from("different canonical schema")
        : readFile(String(path))) as typeof readFile,
  });
  expect(changed).not.toBe(actual);
});
it("preserves the actual cache observation time during permitted fixture capture", async () => {
  process.env.COLLECTION_CACHE_DIR = join(root, "cache");
  await mkdir(process.env.COLLECTION_CACHE_DIR, { recursive: true });
  const cached = join(
    process.env.COLLECTION_CACHE_DIR,
    contentHash(url) + ".html",
  );
  await writeFile(cached, html());
  const observedAt = new Date(Date.now() - 3600000);
  await utimes(cached, observedAt, observedAt);
  const result = await captureSourceFixture({
    sourceId: "dealer",
    url,
    target: join(root, "fixture.html"),
  });
  const provenance = JSON.parse(
    await readFile(result.target + ".provenance.json", "utf8"),
  );
  expect(provenance.provenance.observedAt).toBe(observedAt.toISOString());
  expect(await db.jobLock.count()).toBe(0);
});
