import "dotenv/config";
import { runRefresh } from "../server/refresh";
import { cacheAgeHours } from "../server/collector";
import { collectionExitCode } from "../server/refresh-report";
import { db } from "../server/db";

const controller = new AbortController();
const cancel = () =>
  controller.abort(new Error("Refresh cancelled by operator"));
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
try {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: npm run refresh -- [--geocode] [--allow-partial] [--skip-busy] [--cache-hours=24] [--target=public/snapshot.json]\nBacks up SQLite/snapshot, collects, validates outcomes, optionally geocodes, and atomically exports. Never builds, commits or publishes. Exit: 0 success; 1 failure; 2 partial; 3 busy; 130 cancelled. --skip-busy only changes a busy exit to zero.",
    );
  } else {
    for (const arg of args)
      if (
        !["--geocode", "--allow-partial", "--skip-busy"].includes(arg) &&
        !/^--(?:cache-hours|target)=.+/.test(arg)
      )
        throw new Error(`Unknown argument ${arg}; use --help`);
    const cache = args
      .find((arg) => arg.startsWith("--cache-hours="))
      ?.split("=")
      .slice(1)
      .join("=");
    const report = await runRefresh({
      signal: controller.signal,
      geocode: args.includes("--geocode"),
      allowPartial: args.includes("--allow-partial"),
      cacheMaxAgeHours: cache == null ? undefined : cacheAgeHours(cache),
      target: args.find((arg) => arg.startsWith("--target="))?.slice(9),
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = collectionExitCode(
      report.status === "running" ? "failed" : report.status,
      args.includes("--skip-busy"),
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = controller.signal.aborted ? 130 : 1;
} finally {
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
  await db.$disconnect();
}
