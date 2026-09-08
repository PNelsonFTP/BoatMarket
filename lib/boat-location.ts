import {
  locationOverrideSchema,
  sourceLocationSchema,
  type Listing,
} from "./types";
export function restoreSourceLocation(listing: Listing): Listing {
  if (!listing.locationOverride || !listing.sourceLocation)
    return { ...listing, locationOverride: undefined };
  const source = sourceLocationSchema.parse(listing.sourceLocation);
  const specs = { ...listing.specs };
  if (source.precision) specs.locationPrecision = source.precision;
  else delete specs.locationPrecision;
  return {
    ...listing,
    lat: source.lat,
    lng: source.lng,
    sellerLat: source.sellerLat,
    sellerLng: source.sellerLng,
    city: source.city,
    state: source.state,
    specs,
    locationOverride: undefined,
    routeEstimate: undefined,
  };
}
/** Only an override read from the private database is authoritative. */
export function applyListingLocationOverride(
  input: Listing,
  value: unknown,
): Listing {
  const listing = restoreSourceLocation(input);
  const parsed = locationOverrideSchema.safeParse(value);
  if (!parsed.success) return listing;
  const sourceLocation = sourceLocationSchema.parse({
    lat: listing.lat,
    lng: listing.lng,
    sellerLat: listing.sellerLat,
    sellerLng: listing.sellerLng,
    city: listing.city,
    state: listing.state,
    ...(listing.specs.locationPrecision
      ? { precision: String(listing.specs.locationPrecision) }
      : {}),
    observedAt:
      typeof listing.specs.summaryCheckedAt === "string"
        ? listing.specs.summaryCheckedAt
        : listing.lastSeenAt,
  });
  const override = parsed.data;
  return {
    ...listing,
    sourceLocation,
    locationOverride: override,
    lat: override.lat,
    lng: override.lng,
    specs: {
      ...listing.specs,
      locationPrecision: "Reviewed actual boat location",
    },
    routeEstimate:
      input.routeEstimate?.destination.lat === override.lat &&
      input.routeEstimate.destination.lng === override.lng
        ? input.routeEstimate
        : undefined,
  };
}
