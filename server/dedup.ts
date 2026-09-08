import type { Listing } from "../lib/types";
const normalized = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function findDuplicate(l: Listing, candidates: Listing[]) {
  return candidates.find((c) => {
    if (c.isSample || l.isSample || c.source === l.source) return false;
    const hin = normalized(l.specs.hin);
    if (hin.length >= 10 && hin === normalized(c.specs.hin)) return true;
    if (!l.make || !l.model || !l.year || !l.length || l.horsepower == null)
      return false;
    const core =
      normalized(l.make) === normalized(c.make) &&
      normalized(l.model) === normalized(c.model) &&
      l.year === c.year &&
      Math.abs(l.length - (c.length ?? 0)) < 0.25 &&
      l.horsepower === c.horsepower;
    const seller =
      l.sellerName && normalized(l.sellerName) === normalized(c.sellerName);
    const photo = l.photos.some((p) => c.photos.includes(p));
    return !!(core && seller && photo);
  });
}
