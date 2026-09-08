import { describe, it, expect } from "vitest";
import { adapters } from "../server/adapters";
import { sourceConfigSchema } from "../server/adapters/types";
import { enginePower } from "../server/adapters/regional";
import { parseLengthFeet } from "../server/adapters/normalize";
import {
  LAKE_HOLIDAY_FILTERS,
  LAKE_HOLIDAY_RULE,
  LAKE_SEARCHES,
} from "../lib/lake-holiday";
import { listingSchema, filtersSchema } from "../lib/types";
import { matches, searchListings } from "../lib/search";
const config = sourceConfigSchema.parse({
  id: "regional",
  name: "Regional",
  adapter: "dealer",
});
const boat = listingSchema.parse({
  id: "one",
  source: "Regional",
  sourceListingId: "one",
  sourceUrl: "https://example.com/one",
  title: "Ranger 620",
  make: "Ranger",
  length: 20.5,
  horsepower: 250,
  category: "Deep-V / multi-species",
  lat: 41.3574,
  lng: -88.4215,
  firstSeenAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
});
describe("real-source parsing and Lake Holiday screening", () => {
  it("includes exactly 21 feet under the official December 2025 rule and excludes larger or unknown length", () => {
    const f = filtersSchema.parse({ ruleSet: LAKE_HOLIDAY_RULE });
    expect(matches({ ...boat, length: 20.999 }, f)).toBe(true);
    expect(matches({ ...boat, length: 21 }, f)).toBe(true);
    expect(matches({ ...boat, length: 21.001 }, f)).toBe(false);
    expect(matches({ ...boat, length: null }, f)).toBe(false);
  });
  it("prioritizes nearby boats, excludes small fishing engines, and allows unreported ski horsepower", () => {
    const near = { ...boat, id: "near" },
      far = {
        ...boat,
        id: "far",
        sourceListingId: "far",
        lat: 42.55,
        lng: -88.575,
      };
    expect(
      searchListings([far, near], LAKE_HOLIDAY_FILTERS).map((x) => x.id),
    ).toEqual(["near", "far"]);
    expect(matches({ ...boat, horsepower: 90 }, LAKE_HOLIDAY_FILTERS)).toBe(
      false,
    );
    expect(
      matches(
        {
          ...boat,
          make: "MasterCraft",
          category: "Ski / wake / surf",
          horsepower: null,
        },
        LAKE_SEARCHES[2].filters,
      ),
    ).toBe(true);
    expect(
      matches({ ...boat, horsepower: null }, LAKE_SEARCHES[1].filters),
    ).toBe(false);
  });
  it("reads typographic feet/inches and does not invent horsepower from an inboard engine model", () => {
    expect(parseLengthFeet("20’7”")).toBeCloseTo(20 + 7 / 12);
    expect(parseLengthFeet("92”")).toBeCloseTo(92 / 12);
    expect(enginePower("Ilmor 6.0L")).toBeNull();
    expect(enginePower("PCM 409")).toBeNull();
    expect(enginePower("Yamaha 250 SHO")).toBe(250);
  });
  it("extracts installed engine horsepower and leaves quote-only pricing unknown", () => {
    const html =
      '<div class="inventory-single-title"><h1>2027 Bass Cat Lynx STS</h1></div><div class="single-info"><div class="single-info-desc-name">Length</div><div class="single-info-values">20’7”</div><div class="single-info-desc-name">Engine Horsepower</div><div class="single-info-values">250</div><div class="single-info-desc-name">Engine Manufacturer</div><div class="single-info-values">Yamaha SHO</div><div class="single-info-desc-name">Subcategory</div><div class="single-info-values">Fiberglass Bass Boat</div></div><div class="prices">$0/mo</div><div class="price-container">8159421333 Call for Quote</div>';
    const [l] = adapters.dealer.parse(
      html,
      "https://www.bedford-sales.com/inventory/boat/",
      config,
    );
    expect(l).toMatchObject({
      horsepower: 250,
      price: null,
      category: "Bass",
      city: "Morris",
      state: "IL",
    });
  });
  it("reads OnlyInboards cards without treating the listed date as engine hours", () => {
    const html =
      '<div class="oib-item"><div class="oib-item-title"><a href="/listings/123">2025 MasterCraft ProStar</a></div><div class="oib-price">$112,000</div><div class="oib-badge-description"><div>Length</div><div>20</div></div><div class="oib-mobile-card-location"><span>Farmer City, Illinois</span></div><div class="oib-mobile-card-date">Listed 2 days ago</div></div>';
    const [l] = adapters.dealer.parse(
      html,
      "https://onlyinboards.com/locationwise",
      config,
    );
    expect(l).toMatchObject({
      price: 112000,
      length: 20,
      city: "Farmer City",
      state: "IL",
      engineHours: null,
    });
  });
});
