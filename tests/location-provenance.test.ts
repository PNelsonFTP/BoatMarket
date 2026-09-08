import { describe, expect, it } from "vitest";
import { makeSeed } from "../lib/seed";
import { DEFAULT_FILTERS, type Listing } from "../lib/types";
import {
  applyListingLocationOverride,
  restoreSourceLocation,
} from "../lib/boat-location";
import { currentFieldEvidence, recordFieldProvenance } from "../lib/provenance";
import {
  drivingTime,
  matchesDrivingFilter,
  routeMatches,
} from "../lib/routing";
import {
  groupPostalLocationQueries,
  rankLocationCandidates,
} from "../lib/location-review";
import { locateListing } from "../server/locations";
const boat = (): Listing => ({
  ...makeSeed()[0],
  isSample: false,
  sourceUrl: "https://example.com/boat",
  length: 20,
  horsepower: 250,
  lat: null,
  lng: null,
  sellerLat: 42,
  sellerLng: -89,
  specs: { boatLocationUnknown: true, "equipment.trailer": true },
});
const oldAt = "2026-01-01T12:00:00.000Z",
  newAt = "2026-09-08T12:00:00.000Z";
const override = {
  lat: 41.5,
  lng: -88.5,
  label: "Reviewed marina",
  evidence: "Seller confirmed boat is stored here",
  sourceUrl: "https://example.com/contact",
  reviewedAt: newAt,
  revision: 1,
};
describe("actual boat location and field observation evidence", () => {
  it("keeps offsite source uncertainty and seller coordinates reversible without leaking evidence into specs", () => {
    const original = boat(),
      corrected = applyListingLocationOverride(original, override);
    expect(corrected.lat).toBe(override.lat);
    expect(corrected.sourceLocation).toMatchObject({
      lat: null,
      lng: null,
      sellerLat: 42,
      sellerLng: -89,
    });
    expect(corrected.specs).not.toHaveProperty("evidence");
    const refreshed = applyListingLocationOverride(
      { ...original, sellerLat: 43, sellerLng: -90, lastSeenAt: newAt },
      override,
    );
    expect(refreshed.lat).toBe(override.lat);
    expect(refreshed.sourceLocation?.sellerLat).toBe(43);
    const reverted = restoreSourceLocation(refreshed);
    expect(reverted).toMatchObject({
      lat: null,
      lng: null,
      sellerLat: 43,
      sellerLng: -90,
    });
    expect(reverted.locationOverride).toBeUndefined();
    expect(
      applyListingLocationOverride(corrected, { active: false }).lat,
    ).toBeNull();
  });
  it("reapplies the review without replacing preserved source coordinates with the correction", () => {
    const first = applyListingLocationOverride(boat(), override);
    const second = locateListing(first, {
      [String(first.city).toLowerCase() +
      ", " +
      String(first.state).toLowerCase()]: {
        lat: 49,
        lng: -110,
        label: "City",
        source: "fixture",
        fetchedAt: newAt,
      },
    });
    expect(second.locationOverride?.revision).toBe(1);
    expect(second.sourceLocation?.lat).toBeNull();
    expect(second.lat).toBe(41.5);
  });
  it("does not make retained details look freshly observed and records a later conflicting fact", () => {
    const old = recordFieldProvenance(boat(), null, {
      method: "detail",
      observedAt: oldAt,
    });
    const retained = recordFieldProvenance(
      {
        ...old,
        lastSeenAt: newAt,
        specs: {
          ...old.specs,
          retainedDetailFields: "length, horsepower",
          retainedDetailObservedAt: oldAt,
        },
      },
      old,
      { method: "source", observedAt: newAt },
    );
    expect(retained.fieldProvenance?.length).toHaveLength(1);
    expect(retained.fieldProvenance?.["equipment.trailer"]).toHaveLength(1);
    expect(
      currentFieldEvidence(retained, "length", Date.parse(newAt)),
    ).toMatchObject({
      stale: true,
      conflicting: false,
      current: { observedAt: oldAt, method: "detail" },
    });
    const changed = recordFieldProvenance({ ...boat(), length: 21 }, retained, {
      method: "detail",
      observedAt: newAt,
    });
    expect(
      currentFieldEvidence(changed, "length", Date.parse(newAt)),
    ).toMatchObject({
      stale: false,
      conflicting: true,
      current: { value: 21, observedAt: newAt },
    });
  });
  it("merges separate summary/detail history and bounds repeated observations", () => {
    const previous = recordFieldProvenance(boat(), null, { observedAt: oldAt });
    const detail = recordFieldProvenance({ ...boat(), length: 21 }, null, {
      method: "detail",
      observedAt: newAt,
    });
    const merged = recordFieldProvenance(detail, previous, {
      method: "detail",
      observedAt: newAt,
    });
    expect(merged.fieldProvenance?.length.map((entry) => entry.value)).toEqual([
      21, 20,
    ]);
    let current = merged;
    for (let day = 1; day <= 35; day++)
      current = recordFieldProvenance(current, current, {
        observedAt: new Date(Date.parse(newAt) + day * 86400000).toISOString(),
      });
    expect(current.fieldProvenance?.length).toHaveLength(30);
  });
});
describe("postal ambiguity and real road travel time", () => {
  it("keeps same-city different ZIPs and missing ZIP in separate stable cache identities", () => {
    const rows = ["49401", "48625", "", "49401-0001"].map((zip) => ({
      city: "Allendale",
      state: "MI",
      specs: { postalCode: zip },
    }));
    expect(groupPostalLocationQueries(rows).map((entry) => entry.key)).toEqual([
      "allendale, mi",
      "allendale, mi 48625",
      "allendale, mi 49401",
    ]);
    expect(groupPostalLocationQueries([...rows].reverse())).toEqual(
      groupPostalLocationQueries(rows),
    );
  });
  it("requires ZIP evidence when a requested postal locality is not verified by the provider", () => {
    const result = rankLocationCandidates(
      { city: "Allendale", state: "MI", zip: "49401" },
      [
        {
          lat: 42.9,
          lon: -85.9,
          display_name: "Allendale MI",
          name: "Allendale",
          addresstype: "village",
          address: {
            village: "Allendale",
            state: "Michigan",
            country_code: "us",
          },
        },
      ],
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.chosen).toBeNull();
  });
  it("does not send an unknown ZIP boat to one of two matching city centers", () => {
    const point = {
      lat: 42.9,
      lng: -85.9,
      label: "Allendale MI",
      source: "fixture",
      fetchedAt: newAt,
    };
    const listing = {
      ...boat(),
      city: "Allendale",
      state: "MI",
      lat: 41,
      lng: -87,
      specs: { locationPrecision: "Approximate city center" },
    };
    const locations = {
      "allendale, mi": point,
      "allendale, mi 49401": point,
      "allendale, mi 48625": { ...point, lat: 43.9 },
    };
    expect(locateListing(listing, locations).lat).toBeNull();
    expect(
      locateListing(
        { ...listing, specs: { ...listing.specs, postalCode: "48625" } },
        locations,
      ).lat,
    ).toBe(43.9);
    expect(locateListing({ ...listing, specs: {} }, locations).lat).toBe(41);
  });
  it("requires an unexpired route from the selected origin to the current location, never miles divided by speed", () => {
    const reference = { lat: 41.6, lng: -88.6 },
      now = Date.parse(newAt);
    const filters = {
      ...DEFAULT_FILTERS,
      reference,
      driving: { maxMinutes: 240, excludeUnknown: true },
    };
    const listing: Listing = {
      ...boat(),
      lat: 42,
      lng: -89,
      routeEstimate: {
        status: "ready",
        provider: "Fixture",
        providerUrl: "https://example.com",
        origin: reference,
        destination: { lat: 42, lng: -89 },
        computedAt: newAt,
        expiresAt: new Date(now + 86400000).toISOString(),
        durationMinutes: 240,
        distanceMiles: 180,
      },
    };
    expect(matchesDrivingFilter(listing, filters, now)).toBe(true);
    expect(
      matchesDrivingFilter(
        {
          ...listing,
          routeEstimate: { ...listing.routeEstimate!, durationMinutes: 241 },
        },
        filters,
        now,
      ),
    ).toBe(false);
    expect(routeMatches({ ...listing, lat: 42.1 }, filters, now)).toBe(false);
    expect(
      routeMatches(
        listing,
        { ...filters, reference: { lat: 41, lng: -88 } },
        now,
      ),
    ).toBe(false);
    expect(matchesDrivingFilter(listing, filters, now + 2 * 86400000)).toBe(
      false,
    );
    expect(matchesDrivingFilter(boat(), filters, now)).toBe(false);
    expect(
      matchesDrivingFilter(
        boat(),
        { ...filters, driving: { ...filters.driving, excludeUnknown: false } },
        now,
      ),
    ).toBe(true);
    expect(drivingTime(239.9)).toBe("4h 0m");
  });
});
