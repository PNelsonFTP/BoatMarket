import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createArchivePlan,
  packArchive,
  retireArchiveOriginals,
  restoreArchive,
  verifyArchive,
  writeArchivePlan,
  type PublicRetirementPolicy,
} from "../server/archive";

const help = `Usage:
  npm run archive -- preview --path=data/refresh-YYYY-MM-DD [--path=...] --run-id=ID --purpose=TEXT [--plan=data/archives/plans/NAME.json] [--public-retirement=keep-direct-links|allow-broken-direct-links]
  npm run archive -- pack --plan=PATH --hash=SHA256
  npm run archive -- verify --archive=data/archives/packages/HASH [--restored=NEW_DIRECTORY]
  npm run archive -- restore --archive=PATH --destination=NEW_DIRECTORY
  npm run archive -- retire --archive=PATH --hash=REVIEWED_PLAN_SHA256
Preview and pack delete nothing. A package contains a hashed plan, content-addressed objects, current references, originating Git revision/run and a tested restore recipe. Restore requires a nonexistent destination. Retirement is a separate explicit approval: it rechecks all hashes, age, references and application writer leases. Backup bundle members cannot be retired here; use verified backup retention. Public direct links are kept by default. An explicit preview policy --public-retirement=allow-broken-direct-links allows only unreferenced public generations to retire after separate exact-hash approval; active/previous pointers and all publication/release/backup/helper/database references remain hard blockers. Unresolved references/symlinks fail closed. Never run retire on pending cleanup candidates without their owner's separate approval. No schedule is installed.`;
try {
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help"].includes(command)) console.log(help);
  else {
    const allowed: Record<string, string[]> = {
      preview: ["path", "run-id", "purpose", "plan", "public-retirement"],
      pack: ["plan", "hash"],
      verify: ["archive", "restored"],
      restore: ["archive", "destination"],
      retire: ["archive", "hash"],
    };
    if (
      !allowed[command] ||
      args.some(
        (arg) =>
          !arg.startsWith("--") ||
          !arg.includes("=") ||
          !allowed[command].includes(arg.slice(2, arg.indexOf("="))),
      )
    )
      throw new Error("Unknown archive option; use --help");
    const values = (key: string) =>
      args
        .filter((arg) => arg.startsWith(`--${key}=`))
        .map((arg) => arg.slice(key.length + 3));
    for (const key of allowed[command])
      if (key !== "path" && values(key).length > 1)
        throw new Error(`Duplicate --${key}`);
    const get = (key: string) => values(key)[0];
    const requireValue = (key: string) => {
      const value = get(key);
      if (!value) throw new Error(`Missing --${key}; use --help`);
      return value;
    };
    let result: unknown;
    if (command === "preview") {
      const plan = await createArchivePlan({
        paths: values("path"),
        runId: requireValue("run-id"),
        purpose: requireValue("purpose"),
        publicRetirement: get("public-retirement") as
          PublicRetirementPolicy | undefined,
      });
      const path = await writeArchivePlan(
        plan,
        get("plan") || join("data/archives/plans", `${plan.sha256}.json`),
      );
      result = {
        dryRun: true,
        planPath: path,
        sha256: plan.sha256,
        files: plan.files.length,
        bytes: plan.bytes,
        references: plan.references.references.length,
        publicRetirement: plan.publicRetirement,
        retirementBlockers: plan.blockers,
        originalsRemoved: 0,
      };
    } else if (command === "pack")
      result = await packArchive(
        JSON.parse(await readFile(requireValue("plan"), "utf8")),
        requireValue("hash"),
      );
    else if (command === "verify") {
      const manifest = await verifyArchive(
        requireValue("archive"),
        get("restored"),
      );
      result = {
        verified: true,
        planHash: manifest.plan.sha256,
        manifestHash: manifest.sha256,
        files: manifest.plan.files.length,
        bytes: manifest.plan.bytes,
        origin: manifest.plan.origin,
      };
    } else if (command === "restore")
      result = await restoreArchive(
        requireValue("archive"),
        requireValue("destination"),
      );
    else
      result = await retireArchiveOriginals(
        requireValue("archive"),
        requireValue("hash"),
      );
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  // The database is opened only by explicit retirement, never by preview/pack/restore.
  if (process.argv[2] === "retire") {
    const { db } = await import("../server/db");
    await db.$disconnect();
  }
}
