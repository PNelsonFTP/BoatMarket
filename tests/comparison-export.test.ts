import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import { createComparisonPacket } from "../lib/comparison-export";
import { makeSeed } from "../lib/seed";
import type { BoatResult } from "../lib/types";
const boat = (changes: Partial<BoatResult> = {}): BoatResult => ({
  ...makeSeed()[0],
  isSample: false,
  sourceLinks: [],
  ...changes,
});

describe("standalone buying packet", () => {
  it("escapes source-controlled text and blocks executable URL schemes", () => {
    const html = createComparisonPacket([
      boat({
        title: '<img src=x onerror="alert(1)">',
        specs: {
          "<script>alert(2)</script>": '<svg onload="alert(3)">',
          hin: 'ABC" onclick="alert(4)',
        },
        sourceUrl: "javascript:alert(5)",
        sourceLinks: [
          {
            id: "x",
            source: "<script>alert(6)</script>",
            url: 'https://example.com/?q=" onclick="bad',
            price: 1,
          },
          {
            id: "y",
            source: "Unsafe",
            url: "javascript:alert(7)",
            price: null,
          },
        ],
      }),
    ]);
    const $ = load(html);
    expect($("script,img,svg,iframe,object,form")).toHaveLength(0);
    expect($("[onclick],[onerror],[onload]")).toHaveLength(0);
    expect(
      $("a")
        .toArray()
        .every((a) => /^https?:\/\//.test($(a).attr("href") ?? "")),
    ).toBe(true);
    expect($("body").text()).toContain('<img src=x onerror="alert(1)">');
    expect($("body").text()).toContain("<script>alert(2)</script>");
    expect(
      $("meta[http-equiv='Content-Security-Policy']").attr("content"),
    ).toContain("default-src 'none'");
  });
  it("preserves unknowns, source observation dates and every cross-listing without suggesting approval", () => {
    const html = createComparisonPacket(
      [
        boat({
          length: null,
          horsepower: null,
          city: null,
          state: null,
          distance: 102.25,
          specs: {
            summaryCheckedAt: "2026-09-01T12:00:00.000Z",
            lengthWarning: "Nominal length only",
          },
          sourceLinks: [
            {
              id: "a",
              source: "Dealer",
              url: "https://example.com/a",
              price: 30000,
            },
            {
              id: "b",
              source: "Classifieds",
              url: "https://example.com/b",
              price: 31000,
            },
          ],
        }),
      ],
      { generatedAt: "2026-09-08T12:00:00.000Z" },
    );
    const $ = load(html),
      body = $("body").text();
    expect(body).toContain("2026-09-01T12:00:00.000Z");
    expect(body).toContain("2026-09-08T12:00:00.000Z");
    expect(body).toContain("Packet generation is not a new source observation");
    expect(body).toContain(
      "straight-line estimates, not road miles or driving hours",
    );
    expect(body).toContain("Unknown");
    expect(body).toContain("Nominal length only");
    expect($('a[href="https://example.com/a"]')).toHaveLength(1);
    expect($('a[href="https://example.com/b"]')).toHaveLength(1);
    expect(body).toContain("No saved workspace notes are included");
    expect($(".checklist li")).toHaveLength(12);
    expect(body).toContain("Trailer title/VIN");
    expect(body).toContain("HIN photographed");
  });
  it("clearly labels fictional samples and exports the full selection rather than only differences", () => {
    const html = createComparisonPacket([
      boat({ isSample: true }),
      boat({ id: "other", title: "Another boat" }),
    ]);
    const $ = load(html);
    expect($("body").text()).toContain("SAMPLE — fictional listing");
    expect($("section.boat")).toHaveLength(2);
    expect($(".checklist li")).toHaveLength(24);
    expect($("table thead th")).toHaveLength(3);
    expect(html).toContain("@media print");
  });
});
