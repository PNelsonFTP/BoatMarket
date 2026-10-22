import { z } from "zod";
import { listingSchema, type Listing } from "./types";
import { measureWork } from "./performance";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const catalogReferenceSchema = z
  .object({
    version: z.literal(1),
    path: z.string().regex(/^catalogs\/[a-f0-9]{64}\.json$/),
    sha256: digestSchema,
    snapshotHash: digestSchema,
  })
  .strict()
  .refine(
    (v) => v.path === `catalogs/${v.sha256}.json`,
    "Catalog path/hash mismatch",
  );
export type CatalogReference = z.infer<typeof catalogReferenceSchema>;
export const catalogDetailReferenceSchema = z
  .object({
    path: z.string().regex(/^catalog-details\/[a-f0-9]{64}\.json$/),
    sha256: digestSchema,
    bytes: z
      .number()
      .int()
      .positive()
      .max(16 * 1024 * 1024),
    ids: z.array(z.string().min(1).max(200)).min(1).max(50),
  })
  .strict()
  .refine(
    (v) => v.path === `catalog-details/${v.sha256}.json`,
    "Detail path/hash mismatch",
  );
export const searchCatalogSchema = z
  .object({
    version: z.literal(1),
    snapshotHash: digestSchema,
    generatedAt: z.string().datetime().optional(),
    listings: z
      .array(listingSchema.omit({ fieldProvenance: true }))
      .min(1)
      .max(10000),
    details: z.array(catalogDetailReferenceSchema).max(10000),
  })
  .strict()
  .superRefine((catalog, context) => {
    const ids = new Set(catalog.listings.map((l) => l.id));
    if (ids.size !== catalog.listings.length)
      context.addIssue({
        code: "custom",
        message: "Duplicate catalog listing IDs",
      });
    const seen = new Set<string>();
    const paths = new Set<string>();
    for (const chunk of catalog.details) {
      if (paths.has(chunk.path))
        context.addIssue({ code: "custom", message: "Duplicate detail chunk" });
      paths.add(chunk.path);
      for (const id of chunk.ids) {
        if (!ids.has(id) || seen.has(id))
          context.addIssue({
            code: "custom",
            message: "Invalid catalog detail membership",
          });
        seen.add(id);
      }
    }
  });
export type SearchCatalog = z.infer<typeof searchCatalogSchema>;
export const catalogDetailsSchema = z
  .object({
    version: z.literal(1),
    snapshotHash: digestSchema,
    listings: z
      .array(listingSchema.pick({ id: true, fieldProvenance: true }))
      .min(1)
      .max(50),
  })
  .strict();

export async function sha256Text(body: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function fetchVerifiedJson(
  url: string,
  sha256: string,
  options: {
    fetcher?: typeof fetch;
    bytes?: number;
    maximumBytes?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<unknown> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () =>
    controller.abort(new Error("Snapshot data loading was cancelled"));
  if (options.signal?.aborted)
    throw new Error("Snapshot data loading was cancelled");
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(
        new Error("Snapshot data loading timed out; retry when connected"),
      ),
    options.timeoutMs ?? 30000,
  );
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      void reader?.cancel().catch(() => {});
      reject(controller.signal.reason);
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([
      aborted,
      (async () => {
        const response = await (options.fetcher ?? fetch)(url, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          throw controller.signal.reason;
        }
        if (!response.ok) throw new Error("Snapshot data could not be loaded");
        const maximum = options.maximumBytes ?? 16 * 1024 * 1024;
        const declared = Number(response.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > maximum) {
          void response.body?.cancel().catch(() => {});
          throw new Error("Snapshot data exceeds its supported size");
        }
        reader = response.body?.getReader();
        let body: string;
        if (reader) {
          const decoder = new TextDecoder();
          const pieces: string[] = [];
          let size = 0;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > maximum)
                throw new Error("Snapshot data exceeds its supported size");
              pieces.push(decoder.decode(value, { stream: true }));
            }
            pieces.push(decoder.decode());
            body = pieces.join("");
          } catch (error) {
            void reader.cancel().catch(() => {});
            throw error;
          }
        } else body = await response.text();
        const size = new TextEncoder().encode(body).length;
        if (size > maximum || (options.bytes != null && options.bytes !== size))
          throw new Error("Snapshot data size does not match its manifest");
        if ((await sha256Text(body)) !== sha256)
          throw new Error("Snapshot data failed its integrity check");
        return measureWork("json-parse", () => JSON.parse(body));
      })(),
    ]);
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", onAbort);
    options.signal?.removeEventListener("abort", cancel);
    try {
      reader?.releaseLock();
    } catch {
      /* An aborted reader may still be settling. */
    }
  }
}

/** Hydration is generation-scoped; a rejected chunk is evicted so a deliberate retry can recover. */
export function createCatalogLoader(
  catalog: SearchCatalog,
  assetPath: (path: string) => string,
  fetcher: typeof fetch = fetch,
) {
  const chunks = new Map(
    catalog.details.flatMap((chunk) =>
      chunk.ids.map((id) => [id, chunk] as const),
    ),
  );
  const pending = new Map<
    string,
    Promise<Map<string, Listing["fieldProvenance"]>>
  >();
  let active = 0;
  const waiting: Array<() => void> = [];
  async function bounded<T>(work: () => Promise<T>): Promise<T> {
    if (active < 4) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next)
        next(); // Transfer the reserved slot before accepting new work.
      else active--;
    }
  }
  async function load(ids: string[]) {
    const selected = [
      ...new Map(
        ids.flatMap((id) => {
          const chunk = chunks.get(id);
          return chunk ? [[chunk.path, chunk] as const] : [];
        }),
      ).values(),
    ];
    const output = new Map<string, Listing["fieldProvenance"]>();
    // The limit belongs to this generation, including overlapping dialogs and exports.
    await Promise.all(
      selected.map(async (chunk) => {
        let request = pending.get(chunk.path);
        if (!request) {
          request = bounded(async () => {
            const details = catalogDetailsSchema.parse(
              await fetchVerifiedJson(
                assetPath(`/${chunk.path}`),
                chunk.sha256,
                { fetcher, bytes: chunk.bytes },
              ),
            );
            if (
              details.snapshotHash !== catalog.snapshotHash ||
              new Set(details.listings.map((l) => l.id)).size !==
                details.listings.length ||
              JSON.stringify(details.listings.map((l) => l.id).sort()) !==
                JSON.stringify([...chunk.ids].sort())
            )
              throw new Error(
                "Snapshot detail generation or membership mismatch",
              );
            return new Map(
              details.listings.map((l) => [l.id, l.fieldProvenance]),
            );
          });
          pending.set(chunk.path, request);
          request.catch(() => pending.delete(chunk.path));
        }
        for (const [id, value] of await request) output.set(id, value);
      }),
    );
    return output;
  }
  return { snapshotHash: catalog.snapshotHash, load };
}
