import { z } from "zod";
import {
  pointSchema,
  ruleSchema,
  savedSearchSchema,
  type Workspace,
} from "./types";
const id = z.string().min(1).max(200);
export const workspaceRestoreSchema = z
  .object({
    favorites: z.array(id).max(5000),
    notes: z
      .record(id, z.string().max(20000))
      .refine((v) => Object.keys(v).length <= 5000, "Too many notes"),
    savedSearches: z.array(savedSearchSchema).max(200),
    rules: z.array(ruleSchema).max(100),
    alerts: z
      .array(
        z.object({
          id,
          title: z.string().max(1000),
          body: z.string().max(20000),
          createdAt: z.string().datetime(),
          read: z.boolean(),
          listingIds: z.array(id).max(5000),
        }),
      )
      .max(500),
    referencePoints: z
      .array(pointSchema.extend({ name: z.string().min(1).max(100) }))
      .max(30),
  })
  .superRefine((workspace, context) => {
    for (const name of ["savedSearches", "rules", "alerts"] as const) {
      const ids = workspace[name].map((entry) => entry.id);
      if (new Set(ids).size !== ids.length)
        context.addIssue({
          code: "custom",
          path: [name],
          message: "IDs must be unique",
        });
    }
    if (
      new Set(workspace.referencePoints.map((p) => p.name)).size !==
      workspace.referencePoints.length
    )
      context.addIssue({
        code: "custom",
        path: ["referencePoints"],
        message: "Reference place names must be unique",
      });
  });
export function parseWorkspaceExport(input: unknown): Workspace {
  const wrapped = z
    .object({ version: z.literal(1), workspace: workspaceRestoreSchema })
    .safeParse(input);
  return wrapped.success
    ? wrapped.data.workspace
    : workspaceRestoreSchema.parse(input);
}
export type RestoreMode = "merge" | "replace";
export type RestorePreview = {
  workspace: Workspace;
  unknownIds: string[];
  mappedIds: number;
  preservedNoteConflicts: string[];
  preservedNamedConflicts: number;
};
/** Existing edits win in a merge. Unknown imported references are reported, never silently remapped. */
export function previewWorkspaceRestore(
  current: Workspace,
  imported: Workspace,
  validIds: ReadonlySet<string>,
  mode: RestoreMode = "merge",
  idMap: Readonly<Record<string, string>> = {},
): RestorePreview {
  const unknownIds = new Set<string>();
  const mapped = new Set<string>();
  const mapId = (input: string) => {
    const target = Object.hasOwn(idMap, input) ? idMap[input] : input;
    if (!validIds.has(target)) {
      unknownIds.add(input);
      return null;
    }
    if (target !== input) mapped.add(input);
    return target;
  };
  const favorites = imported.favorites.flatMap((id) => {
    const mapped = mapId(id);
    return mapped ? [mapped] : [];
  });
  const notes: Record<string, string> = Object.create(null);
  for (const [id, note] of Object.entries(imported.notes)) {
    const mapped = mapId(id);
    if (mapped)
      notes[mapped] =
        notes[mapped] && notes[mapped] !== note
          ? `${notes[mapped]}\n\n${note}`
          : note;
  }
  const alerts = imported.alerts.map((a) => ({
    ...a,
    listingIds: a.listingIds.flatMap((id) => {
      const mapped = mapId(id);
      return mapped ? [mapped] : [];
    }),
  }));
  const preservedNoteConflicts =
    mode === "merge"
      ? Object.keys(notes).filter(
          (id) =>
            current.notes[id] !== undefined && current.notes[id] !== notes[id],
        )
      : [];
  let preservedNamedConflicts = 0;
  function mergeBy<T>(existing: T[], incoming: T[], key: (v: T) => string) {
    if (mode === "replace") return incoming;
    const keys = new Set(existing.map(key));
    preservedNamedConflicts += incoming.filter((item) =>
      keys.has(key(item)),
    ).length;
    return [...existing, ...incoming.filter((item) => !keys.has(key(item)))];
  }
  const workspace = workspaceRestoreSchema.parse({
    favorites: [
      ...new Set(
        mode === "merge" ? [...current.favorites, ...favorites] : favorites,
      ),
    ],
    notes: mode === "merge" ? { ...notes, ...current.notes } : notes,
    savedSearches: mergeBy(
      current.savedSearches,
      imported.savedSearches,
      (v) => v.id,
    ),
    rules: mergeBy(current.rules, imported.rules, (v) => v.id),
    alerts: mergeBy(current.alerts, alerts, (v) => v.id),
    referencePoints: mergeBy(
      current.referencePoints,
      imported.referencePoints,
      (v) => v.name,
    ),
  });
  return {
    workspace,
    unknownIds: [...unknownIds],
    mappedIds: mapped.size,
    preservedNoteConflicts,
    preservedNamedConflicts,
  };
}

export function workspaceReplacementChanges(
  current: Workspace,
  next: Workspace,
): string[] {
  const changes: string[] = [];
  for (const id of current.favorites)
    if (!next.favorites.includes(id)) changes.push(`Remove favorite: ${id}`);
  for (const [id, note] of Object.entries(current.notes))
    if (next.notes[id] === undefined) changes.push(`Remove note: ${id}`);
    else if (next.notes[id] !== note) changes.push(`Overwrite note: ${id}`);
  for (const type of ["savedSearches", "rules", "alerts"] as const) {
    for (const entry of current[type]) {
      const replacement = next[type].find((v) => v.id === entry.id);
      const label = "name" in entry ? entry.name : entry.title;
      if (!replacement) changes.push(`Remove ${type}: ${label}`);
      else if (JSON.stringify(replacement) !== JSON.stringify(entry))
        changes.push(`Overwrite ${type}: ${label}`);
    }
  }
  for (const place of current.referencePoints) {
    const replacement = next.referencePoints.find((p) => p.name === place.name);
    if (!replacement) changes.push(`Remove reference place: ${place.name}`);
    else if (replacement.lat !== place.lat || replacement.lng !== place.lng)
      changes.push(`Overwrite reference place: ${place.name}`);
  }
  return changes;
}
