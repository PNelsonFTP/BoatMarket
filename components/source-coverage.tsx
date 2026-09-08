"use client";
import { useMemo } from "react";
import type { Listing, Filters } from "@/lib/types";
import { matches, searchListings } from "@/lib/search";
import { LAKE_SEARCHES, LAKE_HOLIDAY_FILTERS } from "@/lib/lake-holiday";

export function SourceCoverage({
  listings,
  onSelect,
}: {
  listings: Listing[];
  onSelect: (filters: Filters) => void;
}) {
  const coverage = useMemo(() => {
    const all = LAKE_SEARCHES.find(
      (s) => s.id === "holiday-all-nearby",
    )!.filters;
    const review = LAKE_SEARCHES.find(
      (s) => s.id === "holiday-review",
    )!.filters;
    const nearby = listings.filter((l) => matches(l, all));
    const shortlist = searchListings(listings, LAKE_HOLIDAY_FILTERS);
    const knownGroups = new Set(shortlist.map((l) => l.groupId || l.id));
    const unknown = searchListings(
      listings.filter(
        (l) => l.length == null && !knownGroups.has(l.groupId || l.id),
      ),
      review,
    );
    const sources = [...new Set(listings.map((l) => l.source))]
      .map((source) => ({
        source,
        total: listings.filter((l) => l.source === source).length,
        nearby: nearby.filter((l) => l.source === source).length,
        date: listings
          .filter((l) => l.source === source)
          .map((l) => l.lastSeenAt)
          .sort()
          .at(-1),
      }))
      .sort((a, b) => b.nearby - a.nearby);
    return { nearby, shortlist, unknown, sources, all, review };
  }, [listings]);
  return (
    <details className="source-coverage">
      <summary>
        {coverage.nearby.length} nearby ads · {coverage.shortlist.length}{" "}
        shortlist matches · {coverage.unknown.length} more with unknown length{" "}
        <span>View coverage</span>
      </summary>
      <p>
        The shortlist applies your preferred makes, motor preferences, a
        150-mile radius and a reported length from 18 ft to below 21 ft. The
        larger inventory includes boats outside those preferences. Distances are
        approximate straight-line miles; ads can be cross-posted, pending or no
        longer available.
      </p>
      <div className="button-row">
        <button className="button" onClick={() => onSelect(coverage.all)}>
          Browse all nearby ads
        </button>
        <button className="button" onClick={() => onSelect(coverage.review)}>
          Include unreported lengths
        </button>
      </div>
      <div className="coverage-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Collected source</th>
              <th>Nearby active ads</th>
              <th>Collected ads</th>
              <th>Latest observation</th>
            </tr>
          </thead>
          <tbody>
            {coverage.sources.map((s) => (
              <tr key={s.source}>
                <td>{s.source}</td>
                <td>{s.nearby}</td>
                <td>{s.total}</td>
                <td>{s.date ? new Date(s.date).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Coverage is growing and is not a complete census. Facebook Marketplace
        needs manual import. Boat Trader, Water Werks, Hennepin Marine, The Boat
        House, Huber’s Marine, Munson and Lake Holiday Marina did not allow
        automated collection. SkipperBud’s inventory needs a separate
        integration. Craigslist covers public owner and dealer ads across nearby
        regional result pages; only preferred makes receive detail enrichment.
        Dealer catalogs, accessories and clearly unrelated ads are excluded
        where identifiable.
      </p>
    </details>
  );
}
