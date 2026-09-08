import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, open } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
await mkdir("data", { recursive: true });
await mkdir("logs", { recursive: true });
if (!existsSync(".env")) {
  let env = await readFile(".env.example", "utf8");
  env = env.replace(
    'BOATSCOUT_PASSWORD=""',
    `BOATSCOUT_PASSWORD="${randomBytes(18).toString("base64url")}"`,
  );
  await writeFile(".env", env, { mode: 0o600 });
  console.log(
    "Created .env with a random backend password. Read BOATSCOUT_PASSWORD there when connecting.",
  );
}
const { config } = await import("dotenv");
config({ quiet: true });
if (process.env.DATABASE_URL?.startsWith("file:")) {
  const { resolve, dirname } = await import("node:path");
  const file = resolve("prisma", process.env.DATABASE_URL.slice(5));
  await mkdir(dirname(file), { recursive: true });
  const handle = await open(file, "a");
  await handle.close();
}
for (const args of [
  ["run", "db:generate"],
  ["run", "db:migrate"],
]) {
  const r = spawnSync("npm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log(
  "\nBoatScout is ready. Run npm run dev, then connect in Settings using the password in .env.\nThe database starts empty. Use npm run db:seed only if you want fictional sample records in the backend.",
);
