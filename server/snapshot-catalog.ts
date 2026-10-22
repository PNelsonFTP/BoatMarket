import { createHash } from "node:crypto";
import { mkdir, lstat, readFile, writeFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseListingImport } from "../lib/import-listings";
import {
  catalogReferenceSchema,
  searchCatalogSchema,
  type CatalogReference,
} from "../lib/snapshot-catalog";

const hash = (body: string | Buffer) =>
  createHash("sha256").update(body).digest("hex");
export const SEARCH_CATALOG_MAX_BYTES = 8 * 1024 * 1024;
export type CatalogFile = {
  path: string;
  sha256: string;
  bytes: number;
  body: string;
};
export function buildSearchCatalog(canonicalBody: string) {
  const snapshot = parseListingImport(JSON.parse(canonicalBody));
  for (const listing of snapshot.listings)
    if (
      listing.rawPayload !== undefined ||
      listing.locationOverride ||
      listing.sourceLocation ||
      listing.routeEstimate
    )
      throw new Error("Catalog requires a privacy-reviewed public snapshot");
  const snapshotHash = hash(canonicalBody);
  const files: CatalogFile[] = [];
  const details = [];
  const rich = snapshot.listings.filter(
    (l) => l.fieldProvenance && Object.keys(l.fieldProvenance).length,
  );
  for (let offset = 0; offset < rich.length; offset += 50) {
    const listings = rich
      .slice(offset, offset + 50)
      .map(({ id, fieldProvenance }) => ({ id, fieldProvenance }));
    const body = JSON.stringify({ version: 1, snapshotHash, listings });
    const sha256 = hash(body);
    const file = {
      path: `catalog-details/${sha256}.json`,
      sha256,
      bytes: Buffer.byteLength(body),
      body,
    };
    files.push(file);
    details.push({
      path: file.path,
      sha256,
      bytes: file.bytes,
      ids: listings.map((l) => l.id),
    });
  }
  const catalog = searchCatalogSchema.parse({
    version: 1,
    snapshotHash,
    ...(snapshot.generatedAt ? { generatedAt: snapshot.generatedAt } : {}),
    listings: snapshot.listings.map(
      ({ fieldProvenance: _, ...listing }) => listing,
    ),
    details,
  });
  const body = JSON.stringify(catalog);
  if (Buffer.byteLength(body) > SEARCH_CATALOG_MAX_BYTES)
    throw new Error(
      "Search catalog exceeds 8 MiB publication budget; review payload growth before publishing",
    );
  const sha256 = hash(body);
  const reference: CatalogReference = {
    version: 1,
    path: `catalogs/${sha256}.json`,
    sha256,
    snapshotHash,
  };
  files.unshift({
    path: reference.path,
    sha256,
    bytes: Buffer.byteLength(body),
    body,
  });
  return { reference, catalog, files };
}
async function safeFile(directory: string, relative: string) {
  const root = resolve(directory);
  try {
    if ((await lstat(root)).isSymbolicLink())
      throw new Error("Catalog directory cannot be a symlink");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // macOS exposes system-owned /var and /tmp aliases. Allow only those exact
  // canonical targets; a symlink elsewhere in the supplied ancestry is unsafe.
  const systemAliases = new Map(
    process.platform === "darwin"
      ? [
          ["/var", "/private/var"],
          ["/tmp", "/private/tmp"],
        ]
      : [],
  );
  for (let ancestor = dirname(root); ; ancestor = dirname(ancestor)) {
    try {
      if (
        (await lstat(ancestor)).isSymbolicLink() &&
        (!systemAliases.has(ancestor) ||
          (await realpath(ancestor)) !== systemAliases.get(ancestor))
      )
        throw new Error(
          `Catalog directory ancestor cannot be a symlink: ${ancestor}`,
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (dirname(ancestor) === ancestor) break;
  }
  let p = root;
  for (const part of relative.split("/")) {
    p = join(p, part);
    try {
      if ((await lstat(p)).isSymbolicLink())
        throw new Error("Catalog files cannot use symlinks");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return p;
}
export async function writeSearchCatalog(
  publicDirectory: string,
  canonicalBody: string,
) {
  const built = buildSearchCatalog(canonicalBody);
  for (const file of built.files) {
    const destination = await safeFile(publicDirectory, file.path);
    await mkdir(join(publicDirectory, file.path.split("/")[0]), {
      recursive: true,
    });
    try {
      await writeFile(destination, file.body, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (hash(await readFile(destination)) !== file.sha256)
      throw new Error("Immutable catalog hash mismatch; activation refused");
  }
  return built.reference;
}
/** Recompute the full derived graph from reviewed canonical bytes; hashing only an untrusted pointer is insufficient. */
export async function verifiedCatalogFiles(
  publicDirectory: string,
  reference: unknown,
  canonicalBody: string,
) {
  if (reference == null) return [];
  const actual = catalogReferenceSchema.parse(reference);
  const expected = buildSearchCatalog(canonicalBody);
  if (JSON.stringify(actual) !== JSON.stringify(expected.reference))
    throw new Error("Catalog does not match the reviewed snapshot");
  for (const file of expected.files) {
    const path = await safeFile(publicDirectory, file.path);
    const info = await lstat(path);
    if (!info.isFile() || info.size !== file.bytes)
      throw new Error(`Catalog integrity size mismatch: ${file.path}`);
    if (hash(await readFile(path)) !== file.sha256)
      throw new Error(`Catalog integrity mismatch: ${file.path}`);
  }
  return expected.files.map(({ body: _, ...file }) => file);
}
