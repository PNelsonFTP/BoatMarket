import "dotenv/config";
import {
  previewBackupRestore,
  restoreBackupToDirectory,
} from "../server/backup-restore";
import { db } from "../server/db";
try {
  const args = process.argv.slice(2);
  if (args.includes("--help"))
    console.log(
      "Usage: npm run restore -- --from=BACKUP --to=NEW_DIRECTORY\n       npm run restore -- --from=BACKUP --to=NEW_DIRECTORY --apply --hash=MANIFEST_SHA256\nDefault is a read-only verification and mapping preview. Explicit apply copies verified files into a new directory and rechecks hashes. Existing destinations and symlink ancestors are refused. No running database is replaced and no services are started. The copy contains private data; .env secrets are excluded.",
    );
  else {
    if (
      args.some(
        (arg) => arg !== "--apply" && !/^--(?:from|to|hash)=.+$/.test(arg),
      ) ||
      new Set(args.map((arg) => arg.split("=")[0])).size !== args.length
    )
      throw new Error("Unknown or duplicate restore option; use --help");
    const get = (key: string) =>
      args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
    if (!get("from") || !get("to"))
      throw new Error("Restore requires --from and --to");
    if (args.includes("--apply") !== Boolean(get("hash")))
      throw new Error("--apply and --hash are required together");
    console.log(
      JSON.stringify(
        args.includes("--apply")
          ? await restoreBackupToDirectory(
              get("from")!,
              get("to")!,
              get("hash")!,
            )
          : await previewBackupRestore(get("from")!, get("to")!),
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
