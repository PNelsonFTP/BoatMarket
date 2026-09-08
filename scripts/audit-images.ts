import { readFile } from "node:fs/promises";
import { z } from "zod";
import { allListings, acquireLock, releaseLock } from "../server/repository";
import { auditLocalImage, saveImageEvidence } from "../server/image-evidence";
import { db } from "../server/db";
let owner: string | null = null;
try {
  const args = process.argv.slice(2);
  if (args.length !== 1)
    throw new Error(
      "Usage: node --import tsx scripts/audit-images.ts local-manifest.json. Each image needs listingId, an existing listing photo URL, local file, observedAt, and provenance {suppliedBy,permission,reference}. No images are downloaded.",
    );
  const manifest = z
    .array(z.object({ listingId: z.string() }).passthrough())
    .min(1)
    .max(50)
    .parse(JSON.parse(await readFile(args[0], "utf8")));
  const listings = new Map((await allListings()).map((l) => [l.id, l]));
  const audited = [];
  for (const item of manifest) {
    const listing = listings.get(item.listingId);
    if (!listing) throw new Error(`Unknown advertisement ${item.listingId}`);
    audited.push(await auditLocalImage(item, listing));
  }
  owner = await acquireLock("image-evidence-write", 60_000);
  if (!owner)
    throw new Error(
      "Another local image audit is saving evidence; retry after it completes",
    );
  await saveImageEvidence(audited);
  console.log(
    JSON.stringify(
      {
        audited: audited.length,
        usefulPerceptualHashes: audited.filter((r) => r.usableHash).length,
        note: "Evidence only; no vessel grouping decisions were changed.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (owner) await releaseLock("image-evidence-write", owner);
  await db.$disconnect();
}
