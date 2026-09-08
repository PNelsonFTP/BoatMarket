import { describe, expect, it } from "vitest";
import fixture from "./fixtures/duplicate-review-examples.json";
import { listingSchema } from "../lib/types";
import { reviewNamedIdentityExamples } from "../server/identity-examples";

const listings = fixture.listings.map((listing) =>
  listingSchema.parse(listing),
);
describe("captured named identity evidence", () => {
  it("corroborates five Butler reposts and the distinctive Fenton cross-list while keeping distinct stock HINs separate", () => {
    const report = reviewNamedIdentityExamples(listings);
    expect(report.missing).toEqual([]);
    expect(report.recommendations.map((item) => item.decision)).toEqual([
      "same",
      "same",
      "same",
      "same",
      "same",
      "different",
    ]);
    expect(
      report.recommendations.every(
        (item) =>
          item.sufficientLocalEvidence &&
          item.sources.length === 2 &&
          item.leftFingerprint.length > 10,
      ),
    ).toBe(true);
    expect(report.recommendations[5].evidence?.conflicts).toContain(
      "Different modern-format HINs",
    );
    expect(report.separateExample.id).toBe("25070c23b761fc4b28973894");
  });
  it("requires corroboration beyond a reused title/image and retains conflicts", () => {
    const changed = structuredClone(listings);
    const butler = changed.find(
      (listing) => listing.id === "b5ec6f81bbd5f9cb1092991e",
    )!;
    butler.description = "Crestliner Sportsman 16 for sale";
    const skeeter = changed.find(
      (listing) => listing.id === "b8d8511b5eeea9421726930b",
    )!;
    skeeter.description = "Skeeter ZX225, 2002, Fenton, $18,500";
    const report = reviewNamedIdentityExamples(changed);
    expect(report.recommendations[0].decision).toBe("review");
    expect(report.recommendations[4].decision).toBe("review");
    const conflict = structuredClone(listings);
    conflict.find(
      (listing) => listing.id === "b5ec6f81bbd5f9cb1092991e",
    )!.year = 2018;
    conflict.find(
      (listing) => listing.id === "cb0108f73888a808a251d8ff",
    )!.year = 1994;
    expect(
      reviewNamedIdentityExamples(conflict).recommendations[0].decision,
    ).toBe("review");
  });
});
