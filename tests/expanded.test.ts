import { describe, expect, it } from "vitest";
import { adapters } from "../server/adapters";
import { sourceConfigSchema } from "../server/adapters/types";
import { inventoryPages } from "../server/adapters/pagination";
import { LAKE_SEARCHES, LAKE_HOLIDAY_FILTERS } from "../lib/lake-holiday";
import { matches } from "../lib/search";
import { normalizeListing } from "../server/adapters/normalize";
const config = sourceConfigSchema.parse({
  id: "test",
  name: "Test dealer",
  adapter: "dealer",
});
const spec = (name: string, value: string) =>
  `<li class="vehicle-specs__item"><h5 class="vehicle-specs__label">${name}</h5><span class="vehicle-specs__value">${value}</span></li>`;
function spike(
  id: string,
  title: string,
  length: string,
  hp: string,
  type = "Boat",
) {
  return `<div class="v7list-vehicle"><a class="vehicle-heading__link" href="/boat-${id}">${title}</a><a href="/?oid=${id}&vin=HIN${id}"></a><div class="vehicle-price--current"><span class="vehicle-price__price">$64,995</span></div><div class="vehicle-price--original">$75,995</div><div class="v7list-vehicle__comments">${hp}</div><a class="vehicle__image" data-src="//example.com/small.jpg|//example.com/large.jpg"></a>${spec("Vehicle Type", type)}${spec("LOA (Length)", length)}</div>`;
}

