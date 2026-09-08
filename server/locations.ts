import { readFile } from "node:fs/promises";
import type { Listing } from "../lib/types";
import { applyListingLocationOverride } from "../lib/boat-location";
export type KnownLocation = {
  lat: number;
  lng: number;
  label: string;
  source: string;
  fetchedAt: string;
  reviewed?: boolean;
  zip?: string;
};
export const locationKey = (city: string, state: string, zip = "") =>
  `${city.trim()}, ${state.trim()}${zip ? ` ${zip.slice(0, 5)}` : ""}`.toLowerCase();
export async function readLocations(): Promise<Record<string, KnownLocation>> {
  try {
    return JSON.parse(
      await readFile(
        process.env.LOCATION_CONFIG || "config/locations.json",
        "utf8",
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}
export function locateListing(
  listing: Listing,
  locations: Record<string, KnownLocation>,
): Listing {
  if (listing.locationOverride)
    return applyListingLocationOverride(listing, listing.locationOverride);
  if (
    listing.lat != null &&
    listing.lng != null &&
    !["Approximate city center", "Reviewed approximate city center"].includes(
      String(listing.specs.locationPrecision),
    )
  )
    return listing;
  if (!listing.city || !listing.state) return listing;
  const zip =
    String(listing.specs.postalCode || "").match(/^(\d{5})(?:-\d{4})?$/)?.[1] ||
    "";
  const base = locationKey(listing.city, listing.state);
  const variants = Object.entries(locations).filter(([key]) =>
    key.startsWith(`${base} `),
  );
  const exact = locations[locationKey(listing.city, listing.state, zip)];
  // Once postal variants exist, a conflicting or missing ZIP cannot fall back to a different locality.
  const ambiguous = variants.length > 0 && (!zip || !exact);
  const point = ambiguous ? null : exact || locations[base];
  if (!point) {
    if (
      ambiguous &&
      ["Approximate city center", "Reviewed approximate city center"].includes(
        String(listing.specs.locationPrecision),
      )
    )
      return {
        ...listing,
        lat: null,
        lng: null,
        specs: {
          ...listing.specs,
          locationPrecision: "Ambiguous city/ZIP; review required",
        },
      };
    return listing;
  }
  if (listing.specs.boatLocationUnknown)
    return {
      ...listing,
      lat: null,
      lng: null,
      sellerLat: point.lat,
      sellerLng: point.lng,
    };
  return {
    ...listing,
    lat: point.lat,
    lng: point.lng,
    specs: {
      ...listing.specs,
      locationPrecision: point.reviewed
        ? "Reviewed approximate city center"
        : "Approximate city center",
      locationSource: point.source,
      locationObservedAt: point.fetchedAt,
    },
    confidence: { ...listing.confidence, lat: 0.65, lng: 0.65 },
  };
}
