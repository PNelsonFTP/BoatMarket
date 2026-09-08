import * as cheerio from "cheerio";
import type { Listing } from "../../lib/types";
import type { SourceConfig } from "./types";
import { normalizeListing, parseNumber, parseLengthFeet } from "./normalize";
const clean = (v: string) => v.replace(/\s+/g, " ").trim();
const states: Record<string, string> = {
  Illinois: "IL",
  Wisconsin: "WI",
  Indiana: "IN",
  Iowa: "IA",
  Michigan: "MI",
};
function installedEngine(description: string) {
  return (
    description
      .slice(0, 550)
      .match(
        /(?:powered by|with|[.!])\s+(?:an?\s+)?(?:20\d{2}\s+)?((?:Mercury|Yamaha|Suzuki|Honda|Evinrude|Johnson)\s+[^.!\n]{1,55})/i,
      )?.[1] || ""
  );
}
function sourceLength(value: string | undefined) {
  const length = parseLengthFeet(value);
  return length != null && length >= 6 ? length : null;
}
function place(text: string) {
  const [city, state] = text.split(",").map(clean);
  return { city: city || null, state: states[state] || state || null };
}
// Only read explicit HP or a rated outboard model. Engine displacement and model
// numbers such as Ilmor 6.0 / PCM 409 must never become asserted horsepower.
export function enginePower(engine: string, description = ""): number | null {
  const explicit = engine.match(/\b(\d{2,3})\s*(?:hp|horsepower)\b/i);
  if (explicit) return Number(explicit[1]);
  const outboard =
    engine.match(
      /\b(?:Mercury|Yamaha|Suzuki|Honda|Evinrude|Johnson)\s+(?:(?:Pro\s*XS|Verado|Fourstroke|Vmax|SHO)\s*)*(?:VF|DF|F)?(\d{2,3})(?![\d.])/i,
    ) ||
    engine.match(/^(?:VF|DF|F)(\d{2,3})[A-Z]*/i) ||
    engine.match(/^(\d{2,3})\s+(?:Pro\s*XS|Verado|SHO|Fourstroke)\b/i);
  if (outboard) return Number(outboard[1]);
  const installed = description
    .slice(0, 450)
    .match(
      /(?:powered by|with)\s+(?:an?\s+)?(?:20\d{2}\s+)?((?:Mercury|Yamaha|Suzuki|Honda|Evinrude|Johnson)\s+[^.!\n]{1,60})/i,
    );
  return installed ? enginePower(installed[1]) : null;
}
function salePrice(text: string) {
  // Do not parse phone numbers, monthly payments, or a quote CTA as a price.
  const prices = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)].map((m) =>
    Number(m[1].replace(/,/g, "")),
  );
  return prices.length ? prices.at(-1)! : null;
}
function category(value: string) {
  if (/bass/i.test(value)) return "Bass";
  if (/multi|walleye|deep.?v/i.test(value)) return "Deep-V / multi-species";
  if (/pontoon|tritoon/i.test(value)) return "Pontoon";
  if (/aluminum/i.test(value)) return "Aluminum fishing";
  return null;
}
function specsFromText(description: string): Listing["specs"] {
  return {
    ...(/\btrailer\b/i.test(description) ? { "equipment.trailer": true } : {}),
    ...(/\b(?:Humminbird|Lowrance|Garmin)\b/i.test(description)
      ? { "equipment.fish_finder_sonar": true }
      : {}),
  };
}
export function regionalListings(
  html: string,
  url: string,
  config: SourceConfig,
): Listing[] | null {
  const host = new URL(url).hostname;
  if (host === "www.millerssport.com") return millers(html, url, config);
  if (host === "www.bedford-sales.com") return bedford(html, url, config);
  if (host === "onlyinboards.com" || host === "www.onlyinboards.com")
    return onlyInboards(html, url, config);
  return null;
}
function bedford(html: string, url: string, config: SourceConfig) {
  const $ = cheerio.load(html);
  if ($(".inventory-single-title h1").length) {
    const p: Record<string, string> = {};
    $(".single-info-desc-name").each((_, e) => {
      p[clean($(e).text()).toLowerCase()] = clean(
        $(e).next(".single-info-values").text(),
      );
    });
    if (p.category && /outboard|motor|trailer/i.test(p.category)) return [];
    const description = clean($(".single-desc").text());
    const engine =
      [p["engine manufacturer"], p.engine || p["engine horsepower"]]
        .filter(Boolean)
        .join(" ") || installedEngine(description);
    const rated = enginePower(engine, description);
    const reported = parseNumber(p["engine horsepower"]);
    const powerConflict =
      reported != null && rated != null && reported !== rated;
    const listing = normalizeListing(
      {
        title: clean($(".inventory-single-title h1").text()),
        url,
        make: p.make,
        model: p.model,
        year: p.year,
        price: salePrice(
          $(
            ".inventory-single-top .price-container, .inventory-single-price, .single-pricing, .single-price",
          )
            .first()
            .text(),
        ),
        description,
        length: p.length,
        horsepower: powerConflict ? null : (reported ?? rated),
        engineHours:
          p["engine hours"] ||
          description.match(
            /(?<![\d-])(\d{1,5})\s*(?:engine\s*)?(?:hours|hrs)\b/i,
          )?.[1],
        category:
          category(p.subcategory || "") ||
          (/Nitro|Phoenix|Bass.?Cat/i.test(p.make || "") ? "Bass" : null),
        propulsion: /Mercury|Yamaha|Suzuki|Honda|Evinrude|Johnson/i.test(engine)
          ? "Outboard"
          : null,
        city: "Morris",
        state: "IL",
        sellerName: "Bedford Sales & Outdoors",
        sellerType: "Dealer",
        photos: $('meta[property="og:image"]')
          .map((_, e) => $(e).attr("content"))
          .get(),
        specs: {
          ...specsFromText(description),
          ...(/off[ -]site/i.test(description)
            ? {
                boatLocationUnknown: true,
                locationWarning:
                  "Dealer says this boat is off site. Confirm its physical location before arranging a visit.",
              }
            : {}),
          ...(powerConflict
            ? {
                powerWarning: `Source conflict: engine specification ${reported} hp; engine model suggests ${rated} hp. Confirm with dealer.`,
              }
            : {}),
          condition: p.condition === "New" ? "New" : "Used",
          engineDescription: engine,
          sourceCategory: p.subcategory || "",
          ...(p.beam ? { beam: parseLengthFeet(p.beam) } : {}),
          ...(p["fuel capacity"]
            ? { fuelCapacity: parseNumber(p["fuel capacity"]) }
            : {}),
        },
      },
      config.name,
      url,
    );
    return [listing];
  }
  const result: Listing[] = [];
  $(".manage-inventory-container").each((_, e) => {
    const n = $(e),
      link = n.find("a.inventory-main-title").first();
    if (
      !link.attr("href") ||
      /outboard|motor|trailer/i.test(n.find(".list-type").text())
    )
      return;
    const title = clean(link.text());
    if (!title) return;
    const listing = normalizeListing(
      {
        title,
        url: link.attr("href"),
        price: salePrice(n.find(".list-pricing").text()),
        length: clean(n.find(".spec-value.length").text()),
        engineHours: clean(n.find(".spec-value.engine_hours").text()),
        city: "Morris",
        state: "IL",
        sellerName: "Bedford Sales & Outdoors",
        sellerType: "Dealer",
        photos: n
          .find("input.inventory-list-images")
          .map((_, p) => $(p).attr("value"))
          .get(),
      },
      config.name,
      url,
    );
    result.push(listing);
  });
  return result;
}
function onlyInboards(html: string, url: string, config: SourceConfig) {
  const $ = cheerio.load(html);
  if ($(".oib-boat-details-title h1").length) {
    const p: Record<string, string> = {};
    $(".oib-boat-detail-item").each((_, e) => {
      p[
        clean($(e).find(".oib-boat-detail-label").text())
          .replace(/:$/, "")
          .toLowerCase()
      ] = clean($(e).find(".oib-boat-detail-value").text());
    });
    let product: Record<string, any> = {};
    $('script[type="application/ld+json"]').each((_, e) => {
      try {
        const v = JSON.parse($(e).text());
        if (v["@type"] === "Product") product = v;
      } catch {}
    });
    const seller = $(".oib-seller-detail-item")
      .filter(
        (_, e) =>
          clean($(e).find(".oib-seller-detail-label").text()) === "Dealer",
      )
      .first();
    const description = String(product.description || "");
    return [
      normalizeListing(
        {
          title: clean($(".oib-boat-details-title h1").text()),
          url,
          make: p.make,
          model: p.model,
          year: p.year,
          price:
            Number(product.offers?.price) > 0 ? product.offers.price : null,
          description,
          length: p.length,
          engineHours: p["engine hours"],
          horsepower: enginePower(p.engine || "", description),
          ...place(p.location || ""),
          category: "Ski / wake / surf",
          propulsion: /direct|v.?drive/i.test(p["drive type"] || "")
            ? "Inboard"
            : null,
          sellerName:
            clean(seller.find(".oib-seller-detail-link").first().text()) ||
            null,
          sellerType: seller.length ? "Dealer" : null,
          photos: product.image || [],
          status: String(product.offers?.availability || "").includes("SoldOut")
            ? "sold"
            : "active",
          specs: {
            postalCode: p.location?.match(/\b\d{5}\b/)?.[0] || "",
            engineDescription: p.engine || "",
            driveType: p["drive type"] || "",
            ...specsFromText(description),
          },
        },
        config.name,
        url,
      ),
    ];
  }
  const result: Listing[] = [];
  $(".oib-item-title").each((_, e) => {
    const n = $(e).closest(".oib-item");
    const link = $(e).find("a").first();
    const p: Record<string, string> = {};
    n.find(".oib-badge-description").each((_, b) => {
      const d = $(b).children("div");
      p[clean(d.first().text()).toLowerCase()] = clean(d.last().text());
    });
    const href = link.attr("href");
    if (!href) return;
    const location = clean(n.find(".oib-mobile-card-location span").text());
    result.push(
      normalizeListing(
        {
          title: clean(link.text()),
          url: href,
          make: p.make,
          model: p.model,
          year: p.year,
          price: salePrice(n.find(".oib-price").first().text()),
          length: p.length,
          engineHours: clean(n.find(".oib-mobile-card-hours span").text()),
          ...place(location),
          category: "Ski / wake / surf",
          propulsion: "Inboard",
          photos: n
            .find(".oib-available-photo")
            .map((_, p) => $(p).attr("data-src"))
            .get(),
          description: clean(n.find(".oib-description-box").first().text()),
          specs: { postalCode: p.location?.match(/\b\d{5}\b/)?.[0] || "" },
        },
        config.name,
        url,
      ),
    );
  });
  return [...new Map(result.map((l) => [l.id, l])).values()];
}

