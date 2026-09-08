import { describe, it, expect } from "vitest";
import { makeSeed } from "../lib/seed";
import { filtersSchema, listingSchema, DEFAULT_FILTERS } from "../lib/types";
import {
  distanceMiles,
  matches,
  priceDrop,
  searchListings,
  DAY,
} from "../lib/search";
import { FIELDS } from "../lib/catalog";
const now = Date.UTC(2026, 8, 8),
  boat = makeSeed(new Date(now))[0];
describe("shared search engine", () => {
  it("keeps unknown values unless explicitly excluded", () => {
    const l = { ...boat, engineHours: null };
    expect(
      matches(
        l,
        filtersSchema.parse({ criteria: { engineHours: { max: 200 } } }),
        now,
      ),
    ).toBe(true);
    expect(
      matches(
        l,
        filtersSchema.parse({
          criteria: { engineHours: { max: 200, excludeUnknown: true } },
        }),
        now,
      ),
    ).toBe(false);
    expect(
      matches(
        l,
        filtersSchema.parse({
          criteria: { engineHours: { max: 200 } },
          excludeUnknown: true,
        }),
        now,
      ),
    ).toBe(false);
  });
  it("honors numeric, text, select and boolean criteria across every catalog field", () => {
    for (const f of FIELDS) {
      if (
        [
          "pricePerFoot",
          "priceDrop",
          "priceDropPercent",
          "reduced",
          "listingAge",
          "daysOnMarket",
          "photoCount",
          "hasPrice",
          "distance",
          "contains",
          "excludes",
        ].includes(f.key)
      )
        continue;
      const value =
        f.kind === "number"
          ? 17
          : f.kind === "boolean"
            ? true
            : f.kind === "select"
              ? f.options![0]
              : "needle";
      const l = {
        ...boat,
        specs: { ...boat.specs, [f.key]: value },
        ...(f.key in boat ? { [f.key]: value } : {}),
      };
      const pass =
        f.kind === "number"
          ? { min: 16, max: 18 }
          : f.kind === "boolean"
            ? { bool: true }
            : f.kind === "select"
              ? { values: [String(value)] }
              : { text: "needle" };
      const fail =
        f.kind === "number"
          ? { min: 18 }
          : f.kind === "boolean"
            ? { bool: false }
            : f.kind === "select"
              ? { values: ["not-matching"] }
              : { text: "not-matching" };
      expect(
        matches(
          l as typeof boat,
          filtersSchema.parse({ criteria: { [f.key]: pass } }),
          now,
        ),
        f.key,
      ).toBe(true);
      expect(
        matches(
          l as typeof boat,
          filtersSchema.parse({ criteria: { [f.key]: fail } }),
          now,
        ),
        f.key,
      ).toBe(false);
    }
  });
  it("ORs areas and ANDs them with equipment and price", () => {
    const f = filtersSchema.parse({
      areas: [
        { id: "wi", name: "Wisconsin", kind: "states", states: ["WI"] },
        {
          id: "home",
          name: "Wheaton",
          kind: "radius",
          lat: 41.8661,
          lng: -88.107,
          radius: 10,
        },
      ],
      criteria: { price: { max: 40000 }, "equipment.trailer": { bool: true } },
    });
    expect(matches(boat, f, now)).toBe(true);
    expect(matches({ ...boat, price: 50000 }, f, now)).toBe(false);
    expect(matches({ ...boat, state: "CA", lat: 34, lng: -118 }, f, now)).toBe(
      false,
    );
  });
  it("distinguishes seller and boat locations", () => {
    const l = {
      ...boat,
      lat: 34,
      lng: -118,
      sellerLat: 41.8661,
      sellerLng: -88.107,
    };
    const f = filtersSchema.parse({
      areas: [
        {
          id: "a",
          name: "Home",
          kind: "radius",
          lat: 41.8661,
          lng: -88.107,
          radius: 1,
        },
      ],
    });
    expect(matches(l, f, now)).toBe(false);
    expect(matches(l, { ...f, locationTarget: "seller" }, now)).toBe(true);
  });
  it("applies bounding boxes and unknown locations", () => {
    const f = filtersSchema.parse({
      areas: [{ id: "a", name: "Box", kind: "bbox", bbox: [41, -89, 43, -87] }],
    });
    expect(matches(boat, f, now)).toBe(true);
    expect(matches({ ...boat, lat: null, lng: null }, f, now)).toBe(true);
    expect(
      matches(
        { ...boat, lat: null, lng: null },
        { ...f, excludeUnknownLocation: true },
        now,
      ),
    ).toBe(false);
  });
  it("enforces lake, propulsion, PWC and towing constraints", () => {
    const f = filtersSchema.parse({
      ruleSet: {
        id: "r",
        name: "My rules",
        maxLength: 20,
        maxHp: 175,
        maxLoadedWeight: 3500,
        allowedPropulsion: ["Outboard"],
        excludedCategories: ["PWC"],
        excludeUnknown: true,
      },
    });
    expect(
      matches(
        { ...boat, specs: { ...boat.specs, loadedWeight: 3200 } },
        f,
        now,
      ),
    ).toBe(true);
    expect(
      matches(
        { ...boat, specs: { ...boat.specs, loadedWeight: 4000 } },
        f,
        now,
      ),
    ).toBe(false);
    expect(matches({ ...boat, category: "PWC" }, f, now)).toBe(false);
    expect(matches({ ...boat, horsepower: null }, f, now)).toBe(false);
  });
  it("uses the price at the start of a drop window, ignoring old higher prices", () => {
    const l = {
      ...boat,
      price: 80,
      priceHistory: [
        { price: 150, at: new Date(now - 200 * DAY).toISOString() },
        { price: 100, at: new Date(now - 100 * DAY).toISOString() },
        { price: 80, at: new Date(now - 10 * DAY).toISOString() },
      ],
    };
    expect(priceDrop(l, 90, now)).toEqual({ amount: 20, percent: 20 });
    expect(priceDrop(l, 7, now)).toEqual({ amount: 0, percent: 0 });
  });
  it("groups duplicate boats and chooses the lowest known asking price", () => {
    const other = {
      ...boat,
      id: "second",
      source: "Boats.com",
      price: 25000,
      groupId: "group",
    };
    const found = searchListings(
      [{ ...boat, groupId: "group" }, other],
      DEFAULT_FILTERS,
      now,
    );
    expect(found).toHaveLength(1);
    expect(found[0].price).toBe(25000);
    expect(found[0].sourceLinks).toHaveLength(2);
  });
  it("supports include/exclude words and sorts unknown values last", () => {
    expect(
      matches(
        boat,
        filtersSchema.parse({ criteria: { excludes: { text: "fictional" } } }),
        now,
      ),
    ).toBe(false);
    const list = searchListings(
      [{ ...boat, id: "unknown", price: null }, boat],
      { ...DEFAULT_FILTERS, sort: "price-asc" },
      now,
    );
    expect(list.at(-1)?.price).toBeNull();
  });
  it("validates bad limits, coordinates, URL protocols and unknown filter names", () => {
    expect(() =>
      filtersSchema.parse({ criteria: { price: { min: 300, max: 100 } } }),
    ).toThrow();
    expect(() =>
      filtersSchema.parse({ criteria: { typo: { min: 1 } } }),
    ).toThrow();
    expect(() =>
      filtersSchema.parse({
        areas: [
          {
            id: "a",
            name: "bad",
            kind: "radius",
            lat: 100,
            lng: 1,
            radius: 10,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      listingSchema.parse({ ...boat, sourceUrl: "javascript:alert(1)" }),
    ).toThrow();
  });
  it("computes miles consistently", () => {
    expect(
      distanceMiles(
        { lat: 41.8661, lng: -88.107 },
        { lat: 41.8661, lng: -88.107 },
      ),
    ).toBe(0);
    expect(
      distanceMiles(
        { lat: 41.8781, lng: -87.6298 },
        { lat: 43.0389, lng: -87.9065 },
      ),
    ).toBeCloseTo(81.4, 0);
  });
});
