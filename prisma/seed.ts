import { db } from "../server/db";
import { makeSeed, seedWorkspace } from "../lib/seed";
import {
  upsertListing,
  getWorkspace,
  putWorkspace,
} from "../server/repository";
for (const listing of makeSeed()) await upsertListing(listing);
const current = await getWorkspace();
if (!current.workspace.savedSearches.length)
  await putWorkspace(
    {
      ...seedWorkspace(),
      favorites: current.workspace.favorites,
      notes: current.workspace.notes,
    },
    current.revision,
  );
console.log(
  "Seeded 52 clearly labeled fictional listings. Real listings are not replaced.",
);
await db.$disconnect();
