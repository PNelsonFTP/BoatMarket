import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { atomicJson } from "./refresh-report";
const entrySchema = z.object({
  lastAttemptAt: z.string().datetime().nullable(),
  lastSuccessAt: z.string().datetime().nullable(),
  failures: z.number().int().nonnegative(),
  nextAttemptAt: z.string().datetime().nullable(),
});
export type EnrichmentEntry = z.infer<typeof entrySchema>;
export type EnrichmentState = {
  version: 1;
  sourceId: string;
  entries: Record<string, EnrichmentEntry>;
};
const directory = () => process.env.ENRICHMENT_STATE_DIR || "data/enrichment";
const file = (id: string) => {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid source ID");
  return join(directory(), id + ".json");
};
export async function readEnrichmentState(
  sourceId: string,
): Promise<EnrichmentState> {
  try {
    return z
      .object({
        version: z.literal(1),
        sourceId: z.literal(sourceId),
        entries: z.record(entrySchema),
      })
      .parse(JSON.parse(await readFile(file(sourceId), "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { version: 1, sourceId, entries: {} };
    throw e;
  }
}
export async function saveEnrichmentState(state: EnrichmentState) {
  await atomicJson(file(state.sourceId), state);
}
export function selectDetailWork(
  urls: string[],
  state: EnrichmentState,
  budget: number,
  now = Date.now(),
) {
  const unique = [...new Set(urls)];
  const due = unique.filter(
    (url) =>
      !state.entries[url]?.nextAttemptAt ||
      Date.parse(state.entries[url].nextAttemptAt!) <= now,
  );
  due.sort(
    (a, b) =>
      (Date.parse(state.entries[a]?.lastSuccessAt || "") || 0) -
        (Date.parse(state.entries[b]?.lastSuccessAt || "") || 0) ||
      (Date.parse(state.entries[a]?.lastAttemptAt || "") || 0) -
        (Date.parse(state.entries[b]?.lastAttemptAt || "") || 0) ||
      a.localeCompare(b),
  );
  return {
    selected: new Set(due.slice(0, budget)),
    deferred: Math.max(0, due.length - budget),
    backoff: unique.length - due.length,
  };
}
export function recordDetailAttempt(
  state: EnrichmentState,
  url: string,
  success: boolean,
  now = new Date(),
) {
  const previous = state.entries[url],
    failures = success ? 0 : (previous?.failures || 0) + 1;
  state.entries[url] = {
    lastAttemptAt: now.toISOString(),
    lastSuccessAt: success
      ? now.toISOString()
      : previous?.lastSuccessAt || null,
    failures,
    nextAttemptAt: success
      ? null
      : new Date(
          now.getTime() +
            Math.min(24 * 3600000, 5 * 60000 * 2 ** Math.min(failures - 1, 10)),
        ).toISOString(),
  };
}
