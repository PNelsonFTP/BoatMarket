import { mkdir, open } from "node:fs/promises";
import { spawnSync, spawn } from "node:child_process";
await mkdir("/app/data", { recursive: true });
const handle = await open("/app/data/boatscout.db", "a");
await handle.close();
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
});
if (result.status) process.exit(result.status);
const child = spawn("node", ["--import", "tsx", "server/index.ts"], {
  stdio: "inherit",
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
child.on("exit", (code) => process.exit(code ?? 0));
