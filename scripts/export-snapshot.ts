import { writeFile } from "node:fs/promises";
import { allListings } from "../server/repository";
import { db } from "../server/db";
const listings = (await allListings(false)).map(
  ({ rawPayload, ...listing }) => listing,
);
const target = process.argv[2] || "public/snapshot.json";
await writeFile(
  target,
  JSON.stringify(
    { version: 1, generatedAt: new Date().toISOString(), listings },
    null,
    2,
  ),
);
if (target === "public/snapshot.json")
  await writeFile("public/data-mode.json", JSON.stringify({ snapshot: true }));
console.log(
  `Exported ${listings.length} real listings to ${target}. Notes, favorites, source credentials and raw payloads are excluded. Review listing content before publishing.`,
);
await db.$disconnect();
