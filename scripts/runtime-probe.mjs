import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
const hashFile = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const nativeFiles = [];
for (const directory of [
  "node_modules/.prisma/client",
  "node_modules/@prisma/engines",
]) {
  for (const name of await readdir(directory)) {
    if (!/^(libquery_engine-|query-engine-|schema-engine-)/.test(name))
      continue;
    const path = join(directory, name);
    if (!(await stat(path)).isFile()) continue;
    nativeFiles.push({
      path,
      sha256: await hashFile(path),
      bytes: (await stat(path)).size,
    });
  }
}
const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/boatscout-browsers";
const browserFiles = [];
const browserCatalog = JSON.parse(
  await readFile("node_modules/playwright-core/browsers.json", "utf8"),
);
for (const directory of await readdir(root).catch(() => [])) {
  for (const relative of [
    "chrome-linux64/chrome",
    "chrome-linux-arm64/chrome",
    "chrome-linux/chrome",
    "chrome-linux/headless_shell",
    "chrome-linux64/headless_shell",
    "chrome-headless-shell-linux64/chrome-headless-shell",
    "chrome-headless-shell-linux-arm64/chrome-headless-shell",
    "ffmpeg-linux",
  ]) {
    const path = join(root, directory, relative);
    const info = await stat(path).catch(() => null);
    if (info?.isFile())
      browserFiles.push({
        path,
        sha256: await hashFile(path),
        bytes: info.size,
        version: browserCatalog.browsers.find((entry) =>
          directory.startsWith(entry.name.replaceAll("-", "_") + "-"),
        )?.browserVersion,
      });
  }
}
let rendering = { status: "not-installed", version: null };
if (process.argv.includes("--rendered")) {
  const { chromium } = await import("playwright");
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      '<div id="result">waiting</div><script>document.getElementById("result").textContent="rendered fixture ready";</script>',
    );
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${fixture.address().port}`);
    if (
      (await page.locator("#result").textContent()) !== "rendered fixture ready"
    )
      throw new Error("Browser did not execute the fixture JavaScript");
    rendering = { status: "passed", version: browser.version() };
  } finally {
    await browser?.close();
    await new Promise((resolve) => fixture.close(resolve));
  }
}
const absentDevelopmentPackages = [];
for (const name of [
  "@playwright/test",
  "vitest",
  "typescript",
  "@tailwindcss/postcss",
  "concurrently",
  "prettier",
  "next",
  "react",
]) {
  // A dependency that becomes a required production peer needs explicit review here.
  if (await stat(`node_modules/${name}/package.json`).catch(() => null))
    throw new Error(`Development package remains in runtime image: ${name}`);
  absentDevelopmentPackages.push(name);
}
const prisma = JSON.parse(
  await readFile("node_modules/@prisma/engines-version/package.json", "utf8"),
);
console.log(
  JSON.stringify({
    node: process.version,
    versions: process.versions,
    platform: process.platform,
    architecture: process.arch,
    uid: process.getuid?.(),
    osRelease: await readFile("/etc/os-release", "utf8"),
    prismaEngineVersion: prisma.version,
    nativeFiles,
    browserFiles,
    browserCatalog,
    rendering,
    absentDevelopmentPackages,
    packageLockSha256: await hashFile("package-lock.json"),
    buildInputs: JSON.parse(
      await readFile("runtime-build-inputs.json", "utf8"),
    ),
  }),
);
