// The manual entry point runs exactly the production browser suite used in CI.
// Override BUILT_BASE_PATH for a root build, BUILT_DIRECTORY for another export,
// or QA_BASE_URL to inspect an already served build without starting a server.
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const env = {
  ...process.env,
  BUILT_BASE_PATH: process.env.BUILT_BASE_PATH ?? "/BoatMarket",
  ...(process.env.QA_BASE_URL
    ? { BUILT_BASE_URL: process.env.QA_BASE_URL, BUILT_SKIP_WEBSERVER: "1" }
    : {}),
};
const child = spawn(
  process.execPath,
  [
    resolve("node_modules/@playwright/test/cli.js"),
    "test",
    "--config=playwright.production.config.ts",
    ...process.argv.slice(2),
  ],
  { env, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
