import { z } from "zod";
import { listingSchema, type Listing } from "./types";
export const IMPORT_MAX_BYTES = 12 * 1024 * 1024;
export const IMPORT_MAX_ITEMS = 1000;
export const listingImportSchema = z.object({
  generatedAt: z.string().datetime().optional(),
  listings: z
    .array(listingSchema)
    .min(1)
    .max(10000)
    .superRefine((items, context) => {
      const ids = new Set<string>();
      const identities = new Set<string>();
      for (const [index, item] of items.entries()) {
        const identity = JSON.stringify([item.source, item.sourceListingId]);
        if (ids.has(item.id) || identities.has(identity))
          context.addIssue({
            code: "custom",
            path: [index],
            message: "Listing IDs and source identities must be unique",
          });
        ids.add(item.id);
        identities.add(identity);
      }
    }),
});
export function parseListingImport(value: unknown) {
  return listingImportSchema.parse(
    Array.isArray(value) ? { listings: value } : value,
  );
}
export function importChunks(
  listings: Listing[],
  maxItems = IMPORT_MAX_ITEMS,
  maxBytes = IMPORT_MAX_BYTES,
): Listing[][] {
  const chunks: Listing[][] = [];
  let chunk: Listing[] = [],
    bytes = new TextEncoder().encode('{"listings":[]}').length;
  const emptyBytes = bytes;
  for (const listing of listings) {
    const size = new TextEncoder().encode(JSON.stringify(listing)).length;
    if (size + emptyBytes > maxBytes)
      throw new Error(`Listing ${listing.id} exceeds the request size limit`);
    if (
      chunk.length &&
      (chunk.length >= maxItems || bytes + size + 1 > maxBytes)
    ) {
      chunks.push(chunk);
      chunk = [];
      bytes = emptyBytes;
    }
    bytes += size + (chunk.length ? 1 : 0);
    chunk.push(listing);
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}
export type ImportChunkResult = {
  new: number;
  updated: number;
  acceptedIds: string[];
  idMap: Record<string, string>;
  failed: { id: string; error: string }[];
  unattemptedIds?: string[];
};
export type ImportManifest = {
  version: 1;
  startedAt: string;
  finishedAt?: string;
  backend: string;
  total: number;
  chunks: number;
  completedChunks: number;
  new: number;
  updated: number;
  acceptedIds: string[];
  idMap: Record<string, string>;
  failed: { id: string; error: string }[];
  uncertainIds: string[];
  unattemptedIds: string[];
};
export async function runListingImport(
  listings: Listing[],
  backend: string,
  send: (listings: Listing[]) => Promise<ImportChunkResult>,
  onProgress: (manifest: ImportManifest) => void = () => {},
): Promise<ImportManifest> {
  const chunks = importChunks(listings);
  const manifest: ImportManifest = {
    version: 1,
    startedAt: new Date().toISOString(),
    backend,
    total: listings.length,
    chunks: chunks.length,
    completedChunks: 0,
    new: 0,
    updated: 0,
    acceptedIds: [],
    idMap: Object.create(null),
    failed: [],
    uncertainIds: [],
    unattemptedIds: listings.map((l) => l.id),
  };
  const progress = () =>
    onProgress({
      ...manifest,
      acceptedIds: [...manifest.acceptedIds],
      failed: [...manifest.failed],
      idMap: { ...manifest.idMap },
      uncertainIds: [...manifest.uncertainIds],
      unattemptedIds: [...manifest.unattemptedIds],
    });
  progress();
  for (const chunk of chunks) {
    const chunkIds = new Set(chunk.map((l) => l.id));
    try {
      const result = await send(chunk);
      // A malformed/old API response cannot establish which records were written.
      if (
        !Array.isArray(result.acceptedIds) ||
        !Array.isArray(result.failed) ||
        !result.idMap
      )
        throw new Error(
          "Backend does not report per-listing outcomes; refresh to reconcile before retrying",
        );
      const reportedIds = [
        ...result.acceptedIds,
        ...result.failed.map((v) => v.id),
        ...(result.unattemptedIds || []),
      ];
      if (
        reportedIds.length !== chunk.length ||
        new Set(reportedIds).size !== chunk.length ||
        reportedIds.some((id) => !chunkIds.has(id)) ||
        result.acceptedIds.some(
          (id) =>
            !Object.hasOwn(result.idMap, id) ||
            typeof result.idMap[id] !== "string" ||
            !result.idMap[id],
        )
      )
        throw new Error(
          "Backend returned inconsistent import outcomes; refresh to reconcile before retrying",
        );
      manifest.acceptedIds.push(...result.acceptedIds);
      Object.assign(manifest.idMap, result.idMap);
      manifest.failed.push(...result.failed);
      manifest.new += result.new;
      manifest.updated += result.updated;
      const attempted = new Set([
        ...result.acceptedIds,
        ...result.failed.map((v) => v.id),
      ]);
      manifest.unattemptedIds = manifest.unattemptedIds.filter(
        (id) => !attempted.has(id),
      );
      if (result.failed.length || result.unattemptedIds?.length) {
        progress();
        break;
      }
      manifest.completedChunks++;
      progress();
    } catch (error) {
      // A timeout may follow a committed write. Do not falsely label it as a rollback.
      manifest.uncertainIds.push(...chunkIds);
      manifest.failed.push({
        id: `chunk-${manifest.completedChunks + 1}`,
        error: (error as Error).message,
      });
      manifest.unattemptedIds = manifest.unattemptedIds.filter(
        (id) => !chunkIds.has(id),
      );
      progress();
      break;
    }
  }
  manifest.finishedAt = new Date().toISOString();
  progress();
  return manifest;
}
/** Source identity wins over an exported ID when joining two browser datasets. */
export function mergeListingImport(existing: Listing[], incoming: Listing[]) {
  const byId = new Map(existing.map((listing) => [listing.id, listing]));
  const identities = new Map(
    existing.map((listing) => [
      JSON.stringify([listing.source, listing.sourceListingId]),
      listing.id,
    ]),
  );
  const idMap: Record<string, string> = Object.create(null);
  for (const listing of incoming) {
    const identity = JSON.stringify([listing.source, listing.sourceListingId]);
    const oldId = identities.get(identity);
    const persistedId = oldId || listing.id;
    const old = byId.get(persistedId);
    if (old && JSON.stringify([old.source, old.sourceListingId]) !== identity)
      throw new Error(
        `Listing ID ${listing.id} belongs to a different source identity. Correct the file before importing.`,
      );
    byId.set(persistedId, { ...listing, id: persistedId });
    identities.set(identity, persistedId);
    idMap[listing.id] = persistedId;
  }
  return { listings: [...byId.values()], idMap };
}