describe("expanded source coverage", () => {
  it("keeps collection metadata without listing URLs from collapsing into a fake single boat", () => {
    const html = `<script type="application/ld+json">${JSON.stringify([
      { "@type": "Vehicle", name: "2026 Lund A" },
      { "@type": "Vehicle", name: "2026 Lund B" },
    ])}</script>`;
    expect(
      adapters.dealer.parse(html, "https://example.com/inventory", config),
    ).toEqual([]);
  });
  it("recognizes smaller named outboards and an explicitly removed motor", () => {
    const parse = (description: string) =>
      adapters.craigslist.parse(
        `<span id="titletextonly">Fishing boat</span><div id="postingbody">${description}</div>`,
        "https://www.craigslist.org/view/one",
        config,
      )[0];
    expect(parse("Suzuki DF30A 2023 low hours.").horsepower).toBe(30);
    expect(parse("Great condition Johnson 115").horsepower).toBe(115);
    expect(
      parse("I/O has been removed – ready for a new engine.").horsepower,
    ).toBe(0);
    expect(
      parse("Maximum horsepower 250 hp. No power specification supplied.")
        .horsepower,
    ).toBeNull();
    expect(parse("350 Mercruiser V8").horsepower).toBeNull();
  });
  it("preserves separate dealer cards, installed motors, prices and inch measurements", () => {
    const html =
      spike("1", "2026 Lund 1875", "18 ft 10 in", "MERCURY 200 HP") +
      spike("2", "2026 Ranger 620", "20 ft 3 in", "MERCURY 250 PRO XS") +
      spike("3", "2026 Yamaha 250", "", "", "Outboard");
    const boats = adapters.dealer.parse(
      html,
      "https://www.foxlakeharbor.com/--inventory",
      config,
    );
    expect(boats).toHaveLength(2);
    expect(boats.map((b) => b.sourceListingId)).toEqual(["1", "2"]);
    expect(boats[0]).toMatchObject({
      price: 64995,
      horsepower: 200,
      city: "Fox Lake",
      state: "IL",
      photos: ["https://example.com/large.jpg"],
    });
    expect(boats[0].length).toBeCloseTo(18 + 10 / 12);
    expect(boats[1].horsepower).toBe(250);
  });
  it("joins Craigslist metadata by identity when extra DOM ads change positions", () => {
    const entry = (name: string, price: number, city: string, lat: number) => ({
      item: {
        name,
        offers: {
          price,
          availableAtOrFrom: {
            address: { addressLocality: city, addressRegion: "IL" },
            geo: { latitude: lat, longitude: -88.4 },
          },
        },
      },
      position: 0,
    });
    const card = (id: string, name: string, price: number) =>
      `<li class="cl-static-search-result"><a href="/view/${id}"><div class="title">${name}</div><div class="price">$${price}</div><div class="location">seller neighborhood</div></a></li>`;
    const html =
      `<script id="ld_searchpage_results" type="application/ld+json">${JSON.stringify({ itemListElement: [entry("2006 Mastercraft X1", 25000, "Channahon", 41.4), entry("2021 Lund 200 hp", 60000, "Morris", 41.3)] })}</script>` +
      card("ad", "Clearance", 1) +
      card("lund", "2021 Lund 200 hp", 60000) +
      card("mc", "2006 Mastercraft X1", 25000);
    const boats = adapters.craigslist.parse(
      html,
      "https://www.craigslist.org/search/area/chicago?cat=boo",
      config,
    );
    expect(boats).toHaveLength(2);
    expect(boats[0]).toMatchObject({
      city: "Morris",
      lat: 41.3,
      horsepower: 200,
      sourceUrl: "https://www.craigslist.org/view/lund",
    });
    expect(boats[1]).toMatchObject({
      city: "Channahon",
      lat: 41.4,
      make: "MasterCraft",
      price: 25000,
    });
  });
  it("reads modern Craigslist attribute labels without mistaking year for power", () => {
    const html = `<span id="titletextonly">2005 Lund Pro V</span><div id="postingbody">Powered by a Mercury 250 Pro XS.</div><div class="attrgroup"><div class="attr"><span class="labl">length overall (LOA):</span><span class="valu">20.5</span></div><div class="attr"><span class="labl">engine hours (total):</span><span class="valu">360</span></div></div>`;
    const [boat] = adapters.craigslist.parse(
      html,
      "https://www.craigslist.org/view/boat",
      config,
    );
    expect(boat).toMatchObject({
      length: 20.5,
      horsepower: 250,
      engineHours: 360,
    });
  });
  it("does not read an eight-foot Power Pole as boat length or pull out-of-region owner ads", () => {
    const ad = (state: string) =>
      `<div class="fwpl-result"><div class="boatInfo">2021 Phoenix 819 Pro</div><div class="boatInfo">2021 200 Mercury Pro XS</div><div class="boat-desc">8′ Power Pole Blades. Motor has 331 hours.</div><div class="tag-location">Davenport, ${state}</div><div class="pid">123</div></div>`;
    const boats = adapters.dealer.parse(
      ad("IA") + ad("TX"),
      "https://bassboatcentral.com/boats-for-sale/phoenix/",
      config,
    );
    expect(boats).toHaveLength(1);
    expect(boats[0]).toMatchObject({
      length: null,
      horsepower: 200,
      engineHours: 331,
    });
  });
  it("discovers dealer and classifieds pagination without crossing origins", () => {
    expect(
      inventoryPages(
        `<div class="v7list-results"></div><a href="/default.asp?pg=2">Next</a><a href="https://other.test/?pg=3">Other</a>`,
        "https://dealer.test/inventory",
      ),
    ).toEqual(["https://dealer.test/default.asp?pg=2"]);
    const html =
      'window.FWP_JSON = {"preload_data":{"settings":{"pager":{"total_pages":3}}}};';
    expect(
      inventoryPages(
        html,
        "https://bassboatcentral.com/boats-for-sale/ranger/",
      ),
    ).toEqual([
      "https://bassboatcentral.com/boats-for-sale/ranger/?_paged=2",
      "https://bassboatcentral.com/boats-for-sale/ranger/?_paged=3",
    ]);
  });
  it("keeps unknown lengths outside the shortlist but allows explicit broader views", () => {
    const boat = normalizeListing(
      { title: "2020 Lund Pro V", horsepower: 250, lat: 41.4, lng: -88.4 },
      "Test",
      "https://example.com/boat",
    );
    expect(matches(boat, LAKE_HOLIDAY_FILTERS)).toBe(false);
    expect(
      matches(
        boat,
        LAKE_SEARCHES.find((s) => s.id === "holiday-review")!.filters,
      ),
    ).toBe(true);
    expect(
      matches(
        { ...boat, length: 22 },
        LAKE_SEARCHES.find((s) => s.id === "holiday-review")!.filters,
      ),
    ).toBe(false);
    expect(
      matches(
        { ...boat, length: 22 },
        LAKE_SEARCHES.find((s) => s.id === "holiday-all-nearby")!.filters,
      ),
    ).toBe(true);
  });
});
