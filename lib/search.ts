import { FIELD_MAP } from "./catalog";
import {
  type Listing,
  type Filters,
  type BoatResult,
  type Criterion,
} from "./types";
export const DAY = 86400000;
export function distanceMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return (
    3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export function priceDrop(l: Listing, days = 90, now = Date.now()) {
  if (l.price == null) return null;
  const cutoff = now - days * DAY;
  const history = l.priceHistory
    .filter((p) => Date.parse(p.at) <= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const baseline =
    history.filter((p) => Date.parse(p.at) <= cutoff).at(-1) ??
    history.find((p) => Date.parse(p.at) > cutoff);
  if (!baseline) return null;
  const amount = Math.max(0, baseline.price - l.price);
  return {
    amount,
    percent: baseline.price > 0 ? (amount / baseline.price) * 100 : 0,
  };
}
export function fieldValue(
  l: Listing,
  key: string,
  f: Filters,
  now = Date.now(),
): unknown {
  const drop = priceDrop(l, f.dropWindowDays, now);
  switch (key) {
    case "contains":
    case "excludes":
      return `${l.title} ${l.description}`;
    case "pricePerFoot":
      return l.price != null && l.length ? l.price / l.length : null;
    case "priceDrop":
      return drop?.amount;
    case "priceDropPercent":
      return drop?.percent;
    case "reduced":
      return drop == null ? null : drop.amount > 0;
    case "listingAge":
      return Math.max(0, (now - Date.parse(l.firstSeenAt)) / DAY);
    case "daysOnMarket":
      return (
        l.specs.daysOnMarket ??
        Math.max(0, (now - Date.parse(l.firstSeenAt)) / DAY)
      );
    case "photoCount":
      return l.photos.length;
    case "hasPrice":
      return l.price != null;
    case "distance": {
      const lat = f.locationTarget === "seller" ? l.sellerLat : l.lat;
      const lng = f.locationTarget === "seller" ? l.sellerLng : l.lng;
      return f.reference && lat != null && lng != null
        ? distanceMiles(f.reference, { lat, lng })
        : null;
    }
    default:
      return key in l ? l[key as keyof Listing] : l.specs[key];
  }
}
export function isActive(c: Criterion) {
  return (
    c.min != null ||
    c.max != null ||
    !!c.values?.length ||
    !!c.text?.trim() ||
    c.bool != null ||
    c.excludeUnknown === true
  );
}
function check(
  value: unknown,
  c: Criterion,
  key: string,
  excludeUnknown: boolean,
) {
  if (value == null || value === "")
    return !(excludeUnknown || c.excludeUnknown);
  if (c.min != null && (typeof value !== "number" || value < c.min))
    return false;
  if (c.max != null && (typeof value !== "number" || value > c.max))
    return false;
  if (
    c.values?.length &&
    !c.values.some((v) => v.toLowerCase() === String(value).toLowerCase())
  )
    return false;
  if (c.bool != null && value !== c.bool) return false;
  if (c.text?.trim()) {
    const found = String(value)
      .toLowerCase()
      .includes(c.text.trim().toLowerCase());
    if (key === "excludes" ? found : !found) return false;
  }
  return true;
}
export function matches(l: Listing, f: Filters, now = Date.now()) {
  if (
    f.q &&
    !`${l.title} ${l.description} ${l.make ?? ""} ${l.model ?? ""} ${l.city ?? ""}`
      .toLowerCase()
      .includes(f.q.toLowerCase())
  )
    return false;
  for (const [key, c] of Object.entries(f.criteria)) {
    if (
      FIELD_MAP[key] &&
      isActive(c) &&
      !check(fieldValue(l, key, f, now), c, key, f.excludeUnknown)
    )
      return false;
  }
  if (f.areas.length) {
    const lat = f.locationTarget === "seller" ? l.sellerLat : l.lat,
      lng = f.locationTarget === "seller" ? l.sellerLng : l.lng,
      state = f.locationTarget === "seller" ? l.specs.sellerState : l.state;
    const inside = f.areas.some((a) => {
      if (a.kind === "states")
        return state == null
          ? !(f.excludeUnknownLocation || f.excludeUnknown)
          : a.states?.some(
              (s) => s.toUpperCase() === String(state).toUpperCase(),
            );
      if (lat == null || lng == null)
        return !(f.excludeUnknownLocation || f.excludeUnknown);
      if (a.kind === "radius")
        return (
          distanceMiles({ lat, lng }, { lat: a.lat!, lng: a.lng! }) <= a.radius!
        );
      return (
        a.bbox &&
        lat >= a.bbox[0] &&
        lng >= a.bbox[1] &&
        lat <= a.bbox[2] &&
        lng <= a.bbox[3]
      );
    });
    if (!inside) return false;
  }
  const r = f.ruleSet;
  if (r) {
    const ex = r.excludeUnknown || f.excludeUnknown;
    if (
      r.maxLengthExclusive &&
      r.maxLength != null &&
      l.length != null &&
      l.length >= r.maxLength
    )
      return false;
    for (const [key, max] of [
      ["length", r.maxLength],
      ["horsepower", r.maxHp],
      ["loadedWeight", r.maxLoadedWeight],
    ] as const) {
      if (max != null && !check(fieldValue(l, key, f, now), { max }, key, ex))
        return false;
    }
    if (
      r.allowedPropulsion?.length &&
      !check(l.propulsion, { values: r.allowedPropulsion }, "propulsion", ex)
    )
      return false;
    if (r.excludedCategories?.length) {
      if (l.category == null && ex) return false;
      if (l.category && r.excludedCategories.includes(l.category)) return false;
    }
  }
  return true;
}
export function searchListings(
  listings: Listing[],
  f: Filters,
  now = Date.now(),
): BoatResult[] {
  const groups = new Map<string, BoatResult>();
  const sourceLinks = new Map<string, BoatResult["sourceLinks"]>();
  for (const source of listings) {
    const key = source.groupId || source.id;
    const links = sourceLinks.get(key) || [];
    links.push({
      id: source.id,
      source: source.source,
      url: source.sourceUrl,
      price: source.price,
    });
    sourceLinks.set(key, links);
  }
  for (const l of listings.filter((l) => matches(l, f, now))) {
    const key = l.groupId || l.id,
      existing = groups.get(key);
    const link = {
      source: l.source,
      url: l.sourceUrl,
      price: l.price,
      id: l.id,
    };
    if (existing) {
      const links = [...existing.sourceLinks, link];
      if (
        l.price != null &&
        (existing.price == null || l.price < existing.price)
      )
        groups.set(key, { ...l, sourceLinks: links });
      else existing.sourceLinks = links;
    } else groups.set(key, { ...l, sourceLinks: [link] });
  }
  const results = [...groups.values()].map((l) => ({
    ...l,
    // Source links remain inspectable even when one copy misses a filter.
    sourceLinks: sourceLinks.get(l.groupId || l.id) || l.sourceLinks,
    distance: fieldValue(l, "distance", f, now) as number | undefined,
  }));
  const asc = (a: unknown, b: unknown) =>
    a == null ? (b == null ? 0 : 1) : b == null ? -1 : Number(a) - Number(b);
  results.sort((a, b) => {
    switch (f.sort) {
      case "price-asc":
        return asc(a.price, b.price);
      case "price-desc":
        return a.price == null ? 1 : b.price == null ? -1 : b.price - a.price;
      case "distance":
        return asc(a.distance, b.distance);
      case "hours":
        return asc(a.engineHours, b.engineHours);
      case "year":
        return a.year == null ? 1 : b.year == null ? -1 : b.year - a.year;
      case "days":
        return asc(
          fieldValue(a, "daysOnMarket", f, now),
          fieldValue(b, "daysOnMarket", f, now),
        );
      case "price-per-foot":
        return asc(
          fieldValue(a, "pricePerFoot", f, now),
          fieldValue(b, "pricePerFoot", f, now),
        );
      default:
        return Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt);
    }
  });
  return results;
}
export function median(values: number[]) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
