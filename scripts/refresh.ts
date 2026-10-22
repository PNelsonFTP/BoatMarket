import "dotenv/config";
import { runRefresh } from "../server/refresh";
import { cacheAgeHours } from "../server/collector";
import { collectionExitCode } from "../server/refresh-report";
import { db } from "../server/db";
import {
  startRefreshSession,
  continueRefreshSession,
  finalizeRefreshSession,
  readRefreshSession,
  sessionPreview,
} from "../server/refresh-session";

const controller = new AbortController();
const cancel = () =>
  controller.abort(new Error("Refresh cancelled by operator"));
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
try {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: npm run refresh -- [--geocode] [--allow-partial] [--skip-busy] [--cache-hours=24] [--target=public/snapshot.json]\nReviewable sessions: --session=start [--source=ID ...] [--max-passes=5] [--max-source-attempts=3]; --session=status|continue|finalize --session-id=ID [--allow-partial for finalize].\nSessions back up and collect without changing the website until explicit finalization. Continuation is one bounded pass; denied/robots/429/challenged scans require manual review. Backoff is preserved. Never builds, commits or publishes. Exit: 0 success/review; 1 failure; 2 partial; 3 busy; 130 cancelled. --skip-busy only changes a busy exit to zero.",
    );
  } else {
    for (const arg of args)
      if (
        !["--geocode", "--allow-partial", "--skip-busy"].includes(arg) &&
        !/^--(?:cache-hours|target|session|session-id|source|max-passes|max-source-attempts)=.+/.test(
          arg,
        )
      )
        throw new Error(`Unknown argument ${arg}; use --help`);
    const cache = args
      .find((arg) => arg.startsWith("--cache-hours="))
      ?.split("=")
      .slice(1)
      .join("=");
    const sessionAction = args
      .find((arg) => arg.startsWith("--session="))
      ?.slice(10);
    const sessionId = args
      .find((arg) => arg.startsWith("--session-id="))
      ?.slice(13);
    const options = {
      signal: controller.signal,
      geocode: args.includes("--geocode"),
      allowPartial: args.includes("--allow-partial"),
      cacheMaxAgeHours: cache == null ? undefined : cacheAgeHours(cache),
      target: args.find((arg) => arg.startsWith("--target="))?.slice(9),
    };
    if (sessionAction) {
      if (!["start", "status", "continue", "finalize"].includes(sessionAction))
        throw new Error("Unknown session action; use --help");
      if (sessionAction !== "start" && !sessionId)
        throw new Error("--session-id is required");
      if (args.includes("--allow-partial") && sessionAction !== "finalize")
        throw new Error(
          "--allow-partial is only valid for explicit session finalization",
        );
      if (
        sessionAction !== "start" &&
        args.some((arg) =>
          /^--(?:source|max-passes|max-source-attempts|cache-hours|target)=/.test(
            arg,
          ),
        )
      )
        throw new Error(
          "Session scope/options are fixed at start; use a new session to change them",
        );
      const result =
        sessionAction === "start"
          ? await startRefreshSession({
              ...options,
              sessionId,
              sourceIds: args.some((arg) => arg.startsWith("--source="))
                ? args
                    .filter((arg) => arg.startsWith("--source="))
                    .map((arg) => arg.slice(9))
                : undefined,
              maxPasses: args.some((arg) => arg.startsWith("--max-passes="))
                ? Number(
                    args
                      .find((arg) => arg.startsWith("--max-passes="))!
                      .slice(13),
                  )
                : undefined,
              maxSourceAttempts: args.some((arg) =>
                arg.startsWith("--max-source-attempts="),
              )
                ? Number(
                    args
                      .find((arg) => arg.startsWith("--max-source-attempts="))!
                      .slice(22),
                  )
                : undefined,
            })
          : sessionAction === "status"
            ? sessionPreview(await readRefreshSession(sessionId!))
            : sessionAction === "continue"
              ? await continueRefreshSession(sessionId!, {
                  signal: controller.signal,
                })
              : await finalizeRefreshSession(sessionId!, {
                  signal: controller.signal,
                  allowPartial: options.allowPartial,
                });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode =
        result.status === "complete" ||
        result.status === "review" ||
        result.status === "ready"
          ? 0
          : result.status === "cancelled"
            ? 130
            : result.status === "failed"
              ? 1
              : 2;
    } else {
      if (
        args.some((arg) =>
          /^--(?:session-id|source|max-passes|max-source-attempts)=/.test(arg),
        )
      )
        throw new Error(
          "Session options require --session=start|status|continue|finalize",
        );
      const report = await runRefresh(options);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = collectionExitCode(
        report.status === "running" ? "failed" : report.status,
        args.includes("--skip-busy"),
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = controller.signal.aborted ? 130 : 1;
} finally {
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
  await db.$disconnect();
}
