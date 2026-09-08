import "dotenv/config";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { backupBeforeRefresh, verifyBackup } from "../server/refresh";
import { db } from "../server/db";
try {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: npm run backup -- [directory] [--snapshot=public/snapshot.json]\n       npm run backup -- --verify=directory\nCreates a consistent SQLite backup, validates its integrity, copies snapshot/source/location configuration and private location-review evidence, and writes SHA-256 hashes. --verify only checks saved hashes, database integrity and readable table counts without restoring. Includes private workspace data; keep outside public/. Environment secrets are excluded.",
    );
  } else {
    for (const arg of args)
      if (
        arg.startsWith("--") &&
        !arg.startsWith("--snapshot=") &&
        !arg.startsWith("--verify=")
      )
        throw new Error(`Unknown argument ${arg}`);
    const verification = args.find((arg) => arg.startsWith("--verify="));
    if (verification) {
      if (args.length !== 1 || !verification.slice(9))
        throw new Error(
          "Use --verify=directory without other backup arguments",
        );
      console.log(
        JSON.stringify(await verifyBackup(verification.slice(9)), null, 2),
      );
    } else {
      const destinations = args.filter((arg) => !arg.startsWith("--"));
      if (destinations.length > 1)
        throw new Error("Specify at most one backup directory");
      const directory =
        destinations[0] ??
        join(
          process.env.REFRESH_BACKUP_DIR || "data/backups/refresh",
          `manual-${randomUUID()}`,
        );
      const snapshot =
        args.find((arg) => arg.startsWith("--snapshot="))?.slice(11) ||
        "public/snapshot.json";
      console.log(
        JSON.stringify(await backupBeforeRefresh(directory, snapshot), null, 2),
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
