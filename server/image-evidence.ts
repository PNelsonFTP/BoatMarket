import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Listing } from "../lib/types";
import {
  canonicalImageIdentity,
  type AuditedImageEvidence,
} from "../lib/image-identity";
import { atomicJson } from "./refresh-report";

export const imageEvidenceFile = () =>
  process.env.IMAGE_EVIDENCE_FILE || "data/image-evidence.json";
const provenance = z.object({
  suppliedBy: z.string().trim().min(3).max(100),
  permission: z.string().trim().min(20).max(2000),
  reference: z.string().trim().min(5).max(2000),
});
const recordSchema = z.object({
  listingId: z.string().min(1).max(200),
  url: z.string().url().max(2000),
  identity: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  dHash: z.string().regex(/^[a-f0-9]{16}$/),
  width: z.number().positive(),
  height: z.number().positive(),
  usableHash: z.boolean(),
  method: z.literal("sharp-dhash64-v1"),
  observedAt: z.string().datetime(),
  auditedAt: z.string().datetime(),
  provenance,
});
export async function readImageEvidence(): Promise<AuditedImageEvidence[]> {
  try {
    return z
      .array(recordSchema)
      .max(1000)
      .parse(JSON.parse(await readFile(imageEvidenceFile(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Optional local audit only. It never fetches remote photos or bypasses a source.
 * Sharp is the existing optional Next image dependency; missing support fails
 * explicitly, leaving URL-based evidence fully operational.
 */
export async function auditLocalImage(
  input: unknown,
  listing: Listing,
): Promise<AuditedImageEvidence> {
  const item = z
    .object({
      listingId: z.string(),
      url: z.string().url(),
      file: z.string().min(1),
      observedAt: z.string().datetime(),
      provenance,
    })
    .strict()
    .parse(input);
  if (item.listingId !== listing.id || !listing.photos.includes(item.url))
    throw new Error(
      "The image URL must belong to the identified advertisement",
    );
  const identity = canonicalImageIdentity(item.url);
  if (!identity) throw new Error("Unsupported or placeholder image URL");
  const size = (await stat(item.file)).size;
  if (size < 1 || size > 10 * 1024 * 1024)
    throw new Error("Audit images must be between 1 byte and 10 MiB");
  const data = await readFile(item.file);
  // Reject vector/document input before passing bytes to any image decoder.
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp =
    data.subarray(0, 4).toString() === "RIFF" &&
    data.subarray(8, 12).toString() === "WEBP";
  const isAvif =
    data.subarray(4, 8).toString() === "ftyp" &&
    ["avif", "avis"].includes(data.subarray(8, 12).toString());
  if (data.length > 10 * 1024 * 1024 || !(isJpeg || isPng || isWebp || isAvif))
    throw new Error(
      "Use a permitted local JPEG, PNG, WebP or AVIF image of at most 10 MiB",
    );
  const sharp = (await import("sharp")).default;
  const image = sharp(data, {
    limitInputPixels: 20_000_000,
    failOn: "warning",
    animated: false,
  });
  const metadata = await image.metadata();
  if (
    !(
      ["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
      (isAvif && metadata.format === "heif")
    ) ||
    !metadata.width ||
    !metadata.height
  )
    throw new Error("Use a permitted local JPEG, PNG, WebP or AVIF image");
  const pixels = await image
    .rotate()
    .resize(9, 8, { fit: "fill", kernel: "lanczos3" })
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer();
  let hash = 0n,
    setBits = 0;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const bit = pixels[y * 9 + x] > pixels[y * 9 + x + 1];
      hash = (hash << 1n) | (bit ? 1n : 0n);
      if (bit) setBits++;
    }
  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const variance =
    pixels.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    pixels.length;
  return {
    listingId: item.listingId,
    url: item.url,
    identity,
    sha256: createHash("sha256").update(data).digest("hex"),
    dHash: hash.toString(16).padStart(16, "0"),
    width: (metadata.orientation ?? 1) >= 5 ? metadata.height : metadata.width,
    height: (metadata.orientation ?? 1) >= 5 ? metadata.width : metadata.height,
    usableHash: variance >= 100 && setBits >= 6 && setBits <= 58,
    method: "sharp-dhash64-v1",
    observedAt: item.observedAt,
    auditedAt: new Date().toISOString(),
    provenance: item.provenance,
  };
}

export async function saveImageEvidence(records: AuditedImageEvidence[]) {
  const existing = await readImageEvidence();
  const byImage = new Map(
    existing.map((record) => [
      JSON.stringify([record.listingId, record.url]),
      record,
    ]),
  );
  for (const record of records)
    byImage.set(
      JSON.stringify([record.listingId, record.url]),
      recordSchema.parse(record),
    );
  if (byImage.size > 1000)
    throw new Error(
      "The local image evidence budget is 1,000 images; review/remove old entries before adding more",
    );
  await atomicJson(imageEvidenceFile(), [...byImage.values()]);
}
