import { expect, it } from "vitest";
import { makeSeed } from "../lib/seed";
import { DEFAULT_FILTERS, type Listing } from "../lib/types";
import { searchListings } from "../lib/search";
import { summarizeGrouping } from "../lib/grouping";
const ad = (
  id: string,
  groupId: string | null,
  basis: "reviewed" | "hin" | "unresolved",
  price: number,
): Listing => ({
  ...makeSeed()[0],
  id,
  sourceListingId: id,
  isSample: false,
  groupId,
  price,
  grouping: { basis, totalAdvertisements: groupId ? 2 : 1 },
});
it("reconciles filtered reviewed/HIN/unresolved records and separate advertisement counts", () => {
  const listings = [
    ad("a", "r", "reviewed", 20000),
    ad("b", "r", "reviewed", 60000),
    ad("c", "h", "hin", 25000),
    ad("d", "h", "hin", 65000),
    ad("u", null, "unresolved", 30000),
  ];
  const results = searchListings(listings, {
    ...DEFAULT_FILTERS,
    criteria: { price: { max: 40000 } },
  });
  expect(summarizeGrouping(results)).toEqual({
    reviewed: 1,
    hin: 1,
    unresolved: 1,
    total: 3,
  });
  expect(results.find((b) => b.id === "a")?.sourceLinks).toHaveLength(2);
  expect(results.find((b) => b.id === "c")?.grouping?.totalAdvertisements).toBe(
    2,
  );
});
it("treats missing/conflicting grouping evidence and standalone HIN claims as unresolved", () => {
  const listings = [
    ad("a", "r", "reviewed", 20000),
    ad("b", "r", "hin", 10000),
    ad("u", null, "hin", 15000),
  ];
  expect(summarizeGrouping(searchListings(listings, DEFAULT_FILTERS))).toEqual({
    reviewed: 0,
    hin: 0,
    unresolved: 2,
    total: 2,
  });
});
it("updates after split/undo without presenting a single advertisement as verified", () => {
  const listings = [
    ad("a", null, "unresolved", 20000),
    ad("b", null, "unresolved", 10000),
  ];
  expect(summarizeGrouping(searchListings(listings, DEFAULT_FILTERS))).toEqual({
    reviewed: 0,
    hin: 0,
    unresolved: 2,
    total: 2,
  });
});
