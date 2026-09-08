import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { adapters, structuredListings } from "../server/adapters";
import { sourceConfigSchema } from "../server/adapters/types";
import { normalizeListing, parseNumber } from "../server/adapters/normalize";
import { findDuplicate } from "../server/dedup";
import { makeSeed } from "../lib/seed";
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
describe("fixture adapters", () => {
  it("parses Boat Trader nested JSON-LD and records provenance", () => {
    const config = sourceConfigSchema.parse({
      id: "bt",
      name: "Boat Trader",
      adapter: "boattrader",
    });
    const list = adapters.boattrader.parse(
      fixture("boattrader"),
      "https://www.boattrader.com/boats/",
      config,
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      source: "Boat Trader",
      make: "Lund",
      model: "1875 Impact XS",
      price: 38900,
      year: 2021,
      length: 18.9,
      horsepower: 150,
      city: "Wheaton",
      state: "IL",
    });
    expect(list[0].sourceUrl).toBe(
      "https://www.boattrader.com/boat/2021-lund-1875-impact-xs-100/",
    );
    expect(list[0].rawPayload).toBeTruthy();
  });
  it("parses Craigslist and preserves unknown prices", () => {
    const config = sourceConfigSchema.parse({
      id: "cl",
      name: "Craigslist",
      adapter: "craigslist",
    });
    const list = adapters.craigslist.parse(
      fixture("craigslist"),
      "https://chicago.craigslist.org/search/boa",
      config,
    );
    expect(list).toHaveLength(2);
    expect(list[0].price).toBe(34900);
    expect(list[1].price).toBeNull();
  });
  it("supports dealer selectors and resolves relative images", () => {
    const c = sourceConfigSchema.parse({
      id: "dealer",
      name: "Dealer",
      adapter: "dealer",
      selectors: {
        item: ".inventory-item",
        title: ".title",
        link: "a",
        price: ".price",
        image: "img",
        location: ".location",
      },
    });
    const list = adapters.dealer.parse(
      fixture("dealer"),
      "https://dealer.example.com/inventory",
      c,
    );
    expect(list[0].photos[0]).toBe(
      "https://dealer.example.com/images/boat-3.jpg",
    );
    expect(list[0].price).toBe(84900);
  });
  it.each(["yachtworld", "boats", "iboats", "ebay", "cpo"] as const)(
    "%s handles portable structured inventory",
    (id) => {
      const c = sourceConfigSchema.parse({ id, name: id, adapter: id });
      expect(
        adapters[id].parse(
          fixture("boattrader"),
          "https://example.com/inventory",
          c,
        ),
      ).toHaveLength(1);
    },
  );
  it("fails explicitly for automated Facebook ingestion", () => {
    expect(() =>
      adapters.facebook.parse(
        "",
        "https://facebook.com",
        sourceConfigSchema.parse({
          id: "fb",
          name: "Facebook Marketplace",
          adapter: "facebook",
        }),
      ),
    ).toThrow(/user-exported/);
  });
  it("ignores malformed metadata and non-USD offers", () => {
    const c = sourceConfigSchema.parse({
      id: "bt",
      name: "Boat Trader",
      adapter: "boattrader",
    });
    expect(
      structuredListings(
        '<script type="application/ld+json">broken</script>',
        "https://example.com",
        c,
      ),
    ).toEqual([]);
    expect(
      structuredListings(
        fixture("boattrader").replace('"USD"', '"EUR"'),
        "https://example.com",
        c,
      ),
    ).toEqual([]);
  });
  it("normalizes money without turning absent values into zero", () => {
    expect(parseNumber("$12,345.50")).toBe(12345.5);
    expect(parseNumber("Call for price")).toBeNull();
    expect(
      normalizeListing(
        { title: "2020 MASTERCRAFT NXT22", price: "call" },
        "Dealer",
        "https://example.com",
      ),
    ).toMatchObject({ make: "MasterCraft", year: 2020, price: null });
  });
  it("does not merge separate boats just because their specs match", () => {
    const a = {
      ...makeSeed()[0],
      isSample: false,
      photos: ["https://example.com/original.jpg"],
    };
    const b = {
      ...a,
      id: "b",
      source: "Dealer",
      photos: ["https://example.com/other.jpg"],
    };
    expect(findDuplicate(a, [b])).toBeUndefined();
    expect(findDuplicate(a, [{ ...b, photos: a.photos }])).toBeUndefined();
    expect(
      findDuplicate({ ...a, specs: { hin: "ABC12345A626" } }, [
        { ...b, specs: { hin: "US-ABC12345A626" } },
      ])?.id,
    ).toBe("b");
  });
});
it("converts metric lengths, feet/inches and kilowatts without confusing units", async () => {
  const { parseLengthFeet } = await import("../server/adapters/normalize");
  expect(parseLengthFeet("18 ft 6 in")).toBe(18.5);
  expect(parseLengthFeet("6 meters")).toBeCloseTo(19.685, 3);
  expect(parseLengthFeet("222 inches")).toBe(18.5);
  expect(
    normalizeListing(
      { title: "Boat", horsepower: "100 kW" },
      "Dealer",
      "https://example.com",
    ).horsepower,
  ).toBeCloseTo(134.1, 1);
});
