import { describe, it, expect } from "vitest";
import {
  groupLocationQueries,
  rankLocationCandidates,
} from "../lib/location-review";
import { locateListing } from "../server/locations";
import { makeSeed } from "../lib/seed";
const q = { city: "Allendale", state: "MI", zip: "49401" };
const candidate = (extra = {}) => ({
  lat: "42.972",
  lon: "-85.953",
  display_name: "Allendale, Ottawa County, Michigan, United States",
  name: "Allendale",
  addresstype: "suburb",
  address: {
    suburb: "Allendale",
    state: "Michigan",
    postcode: "49401",
    country_code: "us",
  },
  ...extra,
});
describe("location evidence and ambiguity", () => {
  it("retains conflicting ZIP evidence instead of selecting the last same-city ad", () => {
    const listings = [
      { city: "Allendale", state: "MI", specs: { postalCode: "49401" } },
      { city: "Allendale", state: "MI", specs: { postalCode: "48625" } },
      { city: "Allendale", state: "MI", specs: {} },
    ];
    const result = groupLocationQueries(listings);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: "allendale, mi",
      query: { zip: "" },
      postalCodes: ["48625", "49401"],
      conflictingPostalCodes: true,
    });
    expect(groupLocationQueries([...listings].reverse())).toEqual(result);
  });
  it("combines missing ZIPs and matching ZIP+4 evidence without making a conflict", () => {
    const result = groupLocationQueries([
      { city: "Wheaton", state: "il", specs: { postalCode: "60187-1234" } },
      { city: "Wheaton", state: "IL", specs: { postalCode: "60187" } },
      { city: "Wheaton", state: "IL", specs: {} },
    ]);
    expect(result[0]).toMatchObject({
      key: "wheaton, il",
      query: { state: "IL", zip: "60187" },
      postalCodes: ["60187"],
      conflictingPostalCodes: false,
    });
  });
  it("accepts a uniquely matching suburb with city/state/ZIP evidence", () => {
    const r = rankLocationCandidates(q, [candidate()]);
    expect(r.chosen?.score).toBe(100);
    expect(r.chosen?.type).toBe("suburb");
  });
  it("rejects same-name cities in another state or ZIP", () => {
    expect(
      rankLocationCandidates(q, [
        candidate({
          address: {
            suburb: "Allendale",
            state: "Illinois",
            postcode: "62410",
            country_code: "us",
          },
        }),
      ]).chosen,
    ).toBeNull();
    expect(
      rankLocationCandidates(q, [
        candidate({
          address: {
            suburb: "Allendale",
            state: "Michigan",
            postcode: "49999",
            country_code: "us",
          },
        }),
      ]).chosen,
    ).toBeNull();
  });
  it("queues equally plausible different localities instead of choosing the first result", () => {
    const r = rankLocationCandidates({ ...q, zip: "" }, [
      candidate(),
      candidate({ lat: "43.9" }),
    ]);
    expect(r.candidates).toHaveLength(2);
    expect(r.chosen).toBeNull();
  });
  it("corrects approximate coordinates but preserves exact source coordinates and offsite uncertainty", () => {
    const point = {
      lat: 42.97,
      lng: -85.95,
      label: "Allendale MI",
      source: "reviewed",
      fetchedAt: new Date().toISOString(),
      reviewed: true,
    };
    const l = {
      ...makeSeed()[0],
      city: "Allendale",
      state: "MI",
      lat: 41,
      lng: -87,
      specs: { locationPrecision: "Approximate city center" },
    };
    expect(locateListing(l, { "allendale, mi": point }).lat).toBe(point.lat);
    expect(
      locateListing({ ...l, specs: {} }, { "allendale, mi": point }).lat,
    ).toBe(41);
    const offsite = locateListing(
      { ...l, specs: { ...l.specs, boatLocationUnknown: true } },
      { "allendale, mi": point },
    );
    expect(offsite.lat).toBeNull();
    expect(offsite.sellerLat).toBe(point.lat);
  });
});
