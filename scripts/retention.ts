import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createRetentionPlan, applyRetentionPlan } from "../server/retention";
import { atomicJson } from "../server/refresh-report";
import { db } from "../server/db";
try {
  const args = process.argv.slice(2);
  if (args.includes("--help"))
    console.log(
      "Usage: npm run retention -- [--plan=path] [--price-history-days=365]\n       npm run retention -- --apply=path --hash=SHA256\nDefault: write a dry-run plan, delete nothing. Review exact paths, protected backups and warnings; apply requires that plan's SHA-256 and rechecks all selected files and current database references. Plans expire in 24 hours by default. Current evidence, current reports, active logs, publication, first/latest prices and all decision/vessel/location audit records are protected. Optional old intermediate price pruning creates a verified database backup first. No service/schedule is installed.",
    );
  else {
    if (
      args.some(
        (arg) => !/^--(?:plan|apply|hash|price-history-days)=.+$/.test(arg),
      )
    )
      throw new Error("Unknown retention option; use --help");
    if (new Set(args.map((arg) => arg.split("=")[0])).size !== args.length)
      throw new Error("Duplicate retention options");
    const get = (key: string) =>
      args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
    if (get("apply")) {
      if (!get("hash") || get("plan") || get("price-history-days"))
        throw new Error("Apply requires --apply=path --hash=SHA256 only");
      console.log(
        JSON.stringify(
          await applyRetentionPlan(
            JSON.parse(await readFile(get("apply")!, "utf8")),
            get("hash")!,
          ),
          null,
          2,
        ),
      );
    } else {
      if (get("hash")) throw new Error("--hash requires --apply");
      const plan = await createRetentionPlan({
        policy: get("price-history-days")
          ? { priceHistoryDays: Number(get("price-history-days")) }
          : undefined,
      });
      const path =
        get("plan") || join("data/retention/plans", `${plan.id}.json`);
      if (
        ["public", "out", ".git"].some(
          (directory) =>
            resolve(path) === resolve(directory) ||
            resolve(path).startsWith(resolve(directory) + sep),
        )
      )
        throw new Error(
          "Retention plans contain private paths; keep outside public/, out/ and .git/",
        );
      await atomicJson(path, plan);
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            planPath: path,
            sha256: plan.sha256,
            files: plan.files.length,
            bytes: plan.candidateBytes,
            intermediatePriceRows: plan.priceHistory.length,
            verifiedBackupsProtected: plan.verifiedBackupsProtected,
            warnings: plan.warnings,
          },
          null,
          2,
        ),
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = String(error).includes("Retention busy:") ? 3 : 1;
} finally {
  await db.$disconnect();
}
