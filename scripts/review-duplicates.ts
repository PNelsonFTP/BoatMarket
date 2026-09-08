import { db } from "../server/db";
import { reindexDuplicates } from "../server/duplicates";

const args = process.argv.slice(2);
if (
  args.some((arg) => !["--apply", "--dry-run"].includes(arg)) ||
  (args.includes("--apply") && args.includes("--dry-run"))
) {
  console.error("Usage: npm run duplicates:review -- [--dry-run | --apply]");
  process.exitCode = 2;
} else {
  try {
    const result = await reindexDuplicates(args.includes("--apply"));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
