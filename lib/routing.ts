import type { Filters, Listing } from "./types";
export function routeMatches(
  listing: Listing,
  filters: Pick<Filters, "reference" | "locationTarget">,
  now = Date.now(),
) {
  const route = listing.routeEstimate;
  const lat =
    filters.locationTarget === "seller" ? listing.sellerLat : listing.lat;
  const lng =
    filters.locationTarget === "seller" ? listing.sellerLng : listing.lng;
  return !!(
    route &&
    filters.reference &&
    route.status === "ready" &&
    route.durationMinutes != null &&
    Date.parse(route.expiresAt) > now &&
    Math.abs(route.origin.lat - filters.reference.lat) < 0.00001 &&
    Math.abs(route.origin.lng - filters.reference.lng) < 0.00001 &&
    lat != null &&
    lng != null &&
    Math.abs(route.destination.lat - lat) < 0.00001 &&
    Math.abs(route.destination.lng - lng) < 0.00001
  );
}
export function matchesDrivingFilter(
  listing: Listing,
  filters: Filters,
  now = Date.now(),
) {
  if (!filters.driving) return true;
  if (!routeMatches(listing, filters, now))
    return !filters.driving.excludeUnknown;
  return listing.routeEstimate!.durationMinutes! <= filters.driving.maxMinutes;
}
export const drivingTime = (minutes: number) => {
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
};
