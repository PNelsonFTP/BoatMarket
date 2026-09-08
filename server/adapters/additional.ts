import * as cheerio from "cheerio";
import type { Listing } from "../../lib/types";
import type { SourceConfig } from "./types";
import { normalizeListing, parseLengthFeet } from "./normalize";
import { enginePower } from "./regional";
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const money = (text: string) => {
  const value = text.match(/\$\s*([\d ,]+(?:\.\d{2})?)/)?.[1];
  return value ? Number(value.replace(/[ ,]/g, "")) : null;
};
const unique = (listings: Listing[]) => [
  ...new Map(listings.map((l) => [l.sourceListingId, l])).values(),
];
const boatMakes =
  /^(?:Apex Quest|G3|Go Devil|Hurricane|Landau|Lowe|Nitro|Phoenix|Ranger|Sea Nymph|Skeeter|Tracker|Triton|Vexus|Viper|War Eagle)$/i;
function stockStatus(text: string): Listing["status"] {
  return /\bsold\b/i.test(text) ? "sold" : "active";
}
export function additionalListings(
  html: string,
  url: string,
  config: SourceConfig,
): Listing[] | null {
  const host = new URL(url).hostname;
  if (host === "www.hubersmarine.com") return hubers(html, url, config);
  if (host === "www.questwatersports.com") return quest(html, url, config);
  if (["4boatworks.net", "theboatcenter.com"].includes(host))
    return motors(html, url, config);
  return null;
}
function hubers(html: string, url: string, config: SourceConfig) {
  const $ = cheerio.load(html),
    listings: Listing[] = [];
  $(".search-result-grid").each((_, el) => {
    const node = $(el);
    let raw;
    try {
      raw = JSON.parse(node.find(".datasource").first().text());
    } catch {
      return;
    }
    // Inventory includes motors/accessories; the source's explicit type is required.
    if (
      !["Boats", "Pontoon", "Pontoons"].includes(raw.itemType) ||
      !raw.productId ||
      !raw.itemUrl
    )
      return;
    const availability = clean(node.find(".attributes-container").text());
    listings.push(
      normalizeListing(
        {
          title: `${raw.itemYear} ${raw.itemMake} ${raw.itemModel}`,
          sourceListingId: String(raw.productId),
          url: raw.itemUrl,
          make: raw.itemMake,
          model: raw.itemModel,
          year: raw.itemYear,
          price: money(node.find(".display-price-box").first().text()),
          photos: node
            .find(".zoom-img-btn[href]")
            .map((_, e) => $(e).attr("href")!)
            .get()
            .filter((photo) => !/no-image|placeholder/i.test(photo)),
          city: "La Porte",
          state: "IN",
          sellerName: "Huber's Marine",
          sellerType: "Dealer",
          status: stockStatus(availability),
          condition: raw.usageStatus,
          category: /^Pontoons?$/.test(raw.itemType)
            ? "Pontoon"
            : /Nautique/i.test(raw.itemModel)
              ? "Ski / wake / surf"
              : null,
          specs: {
            ...(raw.vin ? { hin: raw.vin } : {}),
            stockNumber: raw.stockNumber || "",
            sourceAvailability: availability,
            locationBasis:
              "Advertised dealer location; boat storage location unverified",
          },
        },
        config.name,
        url,
      ),
    );
  });
  if (listings.length || !$("h1.product-title").length) return unique(listings);
  const specs = Object.fromEntries(
    $(".vdp-product-overview")
      .map((_, e) => [
        [
          clean($(e).find("strong").first().text()).toLowerCase(),
          clean($(e).children("span").text()),
        ],
      ])
      .get(),
  );
  const title = clean($("h1.product-title").first().text()),
    id = new URL(url).pathname.match(/-(\d+)i$/)?.[1];
  if (!id) return [];
  const description = clean($(".description-richtext").first().text());
  return [
    normalizeListing(
      {
        title,
        sourceListingId: id,
        url,
        description,
        price: money($(".title-price-container .price-wrapper").first().text()),
        length: specs.length,
        horsepower: specs.horsepower,
        engineHours: specs["engine hours"] || specs.hours,
        propulsion: /outboard/i.test(specs["engine type"] || "")
          ? "Outboard"
          : /inboard/i.test(specs["engine type"] || "")
            ? "Inboard"
            : null,
        category: /Nautique/i.test(title) ? "Ski / wake / surf" : null,
        city: "La Porte",
        state: "IN",
        sellerName: "Huber's Marine",
        sellerType: "Dealer",
        status: stockStatus(specs.availability || ""),
        condition: specs["new/used"],
        photos: $("a.zoom-img-btn[href], .product-image-slider a[href]")
          .map((_, e) => $(e).attr("href")!)
          .get()
          .filter(
            (photo) =>
              /\.(?:jpg|png|webp)(?:\?|$)/i.test(photo) &&
              !/no-image|placeholder/i.test(photo),
          ),
        specs: {
          ...specs,
          hin: specs.vin || "",
          stockNumber: specs["stock #"] || "",
          sourceAvailability: specs.availability || "",
          locationBasis:
            "Advertised dealer location; boat storage location unverified",
          engineDescription: clean(
            `${specs["engine make"] || ""} ${specs["engine model"] || ""}`,
          ),
        },
      },
      config.name,
      url,
    ),
  ];
}
function quest(html: string, url: string, config: SourceConfig) {
  const $ = cheerio.load(html),
    listings: Listing[] = [];
  $(".inventory-card").each((_, el) => {
    const node = $(el),
      title = clean(node.find(".single-car-name").text());
    const href = node
      .find(".single-car-details")
      .attr("onclick")
      ?.match(/^getDetailed\('(\/[^']+)'\)$/)?.[1];
    if (
      !href ||
      !title ||
      /Hydrohoist|Sea-Doo|Wave\s*runner|boat lift/i.test(title)
    )
      return;
    const facts = Object.fromEntries(
      node
        .find("ul.list-unstyled li")
        .map((_, e) => [
          [
            clean($(e).find("p").text()).toLowerCase(),
            clean($(e).find("span").text()),
          ],
        ])
        .get(),
    );
    const parts = title.match(/^(\d{4})\s+(\S+)\s+(.+)$/);
    listings.push(
      normalizeListing(
        {
          title,
          url: href,
          sourceListingId: href.match(/-c-(\d+)\//)?.[1] || href,
          year: parts?.[1],
          make: parts?.[2],
          model: parts?.[3],
          price: money(node.find(".single-car-amount").text()),
          length: facts.length,
          horsepower: facts.horsepower,
          description: clean(node.find(".single-car-des").text()),
          photos: node
            .find(".single-car-image img[src]")
            .map((_, e) => $(e).attr("src")!)
            .get(),
          city: "Ottawa",
          state: "IL",
          sellerName: "Quest Watersports",
          sellerType: "Dealer",
          specs: {
            ...facts,
            hullMaterial: facts["hull type"] || "",
            locationBasis:
              "Advertised dealer location; boat storage location unverified",
            sourceAvailability:
              "Present in public inventory; seller confirmation required",
          },
        },
        config.name,
        url,
      ),
    );
  });
  return unique(listings);
}
function motors(html: string, url: string, config: SourceConfig) {
  const $ = cheerio.load(html),
    center = new URL(url).hostname === "theboatcenter.com",
    listings: Listing[] = [];
  $("a.rmv_txt_drctn").each((_, el) => {
    const node = $(el),
      href = node.attr("href"),
      title = clean(node.find(".car-title").text());
    if (!href || !title) return;
    const values = node
      .find(".car-meta-bottom li span")
      .map((_, e) => clean($(e).text()))
      .get();
    const boatAt = values.indexOf("BOATS"),
      make = center ? values[boatAt + 1] : values[0];
    if (center ? boatAt < 0 : !boatMakes.test(make || "")) return;
    const state = center ? values.find((v) => /^(WI|MN)$/.test(v)) : "IL";
    const modelValue = center ? values[boatAt + 2] : values[1];
    const model =
      modelValue && !/^(New|Used)$/.test(modelValue) && modelValue !== state
        ? modelValue
        : undefined;
    const lengthText = center
      ? undefined
      : values.find((v) =>
          /^\d{1,2}(?:\.\d+)?(?:['’](?:\d{1,2}["”])?|\s*ft)$/i.test(v),
        );
    const engine =
      values.find((v) =>
        /Mercury|Yamaha|Suzuki|Evinrude|Mud Buddy|Honda|Tohatsu/i.test(v),
      ) || "";
    const power = values.find((v) => /^\d{2,3}\s*hp$/i.test(v));
    const city = center
      ? state === "WI"
        ? "Chippewa Falls"
        : state === "MN"
          ? "Ramsey"
          : null
      : "Keyesport";
    listings.push(
      normalizeListing(
        {
          title,
          url: href,
          make,
          model,
          price: money(node.find(".price").text()),
          length: lengthText,
          horsepower: power || enginePower(engine),
          city,
          state,
          sellerName: config.name,
          sellerType: "Dealer",
          description: clean(node.find(".listing-car-item-meta").text()),
          photos: node
            .find("img")
            .map((_, e) => $(e).attr("data-src") || $(e).attr("src") || "")
            .get()
            .filter((photo) => photo && !/placeholder/i.test(photo)),
          status: stockStatus(title),
          specs: {
            engineDescription: engine,
            sourceAvailability: /incoming/i.test(title)
              ? "Incoming; not confirmed onsite"
              : "Present in public inventory",
            locationBasis:
              "Dealer branch from source state; offsite boat location unverified",
            ...(center ? { stockNumber: values[0] } : {}),
          },
        },
        config.name,
        url,
      ),
    );
  });
  if (listings.length || !$(".t-row").length) return unique(listings);
  const facts = Object.fromEntries(
    $(".t-row")
      .map((_, e) => [
        [
          clean($(e).find(".t-label").text()).toLowerCase(),
          clean($(e).find(".t-value").text()),
        ],
      ])
      .get(),
  );
  const title = clean($("h1").first().text());
  if (!facts.make || (!center && !boatMakes.test(facts.make))) return [];
  return [
    normalizeListing(
      {
        title,
        url,
        make: facts.make,
        model: facts.model,
        year: facts.year,
        price: money($(".single-regular-price").text()),
        length: parseLengthFeet(facts.length),
        horsepower: enginePower(facts.engine || ""),
        city: center ? null : "Keyesport",
        state: center ? null : "IL",
        sellerName: config.name,
        sellerType: "Dealer",
        description: clean(
          $("#boat-description,.stm-tabs-content .tab-pane").first().text(),
        ),
        specs: {
          ...facts,
          engineDescription: facts.engine || "",
          locationBasis:
            "Advertised dealer location; offsite boat location unverified",
        },
      },
      config.name,
      url,
    ),
  ];
}
