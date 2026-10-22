import * as cheerio from "cheerio";
import { assignedJson } from "./expanded";

export function inventoryPages(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl),
    $ = cheerio.load(html),
    pages: string[] = [];
  const add = (value: string) => {
    const u = new URL(value, base);
    if (u.origin === base.origin) pages.push(u.href);
  };
  if (base.hostname === "www.hubersmarine.com") {
    $('a[href*="/search/inventory/"]').each((_, el) => {
      const href = $(el).attr("href")!;
      if (/\/page\/\d+$/.test(href)) add(href);
    });
  }
  if (base.hostname === "theboatcenter.com") {
    $('a[href*="/inventory/page/"]').each((_, el) => add($(el).attr("href")!));
  }
  if (
    base.hostname === "www.questwatersports.com" &&
    base.pathname === "/isapi_xml.php"
  ) {
    const total = Number(html.split(/\r?\n/, 1)[0]),
      limit = Number(base.searchParams.get("limit"));
    if (
      Number.isInteger(total) &&
      total > 0 &&
      Number.isInteger(limit) &&
      limit > 0
    )
      for (
        let offset = limit;
        offset < Math.min(total, limit * 30);
        offset += limit
      ) {
        const next = new URL(base);
        next.searchParams.set("offset", String(offset));
        add(next.href);
      }
  }
  if ($(".v7list-results").length) {
    $("a[href]").each((_, e) => {
      const href = $(e).attr("href")!;
      if (/[?&]pg=\d+/.test(href)) add(href);
    });
  }
  if (base.hostname === "bassboatcentral.com") {
    const pager = assignedJson(html, "window.FWP_JSON =")?.preload_data
      ?.settings?.pager;
    for (
      let page = 2;
      page <= Math.min(30, Number(pager?.total_pages || 1));
      page++
    ) {
      const u = new URL(base);
      u.searchParams.set("_paged", String(page));
      add(u.href);
    }
  }
  if (base.hostname === "www.starvedrockmarina.com") {
    $('a[href*="/category/used-boat-sales/page/"]').each((_, e) =>
      add($(e).attr("href")!),
    );
  }
  if (base.hostname === "www.gordysboats.com") {
    const state =
      assignedJson(html, "window.__SERVER_STATE__ =")?.initialResults || {};
    for (const [index, result] of Object.entries(state) as [string, any][]) {
      for (
        let page = 2;
        page <= Math.min(30, Number(result.results?.[0]?.nbPages || 1));
        page++
      ) {
        const u = new URL(base);
        u.searchParams.set(`${index}[page]`, String(page));
        add(u.href);
      }
    }
  }
  if (base.hostname.replace(/^www\./, "") === "onlyinboards.com") {
    const total = Number(
      $("body")
        .text()
        .match(/Page\s+\d+\s+of\s+(\d+)/i)?.[1] || 1,
    );
    for (let page = 2; page <= Math.min(30, total); page++) {
      const u = new URL(base);
      u.searchParams.set("page", String(page));
      add(u.href);
    }
  }
  return [...new Set(pages)];
}

export function verifiedEmptyRegionalPage(html: string, url: string) {
  const base = new URL(url);
  // Captured regional Craigslist pages expose both an explicit empty ItemList
  // and their static results container. Missing scripts/markup are not emptiness.
  if (base.hostname === "www.craigslist.org" && /^\/search\/area\/[a-z0-9]+$/.test(base.pathname) && base.searchParams.get("cat") === "boo") {
    const $ = cheerio.load(html);
    if (/captcha|verify you are human|access denied|cf-chl-|automated access prohibited/i.test($("body").text())) return false;
    if ($(".cl-static-search-result, .result-row, .cl-search-result").length) return false;
    try {
      const data = JSON.parse($("#ld_searchpage_results").text());
      const search = JSON.parse($("#ld_searchpage_data").text());
      const canonical = new URL($("link[rel='canonical']").attr("href") || "");
      return canonical.href === base.href &&
        /boats for sale.*craigslist/i.test($("title").text()) &&
        search["@type"] === "SearchResultsPage" &&
        data["@type"] === "ItemList" && Array.isArray(data.itemListElement) && data.itemListElement.length === 0 &&
        $("ol.cl-static-search-results .cl-static-hub-links").length > 0;
    } catch { return false; }
  }
  if (new URL(url).hostname === "www.hubersmarine.com") {
    const $ = cheerio.load(html);
    const types = $(".search-result-grid .datasource")
      .map((_, el) => {
        try {
          return String(JSON.parse($(el).text()).itemType || "");
        } catch {
          return "";
        }
      })
      .get();
    return (
      types.length > 0 &&
      types.every(
        (type) =>
          type !== "" && !["Boats", "Pontoon", "Pontoons"].includes(type),
      )
    );
  }
  if (new URL(url).hostname !== "bassboatcentral.com") return false;
  const $ = cheerio.load(html);
  // National ads outside our five-state region legitimately produce no records.
  return (
    $(".fwpl-result").length > 0 &&
    $(".fwpl-result .pid").length === $(".fwpl-result").length &&
    !$(".tag-location")
      .toArray()
      .some((e) => /,\s*(IL|WI|IN|IA|MI)\b/.test($(e).text()))
  );
}
