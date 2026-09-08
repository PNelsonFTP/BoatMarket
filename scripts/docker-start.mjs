import { mkdir, open } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
import { spawnSync, spawn } from "node:child_process";
const url = process.env.DATABASE_URL || "file:/app/data/boatscout.db";
if (!url.startsWith("file:"))
  throw new Error("This runtime requires a SQLite file DATABASE_URL");
const database = isAbsolute(url.slice(5))
  ? url.slice(5)
  : resolve("prisma", url.slice(5));
process.env.DATABASE_URL = `file:${database}`;
await mkdir(dirname(database), { recursive: true });
const handle = await open(database, "a");
await handle.close();
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  stdio: "inherit",
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
