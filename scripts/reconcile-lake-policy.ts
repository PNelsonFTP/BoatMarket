import { db } from "../server/db";
import { getWorkspace, putWorkspace } from "../server/repository";
import {
  LAKE_RULE_DOCUMENT,
  reconcileLakePolicy,
} from "../lib/lake-verification";
const options = process.argv.slice(2);
if (
  options.some(
    (option) => !["--apply", "--include-customized"].includes(option),
  )
)
  throw new Error(
    "Usage: node --import tsx scripts/reconcile-lake-policy.ts [--apply] [--include-customized]",
  );
try {
  const state = await getWorkspace();
  const result = reconcileLakePolicy(
    state.workspace,
    options.includes("--include-customized"),
  );
  console.log(
    JSON.stringify(
      {
        mode: options.includes("--apply") ? "apply" : "preview",
        document: LAKE_RULE_DOCUMENT,
        changes: result.changes,
        preservedCustomizedEntries: result.skipped,
      },
      null,
      2,
    ),
  );
  if (options.includes("--apply") && result.changes.length)
    await putWorkspace(result.workspace, state.revision);
} finally {
  await db.$disconnect();
}
