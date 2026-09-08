import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { adapters } from "../server/adapters";
import { sourceConfigSchema } from "../server/adapters/types";
import {
  inventoryPages,
  verifiedEmptyRegionalPage,
} from "../server/adapters/pagination";
import { inspectSourceQuality } from "../lib/source-quality";
import { matches } from "../lib/search";
import { LAKE_SEARCHES, LAKE_HOLIDAY_FILTERS } from "../lib/lake-holiday";
const fixture = (name: string) =>
  readFileSync(`tests/fixtures/${name}.html`, "utf8");
const source = sourceConfigSchema.parse({
  id: "test",
  name: "Fixture dealer",
  adapter: "dealer",
});
const parse = (name: string, url: string) =>
  adapters.dealer.parse(fixture(name), url, source);
describe("September 8 permitted dealer captures", () => {
  it("collects Huber's published boat/pontoon cards with stable identities, discounts, HIN and real location", () => {
    const url =
      "https://www.hubersmarine.com/search/inventory/availability/In%20Stock";
    const first = parse("hubers-inventory", url),
      second = parse("hubers-second-page", `${url}/page/2`);
    expect(first).toHaveLength(27);
    expect(second).toHaveLength(4);
    expect(new Set([...first, ...second].map((l) => l.id)).size).toBe(31);
    const lund = first.find((l) => l.sourceListingId === "13617661")!;
    expect(lund).toMatchObject({
      price: 54995,
      length: null,
      horsepower: null,
      city: "La Porte",
      state: "IN",
      specs: { hin: "lbbkh422h526" },
    });
    expect(first.some((l) => l.category === "Pontoon")).toBe(true);
    expect(inventoryPages(fixture("hubers-inventory"), url)).toContain(
      `${url}/page/2`,
    );
    expect(
      verifiedEmptyRegionalPage(fixture("hubers-second-page"), `${url}/page/2`),
    ).toBe(false);
    expect(
      inspectSourceQuality([...first, ...second], [], {
        minRecords: 1,
        minPriceCoverage: 0.5,
        minIdentityCoverage: 0.95,
        minLocationCoverage: 0.95,
      }).status,
    ).toBe("passed");
  });
  it("reads installed engine and hull specs from details, keeps sale rather than obsolete print-brochure prices", () => {
    const lund = parse(
      "hubers-detail-lund",
      "https://www.hubersmarine.com/inventory/2026-lund-1775-impact-xs-sport-la-porte-in-46350-13617661i",
    )[0];
    expect(lund).toMatchObject({
      sourceListingId: "13617661",
      price: 54995,
      length: 17.92,
      horsepower: 115,
      specs: { hin: "lbbkh422h526" },
    });
    const nautique = parse(
      "hubers-detail-nautique",
      "https://www.hubersmarine.com/inventory/1999-correct-craft-closed-bow-ski-nautique-efi-la-porte-in-46350-14570583i",
    )[0];
    expect(nautique).toMatchObject({
      price: 10995,
      make: "Nautique",
      length: 20,
      horsepower: 290,
      category: "Ski / wake / surf",
      specs: { hin: "CTC90257K899" },
    });
    const nearLake = { ...nautique, lat: 41.6103189, lng: -86.7149537 };
    const now = Date.parse(nautique.lastSeenAt);
    expect(matches(nearLake, LAKE_HOLIDAY_FILTERS, now)).toBe(true);
    expect(
      matches(
        nearLake,
        LAKE_SEARCHES.find((s) => s.id === "holiday-ski")!.filters,
        now,
      ),
    ).toBe(true);
  });
  it("parses Quest's public inventory response, excludes lift/PWC and keeps quote price unknown", () => {
    const url =
      "https://www.questwatersports.com/isapi_xml.php?module=inventory&pageID=6587&limit=24&offset=0";
    const boats = parse("quest-inventory", url);
    expect(boats).toHaveLength(7);
    expect(boats[0].price).toBeNull();
    expect(boats.find((l) => l.make === "G3")).toMatchObject({
      length: 17,
      horsepower: 40,
      city: "Ottawa",
      state: "IL",
      sourceListingId: "1330",
    });
    expect(
      boats.every((l) =>
        /^https:\/\/www.questwatersports.com\/\d{4}-.+-c-\d+\/$/.test(
          l.sourceUrl,
        ),
      ),
    ).toBe(true);
    expect(inventoryPages(fixture("quest-inventory"), url)).toEqual([]);
    expect(inventoryPages("49\n{}\n{}", url)).toHaveLength(2);
  });
  it("keeps wider-region boats and incoming stock explicit without inferring hull length from model numbers", () => {
    const works = parse(
      "boatworks-inventory",
      "https://4boatworks.net/inventory/",
    );
    expect(works).toHaveLength(18);
    expect(works.some((l) => /New Holland|^2023 Yamaha/.test(l.title))).toBe(
      false,
    );
    expect(
      works.find((l) => l.title === "2013 Phoenix 920 Pro Xp"),
    ).toMatchObject({
      price: 42000,
      length: 20,
      horsepower: 250,
      city: "Keyesport",
      state: "IL",
    });
    const center = parse(
      "boatcenter-inventory",
      "https://theboatcenter.com/inventory/",
    );
    expect(center).toHaveLength(10);
    expect(center[0]).toMatchObject({
      price: null,
      length: null,
      horsepower: 40,
      city: "Chippewa Falls",
      specs: { sourceAvailability: "Incoming; not confirmed onsite" },
    });
    expect(center.find((l) => l.specs.stockNumber === "S325929")).toMatchObject(
      { city: "Ramsey", state: "MN", horsepower: 200 },
    );
    expect(
      inventoryPages(
        fixture("boatcenter-inventory"),
        "https://theboatcenter.com/inventory/",
      ),
    ).toContain("https://theboatcenter.com/inventory/page/14/");
  });
});
