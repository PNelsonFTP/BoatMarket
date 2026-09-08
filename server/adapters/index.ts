import * as cheerio from "cheerio";
import type { Adapter, SourceConfig } from "./types";
import type { Listing } from "../../lib/types";
import { normalizeListing } from "./normalize";
import { regionalListings } from "./regional";
const isProduct = (value: unknown) =>
  [value]
    .flat()
    .some((type) =>
      ["Product", "Vehicle", "Boat", "IndividualProduct"].includes(
        String(type),
      ),
    );
import {
  dealerSpike,
  gordys,
  bassBoatCentral,
  craigslistExpanded,
  starvedRock,
} from "./expanded";
function flatten(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (!value || typeof value !== "object") return [];
  const v = value as Record<string, unknown>;
  return [
    v,
    ...Object.entries(v)
      .filter(([k]) =>
        ["@graph", "itemListElement", "item", "mainEntity"].includes(k),
      )
      .flatMap(([, x]) => flatten(x)),
  ];
}
export function structuredListings(
  html: string,
  url: string,
  config: SourceConfig,
) {
  const $ = cheerio.load(html);
  const records: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      records.push(...flatten(JSON.parse($(el).text())));
    } catch {
      /* malformed unrelated metadata is ignored */
    }
  });
  const listings: Listing[] = [];
  const productCount = records.filter((r) => isProduct(r["@type"])).length;
  for (const item of records) {
    if (!isProduct(item["@type"])) continue;
    const offer = (
      Array.isArray(item.offers) ? item.offers[0] : item.offers || {}
    ) as Record<string, unknown>;
    if (productCount > 1 && !item.url && !offer.url) continue;
    if (offer.priceCurrency && offer.priceCurrency !== "USD") continue;
    const seller = (offer.seller || item.seller || {}) as Record<
      string,
      unknown
    >;
    const address = (item.address || seller.address || {}) as Record<
      string,
      unknown
    >;
    const geo = (item.geo || {}) as Record<string, unknown>;
    const brand =
      typeof item.brand === "object" && item.brand
        ? (item.brand as Record<string, unknown>).name
        : item.brand;
    const props = Array.isArray(item.additionalProperty)
      ? Object.fromEntries(
          item.additionalProperty.map((p: { name: string; value: unknown }) => [
            p.name?.toLowerCase(),
            p.value,
          ]),
        )
      : {};
    listings.push(
      normalizeListing(
        {
          title: item.name,
          url: item.url || offer.url,
          sourceListingId: item.sku || item.productID || item.url,
          description: item.description,
          make: brand,
          model: item.model,
          year: item.vehicleModelDate || props.year,
          price: offer.price ?? offer.lowPrice,
          photos: Array.isArray(item.image)
            ? item.image
            : [item.image].filter(Boolean),
          length: props.length,
          horsepower: props.horsepower || props.hp,
          engineHours: props["engine hours"],
          city: address.addressLocality,
          state: address.addressRegion,
          lat: geo.latitude,
          lng: geo.longitude,
          sellerName: seller.name,
          sellerType: seller["@type"] === "Organization" ? "Dealer" : null,
          status: String(offer.availability).includes("SoldOut")
            ? "sold"
            : "active",
          specs: {
            ...(props["hull material"]
              ? { hullMaterial: props["hull material"] }
              : {}),
            ...(props["hull identification number"]
              ? { hin: props["hull identification number"] }
              : {}),
          },
        },
        config.name,
        url,
      ),
    );
  }
  return [...new Map(listings.map((l) => [l.sourceListingId, l])).values()];
}
export function selectorListings(
  html: string,
  url: string,
  config: SourceConfig,
) {
  const $ = cheerio.load(html),
    s = config.selectors;
  if (!s) return [];
  const listings: Listing[] = [];
  $(s.item).each((_, el) => {
    const node = $(el),
      link =
        node.find(s.link).first().attr("href") ||
        node.filter(s.link).attr("href");
    const title = node.find(s.title).first().text().trim();
    if (!link || !title) return;
    const image = s.image ? node.find(s.image).first() : null;
    const location = s.location ? node.find(s.location).text().trim() : "";
    listings.push(
      normalizeListing(
        {
          title,
          url: link,
          price: node.find(s.price).text(),
          image: image?.attr("src") || image?.attr("data-src"),
          city: location || null,
        },
        config.name,
        url,
      ),
    );
  });
  return listings;
}
const craigslist: Adapter = {
  id: "craigslist",
  parse(html, url, c) {
    const expanded = craigslistExpanded(html, url, c);
    if (expanded !== null) return expanded;
    const structured = structuredListings(html, url, c);
    if (structured.length) return structured;
    return selectorListings(html, url, {
      ...c,
      selectors: {
        item: ".cl-static-search-result, .result-row, .cl-search-result",
        title: ".title, .result-title, .posting-title",
        link: "a",
        price: ".price, .result-price",
        image: "img",
        location: ".location, .result-hood",
      },
    });
  },
};
export const adapters: Record<SourceConfig["adapter"], Adapter> =
  Object.fromEntries(
    [
      "boattrader",
      "yachtworld",
      "boats",
      "iboats",
      "ebay",
      "cpo",
      "dealer",
    ].map((id) => [
      id,
      {
        id,
        parse(html: string, url: string, c: SourceConfig) {
          const host = new URL(url).hostname;
          if (host === "www.gordysboats.com") return gordys(html, url, c);
          if (host === "bassboatcentral.com")
            return bassBoatCentral(html, url, c);
          if (host === "www.starvedrockmarina.com")
            return starvedRock(html, url, c);
          const spike = dealerSpike(html, url, c);
          if (spike !== null) return spike;
          const regional = regionalListings(html, url, c);
          if (regional !== null) return regional;
          const structured = structuredListings(html, url, c);
          return structured.length
            ? structured
            : selectorListings(html, url, c);
        },
      },
    ]),
  ) as Record<SourceConfig["adapter"], Adapter>;
adapters.craigslist = craigslist;
adapters.facebook = {
  id: "facebook",
  parse() {
    throw new Error(
      "Facebook uses user-exported JSON import. Automated session collection is not enabled.",
    );
  },
};
