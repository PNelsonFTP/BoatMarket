import "dotenv/config";
import {
  prepareRelease,
  approveRelease,
  verifyRelease,
} from "../server/release";
import {
  rollbackSnapshot,
  readSnapshotActivation,
} from "../server/publication";
import { db } from "../server/db";
try {
  const args = process.argv.slice(2),
    command = args.shift(),
    value = (key: string) =>
      args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
  for (const arg of args)
    if (
      !/^--(?:snapshot|review|note|built|activation|current)=.+$/.test(arg) &&
      !["--privacy-reviewed", "--accept-warnings"].includes(arg)
    )
      throw new Error(`Unknown argument ${arg}`);
  if (!command || command === "--help")
    console.log(
      "npm run release -- prepare [--snapshot=public/snapshot.json]\nnpm run release -- approve --review=SHA256 --privacy-reviewed --note='review explanation' [--accept-warnings]\nnpm run release -- verify --review=SHA256 [--built=out]\nnpm run release -- status\nnpm run release -- rollback --activation=UUID --current=ACTIVE_SHA256\nPrepare is read-only for the website. Approve stages a reviewed immutable snapshot locally. Deployment requires an enabled GitHub Pages manual workflow with the exact review hash. Rollback changes local activation only; prepare/review it before publishing.",
    );
  else if (command === "prepare")
    console.log(
      JSON.stringify(await prepareRelease(value("snapshot")), null, 2),
    );
  else if (command === "approve")
    console.log(
      JSON.stringify(
        await approveRelease(value("review") || "", {
          privacyReviewed: args.includes("--privacy-reviewed"),
          acceptWarnings: args.includes("--accept-warnings"),
          note: value("note") || "",
        }),
        null,
        2,
      ),
    );
  else if (command === "verify")
    console.log(
      JSON.stringify(
        await verifyRelease(value("review") || "", {
          builtDirectory: value("built"),
        }),
        null,
        2,
      ),
    );
  else if (command === "status")
    console.log(JSON.stringify(await readSnapshotActivation(), null, 2));
  else if (command === "rollback")
    console.log(
      JSON.stringify(
        await rollbackSnapshot(value("activation") || "", {
          expectedCurrentHash: value("current") || "",
        }),
        null,
        2,
      ),
    );
  else throw new Error("Unknown release command");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
