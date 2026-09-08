import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { makeSeed, seedWorkspace } from "../lib/seed";
import {
  importChunks,
  mergeListingImport,
  parseListingImport,
  runListingImport,
  type ImportChunkResult,
} from "../lib/import-listings";
import {
  parseWorkspaceExport,
  previewWorkspaceRestore,
} from "../lib/import-workspace";
import { configureLakeHolidayWorkspace } from "../lib/import-defaults";
import { LAKE_HOLIDAY_RULE, LAKE_SEARCHES } from "../lib/lake-holiday";
import type { Listing } from "../lib/types";
const boat = makeSeed()[0];
const boatList = (length: number) =>
  Array.from({ length }, (_, index) => ({
    ...boat,
    id: `boat-${index}`,
    sourceListingId: `source-${index}`,
    isSample: false,
  }));
const accepted = (items: Listing[]): ImportChunkResult => ({
  new: items.length,
  updated: 0,
  acceptedIds: items.map((l) => l.id),
  idMap: Object.fromEntries(items.map((l) => [l.id, l.id])),
  failed: [],
});
describe("validated listing transfer", () => {
  it("roundtrips the entire published export in bounded requests", async () => {
    const exported = JSON.parse(
      readFileSync(new URL("../public/snapshot.json", import.meta.url), "utf8"),
    );
    const data = parseListingImport(exported);
    expect(data.listings.length).toBeGreaterThan(1000);
    const send = vi.fn(async (items: Listing[]) => {
      expect(items.length).toBeLessThanOrEqual(1000);
      expect(
        Buffer.byteLength(JSON.stringify({ listings: items })),
      ).toBeLessThanOrEqual(12 * 1024 * 1024);
      return accepted(items);
    });
    const result = await runListingImport(
      data.listings,
      "http://localhost:4310",
      send,
    );
    expect(result.acceptedIds).toHaveLength(data.listings.length);
    expect(result.unattemptedIds).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(send).toHaveBeenCalledTimes(Math.ceil(data.listings.length / 1000));
    expect(parseListingImport({ listings: data.listings }).listings).toEqual(
      data.listings,
    );
  });
  it("splits by actual UTF-8 request bytes as well as record count", () => {
    const boats = boatList(5).map((l) => ({
      ...l,
      description: "🚤".repeat(30),
    }));
    const oneSize = Buffer.byteLength(JSON.stringify({ listings: [boats[0]] }));
    const chunks = importChunks(boats, 1000, oneSize + 1);
    expect(chunks.map((items) => items.length)).toEqual([1, 1, 1, 1, 1]);
    for (const listings of chunks)
      expect(
        Buffer.byteLength(JSON.stringify({ listings })),
      ).toBeLessThanOrEqual(oneSize + 1);
    expect(() => importChunks(boats, 1000, oneSize - 1)).toThrow(/exceeds/);
  });
  it("records partial acceptance and stops before subsequent chunks", async () => {
    const boats = boatList(2500);
    let calls = 0;
    const send = vi.fn(async (items: Listing[]) => {
      calls++;
      if (calls === 1) return accepted(items);
      return {
        ...accepted(items.slice(0, 2)),
        failed: [{ id: items[2].id, error: "Identity conflict" }],
        unattemptedIds: items.slice(3).map((l) => l.id),
      };
    });
    const result = await runListingImport(boats, "http://localhost:4310", send);
    expect(result.acceptedIds).toHaveLength(1002);
    expect(result.failed).toEqual([
      { id: "boat-1002", error: "Identity conflict" },
    ]);
    expect(result.unattemptedIds).toHaveLength(1497);
    expect(result.completedChunks).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("marks a timeout as uncertain instead of claiming a rollback", async () => {
    const send = vi.fn(async (items: Listing[]) => {
      if (items[0].id === "boat-1000") throw new Error("Timed out");
      return accepted(items);
    });
    const result = await runListingImport(
      boatList(2500),
      "http://localhost:4310",
      send,
    );
    expect(result.acceptedIds).toHaveLength(1000);
    expect(result.uncertainIds).toHaveLength(1000);
    expect(result.unattemptedIds).toHaveLength(500);
    expect(result.failed[0].error).toMatch(/Timed out/);
  });
  it("validates the entire file before import and detects ambiguous identities", () => {
    expect(() =>
      parseListingImport([boat, { ...boat, id: "other-id" }]),
    ).toThrow(/source identities/);
    expect(() =>
      parseListingImport([boat, { ...boat, sourceListingId: "other" }]),
    ).toThrow(/IDs/);
    expect(() => parseListingImport([{ ...boat, price: -1 }])).toThrow();
    const merged = mergeListingImport(
      [boat],
      [{ ...boat, id: "exported-id", price: 50000 }],
    );
    expect(merged.listings).toHaveLength(1);
    expect(merged.listings[0].id).toBe(boat.id);
    expect(merged.idMap["exported-id"]).toBe(boat.id);
    expect(() =>
      mergeListingImport(
        [boat],
        [{ ...boat, sourceListingId: "another-vessel" }],
      ),
    ).toThrow(/different source/);
  });
});
describe("workspace restore and safe defaults", () => {
  it("preserves current notes/search edits while mapping IDs and reporting unknown references", () => {
    const current = {
      ...seedWorkspace(),
      favorites: [boat.id],
      notes: { [boat.id]: "New service-record note" },
    };
    const incoming = {
      ...seedWorkspace(),
      favorites: ["export-id", "missing-boat"],
      notes: {
        "export-id": "Old imported note",
        "missing-boat": "Keep this in the backup",
      },
      rules: [{ ...LAKE_HOLIDAY_RULE }],
    };
    const result = previewWorkspaceRestore(
      current,
      parseWorkspaceExport({ version: 1, workspace: incoming }),
      new Set([boat.id]),
      "merge",
      { "export-id": boat.id },
    );
    expect(result.workspace.notes[boat.id]).toBe("New service-record note");
    expect(result.workspace.favorites).toEqual([boat.id]);
    expect(result.unknownIds).toEqual(["missing-boat"]);
    expect(result.mappedIds).toBe(1);
    expect(result.preservedNoteConflicts).toEqual([boat.id]);
    expect(current.notes[boat.id]).toBe("New service-record note");
    const replaced = previewWorkspaceRestore(
      current,
      incoming,
      new Set([boat.id]),
      "replace",
      { "export-id": boat.id },
    );
    expect(replaced.workspace.notes[boat.id]).toBe("Old imported note");
  });
  it("requires a complete validated export and rejects duplicate user entry IDs", () => {
    expect(() => parseWorkspaceExport({ notes: {} })).toThrow();
    const w = seedWorkspace();
    expect(() =>
      parseWorkspaceExport({
        ...w,
        rules: [LAKE_HOLIDAY_RULE, LAKE_HOLIDAY_RULE],
      }),
    ).toThrow(/IDs must be unique/);
    expect(() =>
      parseWorkspaceExport({
        ...w,
        referencePoints: [{ name: "Bad", lat: 100, lng: 10 }],
      }),
    ).toThrow();
  });
  it("keeps customized built-ins and names unless explicitly resetting matching defaults", () => {
    const customized = {
      ...LAKE_SEARCHES[0],
      name: "My edited favorite",
      cadence: "weekly" as const,
    };
    const w = {
      ...seedWorkspace(),
      savedSearches: [
        customized,
        { ...LAKE_SEARCHES[0], id: "custom", name: "Custom search" },
      ],
      rules: [{ ...LAKE_HOLIDAY_RULE, maxLength: 19 }],
      notes: { [boat.id]: "Keep my note" },
      referencePoints: [{ name: "My Lake Holiday cabin", lat: 41, lng: -88 }],
    };
    const preserved = configureLakeHolidayWorkspace(w);
    expect(preserved.savedSearches.find((s) => s.id === customized.id)).toEqual(
      customized,
    );
    expect(
      preserved.rules.find((r) => r.id === LAKE_HOLIDAY_RULE.id)?.maxLength,
    ).toBe(19);
    expect(preserved.referencePoints).toContainEqual(w.referencePoints[0]);
    const reset = configureLakeHolidayWorkspace(w, true);
    expect(reset.savedSearches.find((s) => s.id === customized.id)).toEqual(
      LAKE_SEARCHES[0],
    );
    expect(reset.savedSearches.find((s) => s.id === "custom")).toBeDefined();
    expect(reset.notes).toEqual(w.notes);
  });
});
