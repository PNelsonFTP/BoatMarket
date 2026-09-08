export type AuditedImageEvidence = {
  listingId: string;
  url: string;
  identity: string;
  sha256: string;
  dHash: string;
  width: number;
  height: number;
  usableHash: boolean;
  method: "sharp-dhash64-v1";
  observedAt: string;
  auditedAt: string;
  provenance: { suppliedBy: string; permission: string; reference: string };
};

/** Only documented/observed transformation shapes are removed. Unknown hosts,
 * query parameters, image IDs and path case remain significant. Never proof of
 * vessel identity: a dealer can reuse the same original stock photograph.
 */
export function canonicalImageIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    if (/placeholder|no[-_]?image|stock[-_]?photo|logo/i.test(url.pathname))
      return null;
    url.hash = "";
    if (
      url.hostname === "images.craigslist.org" &&
      /^\/[A-Za-z0-9]+_[A-Za-z0-9]+_[A-Za-z0-9]+_\d{2,4}x\d{2,4}\.(?:jpe?g|png|webp)$/i.test(
        url.pathname,
      )
    ) {
      return `craigslist:${url.pathname.replace(/_\d{2,4}x\d{2,4}(?=\.[^.]+$)/, "")}${url.search}`;
    }
    if (url.hostname === "cdn.dealerspike.com") {
      const inventory = url.pathname.match(
        /\/imglib\/v1\/\d{2,4}x\d{2,4}\/imglib\/assets\/inventory\/[A-F0-9]{2}\/[A-F0-9]{2}\/([A-F0-9-]{36})\.(?:jpe?g|png|webp)$/i,
      );
      if (
        inventory &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(inventory[1])
      )
        return `dealerspike:${inventory[1].toLowerCase()}${url.search}`;
    }
    if (
      url.hostname === "bassboatcentral.com" &&
      /^\/wp-content\/uploads\/\d{4}\/\d{2}\//.test(url.pathname)
    ) {
      url.pathname = url.pathname.replace(
        /-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)$)/i,
        "",
      );
    }
    return url.href;
  } catch {
    return null;
  }
}

export function hashDistance(a: string, b: string) {
  if (!/^[a-f0-9]{16}$/i.test(a) || !/^[a-f0-9]{16}$/i.test(b)) return null;
  let bits = BigInt(`0x${a}`) ^ BigInt(`0x${b}`),
    distance = 0;
  while (bits) {
    distance++;
    bits &= bits - 1n;
  }
  return distance;
}

export function imageEvidenceMatch(
  a: AuditedImageEvidence,
  b: AuditedImageEvidence,
) {
  if (a.listingId === b.listingId) return null;
  if (a.sha256 === b.sha256)
    return { kind: "identical-file" as const, distance: 0 };
  const distance = hashDistance(a.dHash, b.dHash);
  const ratio = a.width / a.height / (b.width / b.height);
  return a.usableHash &&
    b.usableHash &&
    distance != null &&
    distance <= 5 &&
    ratio >= 0.85 &&
    ratio <= 1.15
    ? { kind: "similar-image" as const, distance }
    : null;
}
