import { expect, it } from "vitest";
import { adapters } from "../server/adapters";
import { normalizeListing } from "../server/adapters/normalize";
import { sourceConfigSchema } from "../server/adapters/types";
import { LAKE_SEARCHES } from "../lib/lake-holiday";
import { matches } from "../lib/search";

const config = sourceConfigSchema.parse({
  id: "craigslist",
  name: "Craigslist",
  adapter: "craigslist",
});
const url =
  "https://www.craigslist.org/view/d/dowagiac-tiger-shark-waverunner/hv3rJLaMVqNPo8VhuNJ4Gc";
const detail = (title: string, boatType = "") =>
  `<title>Boat for sale by owner</title><span id="titletextonly">${title}</span><span class="postingtitle"><span class="price">$395</span></span><div id="postingbody">Source fixture.</div><div class="attrgroup"><div class="attr"><span class="labl">boat type:</span><span class="valu">${boatType}</span></div><div class="attr"><span class="labl">length overall (LOA):</span><span class="valu">10</span></div></div>`;

it("limits Tige inference and model removal to the brand while preserving other make behavior", () => {
  for (const title of [
    "Tiger Shark Waverunner",
    "PROJECT - 2EA. 90hps Mercury TIGER Outboards",
  ])
    expect(normalizeListing({ title }, "Craigslist", url)).toMatchObject({
      make: null,
      model: null,
    });
  for (const [title, model] of [
    ["2020 Tige 21V", "21V"],
    ["Tige21", "21"],
    ["Tige-21V", "21V"],
    ["Tiger decal on Tige21", "Tiger decal on 21"],
  ])
    expect(normalizeListing({ title }, "Craigslist", url)).toMatchObject({
      make: "Tige",
      model,
    });
  expect(
    normalizeListing({ title: "1993 Suntracker Pontoon" }, "Dealer", url).make,
  ).toBe("Tracker");
  expect(
    normalizeListing({ title: "1993 Sun Tracker Pontoon" }, "Dealer", url).make,
  ).toBe("Sun Tracker");
});

it("honors explicit PWC attributes before generic ski terms and preserves the existing advertisement identity", () => {
  const [boat] = adapters.craigslist.parse(
    detail("Tiger Shark Waverunner", "personal watercraft (jet ski)"),
    url,
    config,
  );
  expect(boat).toMatchObject({
    id: "9ddb26436a384afc9149ae2c",
    sourceListingId: url,
    sourceUrl: url,
    title: "Tiger Shark Waverunner",
    make: null,
    model: null,
    category: "PWC",
    length: 10,
    price: 395,
  });
  const filters = LAKE_SEARCHES.find(
    (search) => search.id === "holiday-ski",
  )!.filters;
  // Even a retained Tige make must not admit explicit PWC evidence to the ski shortlist.
  expect(
    matches({ ...boat, make: "Tige", lat: 41.618, lng: -88.668 }, filters),
  ).toBe(false);
});

it("recognizes explicit PWC labels without treating every jet-powered boat as a PWC", () => {
  for (const value of [
    "PWC",
    "Jet Ski",
    "jet-ski",
    "WaveRunner",
    "wave runner",
  ])
    expect(
      adapters.craigslist.parse(detail("Watercraft", value), url, config)[0]
        .category,
    ).toBe("PWC");
  expect(
    adapters.craigslist.parse(detail("Jet boat", "jet boat"), url, config)[0]
      .category,
  ).not.toBe("PWC");
  expect(
    adapters.craigslist.parse(detail("Tige21"), url, config)[0].category,
  ).toBe("Ski / wake / surf");
  expect(
    adapters.craigslist.parse(detail("Mercury TIGER Outboards"), url, config)[0]
      .category,
  ).toBeNull();
});

it("classifies the same Waverunner safely from inventory summaries before details are requested", () => {
  const title = "Tiger Shark Waverunner";
  const item = { item: { name: title, offers: { price: 395 } } };
  const html = `<script id="ld_searchpage_results" type="application/ld+json">${JSON.stringify({ itemListElement: [item] })}</script><li class="cl-static-search-result"><a href="${url}"><div class="title">${title}</div><div class="price">$395</div></a></li>`;
  const [boat] = adapters.craigslist.parse(
    html,
    "https://www.craigslist.org/search/area/swmi?cat=boo",
    config,
  );
  expect(boat).toMatchObject({
    id: "9ddb26436a384afc9149ae2c",
    make: null,
    model: null,
    category: "PWC",
  });
});
