import * as cheerio from "cheerio";
import type { Listing } from "../../lib/types";
import type { SourceConfig } from "./types";
import { normalizeListing, parseLengthFeet, parseNumber } from "./normalize";
import { enginePower } from "./regional";

const clean = (v: string) => v.replace(/\s+/g, " ").trim();
const textOnly = (v: unknown) => clean(cheerio.load(String(v || "")).text());
const money = (v: string) =>
  parseNumber(v.match(/\$\s*[\d,]+(?:\.\d{2})?/)?.[0]);
const lengthInText = (v: string) =>
  parseLengthFeet(
    v.match(
      /\b\d{1,2}(?:\.\d+)?\s*(?:ft\b|feet\b|foot\b|[’′'])(?:\s*\d{1,2}\s*(?:in\b|[”″"]))?/i,
    )?.[0],
  );
function advertisedMotor(description: string) {
  if (
    /\b(?:no (?:motor|engine)|(?:motor|engine|I\/O) (?:has been |was )?removed)\b/i.test(
      description,
    )
  )
    return 0;
  const text = description.replace(
    /[^.!?]*(?:maximum horsepower|max(?:imum)? hp|rated for|capacity rating|trolling motor)[^.!?]*[.!?]?/gi,
    " ",
  );
  const engine = text.match(
    /\b(Mercury|Yamaha|Suzuki|Honda|Evinrude|Johnson)\s+(?:(?:Pro\s*XS|Verado|Fourstroke|Vmax|SHO)\s*)*(?:VF|DF|F)?\d{2,3}(?![\d.])[^.!?]{0,35}/i,
  )?.[0];
  return (
    (engine ? enginePower(engine) : null) ??
    enginePower("", text) ??
    parseNumber(text.match(/\b(\d{2,3})\s*hp\b/i)?.[1])
  );
}
const boatCategory = (v: string) =>
  /\b(?:personal\s+watercraft|pwc|jet[\s-]*skis?|wave[\s-]*runners?)\b/i.test(v)
    ? "PWC"
    : /pontoon|tritoon/i.test(v)
      ? "Pontoon"
      : /ski|wake|surf|MasterCraft|Nautique|Malibu|Supra|Moomba|(?<![a-z])Tige(?![a-z])|Centurion|Axis/i.test(
            v,
          )
        ? "Ski / wake / surf"
        : /bass|Phoenix|Ranger|Nitro|Skeeter|Triton|Bass\s*Cat|Falcon|Caymas|Vexus/i.test(
              v,
            )
          ? "Bass"
          : /fish|Lund|Alumacraft|Crestliner|Warrior/i.test(v)
            ? "Deep-V / multi-species"
            : /bowrider|runabout/i.test(v)
              ? "Bowrider"
              : null;

// Dealer Spike's summary JSON-LD omits URLs, IDs, length and motor data.
// Read the visible inventory cards so every physical inventory record survives.
export function dealerSpike(
  html: string,
  url: string,
  config: SourceConfig,
): Listing[] | null {
  const $ = cheerio.load(html);
  const detail = $(".unitTitle h1").length > 0;
  if (!detail && !$(".v7list-vehicle").length) return null;
  const locations: Record<string, [string, string]> = {
    "www.foxlakeharbor.com": ["Fox Lake", "IL"],
    "www.lakecountywatersports.com": ["Wauconda", "IL"],
    "www.tedsboatarama.com": ["Rock Island", "IL"],
  };
  const [city, state] = locations[new URL(url).hostname] || [];
  const listings: Listing[] = [];
  (detail ? $("#main") : $(".v7list-vehicle")).each((_, e) => {
    const n = $(e),
      p: Record<string, string> = {};
    n.find(detail ? ".liUnit" : ".vehicle-specs__item").each((_, row) => {
      const r = $(row);
      p[
        clean(
          r.find(detail ? ".unitLabel" : ".vehicle-specs__label").text(),
        ).toLowerCase()
      ] = clean(r.find(detail ? ".unitValue" : ".vehicle-specs__value").text());
    });
    if (p["vehicle type"] && !/^boat$/i.test(p["vehicle type"])) return;
    const title = clean(
      n
        .find(detail ? ".unitTitle h1" : ".vehicle-heading__link")
        .first()
        .text(),
    );
    const link = detail ? url : n.find(".vehicle-heading__link").attr("href");
    if (!title || !link) return;
    const engine = clean(
      n
        .find(detail ? ".invUnitHeader .unitText" : ".v7list-vehicle__comments")
        .text(),
    );
    const description = clean(
      n
        .find(
          detail ? "#accordionInfo .panel-body" : ".v7list-description__text",
        )
        .text(),
    );
    const pending = /sale pending/i.test(
      n
        .find(detail ? ".invUnitHeader" : ".v7list-vehicle__visible-content")
        .text(),
    );
    const photos = detail
      ? n
          .find("#invImageGallery li[data-src]")
          .map((_, img) => $(img).attr("data-src")!)
          .get()
      : n
          .find(".vehicle__image[data-src]")
          .map(
            (_, img) =>
              $(img)
                .attr("data-dsp-large-image")
                ?.match(/url\(['"]?([^'")]+)/)?.[1] ||
              $(img).attr("data-src")!.split("|").at(-1)!,
          )
          .get();
    const inquiry = n.find('a[href*="oid="]').first().attr("href");
    const params = inquiry ? new URL(inquiry, url).searchParams : null;
    listings.push(
      normalizeListing(
        {
          title,
          url: link,
          sourceListingId: detail
            ? $("#hdnInventoryID").attr("value") || params?.get("oid")
            : params?.get("oid"),
          make:
            p.make || clean(n.find(".vehicle-heading__name").first().text()),
          model:
            p.model || clean(n.find(".vehicle-heading__model").first().text()),
          year:
            p.year || clean(n.find(".vehicle-heading__year").first().text()),
          price: money(
            n
              .find(
                detail
                  ? ".unitPrice"
                  : ".vehicle-price--current .vehicle-price__price",
              )
              .first()
              .text(),
          ),
          description: [engine, description].filter(Boolean).join(". "),
          photos,
          length: p["loa (length)"] || p.length,
          horsepower: parseNumber(p["engine power"]) ?? enginePower(engine),
          engineHours: p["engine hours"] || p.hours,
          city,
          state,
          sellerName: config.name,
          sellerType: "Dealer",
          condition: p.condition,
          category: boatCategory(p.category || title),
          status: /\bsold\b/i.test(
            n.find(".vehicle-status, .unitSold, .vehicle__badge").text(),
          )
            ? "sold"
            : "active",
          specs: {
            ...(engine ? { engineDescription: engine } : {}),
            ...(pending ? { availability: "Sale pending" } : {}),
            ...(p.vin || params?.get("vin")
              ? { hin: p.vin || params?.get("vin") }
              : {}),
            ...(p["hull material"] ? { hullMaterial: p["hull material"] } : {}),
          },
        },
        config.name,
        url,
      ),
    );
  });
  return listings;
}

// Parse JSON assigned by the server without evaluating remote JavaScript.
export function assignedJson(
  html: string,
  name: string,
): Record<string, any> | null {
  const start = html.indexOf(name);
  if (start < 0) return null;
  const first = html.indexOf("{", start);
  let depth = 0,
    quote = false,
    escape = false;
  for (let i = first; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') quote = false;
    } else if (c === '"') quote = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(first, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
export function gordys(
  html: string,
  url: string,
  config: SourceConfig,
): Listing[] {
  const data = assignedJson(html, "window.__SERVER_STATE__ =");
  const $ = cheerio.load(html);
  const results = Object.values(data?.initialResults || {}).flatMap(
    (v: any) => v.results || [],
  );
  const hits = [
    ...new Map(
      results.flatMap((r: any) => r.hits || []).map((b: any) => [b.id, b]),
    ).values(),
  ] as Record<string, any>[];
  return hits.flatMap((b) => {
    if (
      b.currency !== "USD" ||
      !b.published ||
      b.deleted_at ||
      b.categories?.some((c: any) => /trailer|lift/i.test(c.name))
    )
      return [];
    const link = $("a[href]")
      .map((_, e) => $(e).attr("href")!)
      .get()
      .find((h) => h.includes("/" + b.slug));
    if (!link) return [];
    const p = Object.fromEntries(
      (b.boat_attributes || []).map((a: any) => [a.field_name, a.value]),
    );
    return [
      normalizeListing(
        {
          title: b.name,
          url: link,
          sourceListingId: String(b.id),
          make: b.manufacturer?.name,
          model: b.boat_model?.name,
          year: b.year,
          price: b.discount_price || b.discounted_price || b.price || null,
          description: textOnly(b.description),
          photos: b.images,
          length: p.length || b.length,
          horsepower: p["engine-horsepower"],
          engineHours: p.hours,
          city: b.location?.city,
          state: b.location?.state,
          sellerName: b.location?.dealership_name || config.name,
          sellerType: "Dealer",
          condition: b.usage,
          category: boatCategory(b.category || b.name),
          propulsion: p.drive,
          status: /sold/i.test(b.status) ? "sold" : "active",
          specs: {
            ...(b.vin ? { hin: b.vin } : {}),
            ...(p.power ? { engineDescription: p.power } : {}),
            ...(b.location?.postal_code
              ? { postalCode: b.location.postal_code }
              : {}),
          },
        },
        config.name,
        url,
      ),
    ];
  });
}

export function bassBoatCentral(
  html: string,
  url: string,
  config: SourceConfig,
): Listing[] {
  const $ = cheerio.load(html),
    listings: Listing[] = [];
  $(".fwpl-result").each((_, e) => {
    const n = $(e),
      title = clean(n.find(".boatInfo").eq(0).text()),
      engine = clean(n.find(".boatInfo").eq(1).text());
    const location = clean(n.find(".tag-location").text());
    const match = location.match(/^(.+),\s*(IL|WI|IN|IA|MI)\b/);
    const id = clean(n.find(".pid").text());
    if (!match || !id || !title) return;
    const description = clean(n.find(".boat-desc").text());
    const engineRating = engine
      .replace(/^(?:19|20)\d{2}\s+/, "")
      .match(/^(\d{2,3})\s+(Mercury|Yamaha|Suzuki|Honda|Evinrude|Johnson)\b/i);
    const anchor = n.find(".photoswipe-gallery[id]").first().attr("id");
    listings.push(
      normalizeListing(
        {
          title,
          url: url.split("#")[0] + (anchor ? "#" + anchor : ""),
          sourceListingId: id,
          price: money(n.find(".tag-price").text()),
          description,
          city: match[1],
          state: match[2],
          horsepower: engineRating
            ? Number(engineRating[1])
            : enginePower(engine),
          length: lengthInText(
            description.match(
              /\b(?:length|loa|hull length|boat length)\s*[:=-]?\s*\d[^,;.]{0,25}/i,
            )?.[0] || "",
          ),
          engineHours:
            description.match(/(?:motor|engine) has ([\d,]+) hours/i)?.[1] ||
            description.match(/([\d,]+) (?:engine |motor )?hours/i)?.[1],
          photos: n
            .find(".photoswipe-item[href]")
            .map((_, img) => $(img).attr("href")!)
            .get(),
          sellerName: clean(n.find(".contact-seller-button").text()).replace(
            /\s*[–-]\s*(IL|WI|IN|IA|MI)$/,
            "",
          ),
          sellerType: /marine|motorsports|boats|sales/i.test(
            n.find(".contact-seller-button").text(),
          )
            ? "Dealer"
            : "Private",
          condition: "Used",
          category: "Bass",
          status: /\bSOLD\b/.test(n.find(".boatInfo, .tag-price").text())
            ? "sold"
            : "active",
          specs: {
            engineDescription: engine,
            advertisedDate: clean(n.find(".boatDate").text()),
            lengthWarning:
              "Verify the owner's hull measurement; equipment dimensions are not boat length.",
          },
        },
        config.name,
        url,
      ),
    );
  });
  return listings;
}

export function craigslistExpanded(
  html: string,
  url: string,
  config: SourceConfig,
): Listing[] | null {
  const $ = cheerio.load(html);
  if ($("#ld_searchpage_results").length) {
    const data = JSON.parse($("#ld_searchpage_results").text());
    const cards = $(".cl-static-search-result").toArray();
    const remaining = [...(data.itemListElement || [])];
    return cards.flatMap((el) => {
      const card = $(el),
        title = clean(card.find(".title").text());
      const link = card.find("a[href]").attr("href");
      // The HTML includes extra ads, so JSON-LD positions are not DOM positions.
      // Join by title, asking price and locality, consuming each match once.
      const cardPrice = money(card.find(".price").text());
      const city = clean(card.find(".location").text());
      const candidates = remaining
        .map((entry: any, index: number) => ({ entry, index }))
        .filter(
          ({ entry }) =>
            clean(entry.item.name) === title &&
            (cardPrice == null ||
              Number(entry.item.offers?.price) === cardPrice),
        );
      const local = candidates.find(
        ({ entry }) =>
          city &&
          clean(
            entry.item.offers?.availableAtOrFrom?.address?.addressLocality ||
              "",
          ).toLowerCase() === city.toLowerCase(),
      );
      const index =
        local?.index ?? (candidates.length === 1 ? candidates[0].index : -1);
      if (!link || !title || index < 0) return [];
      const item = remaining.splice(index, 1)[0].item;
      if (
        /\b(?:wanted|want to buy|we buy|clearance|storage|winteriz|boat lift|boat trailer winch|boat motor|outboard motor|marine clean|boat parts)\b/i.test(
          title,
        ) &&
        !/with|w\//i.test(title)
      )
        return [];
      const offer = item.offers || {},
        place = offer.availableAtOrFrom || {};
      return [
        normalizeListing(
          {
            title,
            url: link,
            price: Number(offer.price) > 1 ? offer.price : null,
            photos: item.image,
            city: place.address?.addressLocality,
            state: place.address?.addressRegion,
            lat: place.geo?.latitude,
            lng: place.geo?.longitude,
            description: item.description,
            length: lengthInText(title),
            horsepower: title.match(/\b(\d{2,3})\s*hp\b/i)?.[1],
            category: boatCategory(title),
            specs: {
              locationPrecision: "approximate",
              locationSource: "Seller-advertised Craigslist map pin",
              ...(place.address?.postalCode
                ? { postalCode: place.address.postalCode }
                : {}),
            },
          },
          config.name,
          url,
        ),
      ];
    });
  }
  if (!$("#postingbody").length) return null;
  const title = clean($("#titletextonly").text()),
    description = clean(
      $("#postingbody")
        .clone()
        .find(".print-information")
        .remove()
        .end()
        .text(),
    );
  const p: Record<string, string> = {};
  $(".attrgroup span").each((_, e) => {
    const t = clean($(e).text()),
      m = t.match(/^([^:]+):\s*(.+)$/);
    if (m) p[m[1].toLowerCase()] = m[2];
  });
  $(".attrgroup .attr").each((_, e) => {
    p[clean($(e).find(".labl").text()).replace(/:$/, "").toLowerCase()] = clean(
      $(e).find(".valu").text(),
    );
  });
  const map = $("#map");
  return [
    normalizeListing(
      {
        title,
        url,
        price: money($(".postingtitle .price").text()),
        description,
        make: p["make / manufacturer"],
        model: p["model name / number"],
        condition: p.condition,
        length: p["length overall (loa)"] || p.length || lengthInText(title),
        horsepower: advertisedMotor(description),
        engineHours: p["engine hours (total)"] || p["engine hours"],
        lat: map.attr("data-latitude"),
        lng: map.attr("data-longitude"),
        photos: $("a.thumb[href]")
          .map((_, e) => $(e).attr("href")!)
          .get(),
        category: boatCategory(p["boat type"] || title),
        sellerType: /by dealer/i.test($("title").text())
          ? "Dealer"
          : /by owner/i.test($("title").text())
            ? "Private"
            : null,
        specs: {
          locationPrecision: "approximate",
          locationSource: "Seller-advertised Craigslist map pin",
          ...(p["propulsion type"]
            ? { advertisedPropulsion: p["propulsion type"] }
            : {}),
          ...(advertisedMotor(description) === 0
            ? { powerWarning: "Listing states the motor is absent or removed." }
            : {}),
        },
      },
      config.name,
      url,
    ),
  ];
}

export function starvedRock(
  html: string,
  url: string,
  config: SourceConfig,
): Listing[] {
  const $ = cheerio.load(html),
    listings: Listing[] = [];
  $("article.category-used-boat-sales").each((_, e) => {
    const n = $(e),
      title = clean(n.find("h3").first().text()),
      link = n.find("a.readon").attr("href");
    const description = clean(n.find(".post-excerpt").text());
    if (!title || !link) return;
    listings.push(
      normalizeListing(
        {
          title,
          url: link,
          sourceListingId: n.attr("id"),
          price: money(description),
          length: lengthInText(
            description.match(/Length Overall[^:]*:\s*([^;]+)/i)?.[1] || "",
          ),
          description,
          photos: n
            .find("img.featured-image")
            .map((_, e) => $(e).attr("src")!)
            .get(),
          city: "Ottawa",
          state: "IL",
          sellerName: config.name,
          sellerType: "Dealer",
          condition: "Used",
          category: boatCategory(title),
          status: /\bsold\b/i.test(title + " " + description)
            ? "sold"
            : "active",
        },
        config.name,
        url,
      ),
    );
  });
  return listings;
}
