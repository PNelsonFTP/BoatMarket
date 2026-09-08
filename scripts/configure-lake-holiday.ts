import { getWorkspace, putWorkspace } from "../server/repository";
import { db } from "../server/db";
import { configureLakeHolidayWorkspace } from "../lib/import-defaults";
const options = process.argv.slice(2);
if (options.some((option) => option !== "--reset-existing"))
  throw new Error(
    "Usage: node --import tsx scripts/configure-lake-holiday.ts [--reset-existing]",
  );
const resetExisting = options.includes("--reset-existing");
try {
  const { workspace, revision } = await getWorkspace();
  const next = configureLakeHolidayWorkspace(workspace, resetExisting);
  await putWorkspace(next, revision);
  console.log(
    resetExisting
      ? "Lake Holiday built-in defaults reset. Custom entries and personal notes/favorites preserved."
      : "Missing Lake Holiday defaults added. Existing searches, rules, reference places, and personal data preserved.",
  );
} finally {
  await db.$disconnect();
}
