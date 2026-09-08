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
