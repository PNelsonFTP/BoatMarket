import "dotenv/config";
import {
  readOperationStatus,
  recoverOperations,
  cancelOperation,
} from "../server/operations";
import { db } from "../server/db";
try {
  const args = process.argv.slice(2);
  if (args.includes("--help"))
    console.log(
      "Usage: npm run operations -- [status | recover [--apply] | cancel RUN_ID | stop-worker]\nRecovery defaults to a dry run. Apply acquires exclusive leases, preserves original incomplete reports and reconciles interrupted jobs; it never retries external delivery or assumes snapshot rollback. Cancellation is cooperative and targets a run/worker identity, not an arbitrary PID.",
    );
  else {
    const command = args[0] ?? "status";
    if (command === "status" && args.length <= 1)
      console.log(JSON.stringify(await readOperationStatus(), null, 2));
    else if (
      command === "recover" &&
      args.length <= 2 &&
      (!args[1] || args[1] === "--apply")
    ) {
      const result = await recoverOperations({
        apply: args.includes("--apply"),
      });
      console.log(JSON.stringify(result, null, 2));
      if ("busy" in result && result.busy) process.exitCode = 3;
    } else if (command === "cancel" && args.length === 2)
      console.log(JSON.stringify(await cancelOperation(args[1]), null, 2));
    else if (command === "stop-worker" && args.length === 1)
      console.log(JSON.stringify(await cancelOperation(), null, 2));
    else throw new Error("Unknown operation; use --help");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
