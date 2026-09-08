import { readFile } from "node:fs/promises";
import type { Listing } from "../lib/types";
export type KnownLocation = {
  lat: number;
  lng: number;
  label: string;
  source: string;
  fetchedAt: string;
};
export const locationKey = (city: string, state: string) =>
  `${city.trim()}, ${state.trim()}`.toLowerCase();
export async function readLocations(): Promise<Record<string, KnownLocation>> {
  try {
    return JSON.parse(await readFile("config/locations.json", "utf8"));
  } catch {
    return {};
  }
}
export function locateListing(
  listing: Listing,
  locations: Record<string, KnownLocation>,
): Listing {
  if (
    listing.lat != null &&
    listing.lng != null &&
    listing.specs.locationPrecision !== "Approximate city center"
  )
    return listing;
  if (!listing.city || !listing.state) return listing;
  const point = locations[locationKey(listing.city, listing.state)];
  if (!point) return listing;
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
      locationPrecision: "Approximate city center",
      locationSource: point.source,
    },
    confidence: { ...listing.confidence, lat: 0.65, lng: 0.65 },
  };
}