function millers(html: string, url: string, config: SourceConfig) {
  const $ = cheerio.load(html);
  if ($(".ww-invdetailtext h2").length) {
    const n = $(".ww-invdetailtext").first(),
      p: Record<string, string> = {};
    $("table tr").each((_, e) => {
      const cells = $(e).find("td");
      if (cells.length === 2)
        p[clean(cells.first().text()).toLowerCase()] = clean(
          cells.last().text(),
        );
    });
    const title = clean(n.find("h2").text()),
      meta = clean(n.children("span").first().text());
    if (/Category: (?:Outboard|Motor|Trailer)/i.test(meta)) return [];
    const description =
      clean($("#invaccorda").text()) || clean(n.find("p").last().text());
    return [
      normalizeListing(
        {
          title,
          url,
          price: salePrice(n.find("p .fs-5.text-nowrap").first().text()),
          length: sourceLength(p.length),
          horsepower: p["engine power"],
          engineHours: p["engine hours"] || p.hours,
          city: "Lanark",
          state: "IL",
          sellerName: "Miller’s Sport Center",
          sellerType: "Dealer",
          category:
            category(p["boat type"] || "") ||
            (/Ranger|Nitro|Bass Cat|Triton|Phoenix|Falcon|Skeeter/i.test(title)
              ? "Bass"
              : /Lund|Crestliner|Alumacraft/i.test(title)
                ? "Deep-V / multi-species"
                : null),
          propulsion: /outboard/i.test(p.propulsion || "") ? "Outboard" : null,
          description,
          status: /\bSold\b/i.test(meta) ? "sold" : "active",
          photos: $(".invcarouseldetail1 img")
            .map((_, e) => $(e).attr("src"))
            .get(),
          specs: {
            ...(p.length && sourceLength(p.length) == null
              ? {
                  lengthWarning: `Source reports implausible length: ${p.length}. Confirm with dealer.`,
                }
              : {}),
            engineDescription: p.engine || "",
            postalCode: "61046",
            condition: /Pre-Owned/i.test(meta) ? "Used" : "New",
            ...(p.beam ? { beam: parseLengthFeet(p.beam) } : {}),
          },
        },
        config.name,
        url,
      ),
    ];
  }
  const result: Listing[] = [];
  $(".card h6.card-title").each((_, e) => {
    const n = $(e).closest(".card"),
      link = $(e).closest("a"),
      title = clean($(e).text());
    if (
      !link.attr("href") ||
      /^(?:20\d{2}\s+)?(?:Mercury|Evinrude|Suzuki|Yamaha|Honda)\b/i.test(title)
    )
      return;
    result.push(
      normalizeListing(
        {
          title,
          url: link.attr("href"),
          price: salePrice(
            n.find(".ww_invprice .fs-5.text-nowrap").first().text(),
          ),
          city: "Lanark",
          state: "IL",
          sellerName: "Miller’s Sport Center",
          sellerType: "Dealer",
          description: clean(n.find(".ww_invdesc").text()),
          status: /\bSold\b/i.test(n.find(".card-text.badge").text())
            ? "sold"
            : "active",
          photos: n
            .find(".carousel-item img")
            .map((_, e) => $(e).attr("src"))
            .get(),
          specs: { postalCode: "61046" },
        },
        config.name,
        url,
      ),
    );
  });
  return result;
}
