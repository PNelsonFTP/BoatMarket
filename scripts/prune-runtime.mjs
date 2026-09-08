import { readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
// The static website is already compiled into out/. These are the modules imported
// by the API, collectors, database maintenance and worker at runtime.
export const runtimeDependencies = [
  "@fastify/cors",
  "@fastify/rate-limit",
  "@fastify/static",
  "@prisma/client",
  "cheerio",
  "dotenv",
  "fastify",
  "ipaddr.js",
  "nodemailer",
  "pino",
  "playwright",
  "prisma",
  "robots-parser",
  "tsx",
  "zod",
];
export function runtimeManifest(manifest) {
  const dependencies = Object.fromEntries(
    runtimeDependencies.map((name) => {
      if (!manifest.dependencies[name])
        throw new Error(
          `Runtime dependency missing from project manifest: ${name}`,
        );
      return [name, manifest.dependencies[name]];
    }),
  );
  return { ...manifest, dependencies, devDependencies: {} };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes("--drop-build-peers")) {
    const prisma = JSON.parse(
      await readFile("node_modules/prisma/package.json", "utf8"),
    );
    if (prisma.peerDependenciesMeta?.typescript?.optional !== true)
      throw new Error(
        "Prisma TypeScript peer is no longer optional; review runtime packaging",
      );
    await rm("node_modules/typescript", { recursive: true, force: true });
    await rm("node_modules/.bin/tsc", { force: true });
    await rm("node_modules/.bin/tsserver", { force: true });
    const inputs = JSON.parse(
      await readFile("runtime-build-inputs.json", "utf8"),
    );
    inputs.omittedOptionalBuildPeers = [
      "typescript (optional Prisma schema-authoring peer)",
    ];
    await writeFile(
      "runtime-build-inputs.json",
      JSON.stringify(inputs, null, 2) + "\n",
    );
  } else {
    const bytes = await readFile("package-lock.json");
    const original = JSON.parse(await readFile("package.json", "utf8"));
    await writeFile(
      "runtime-build-inputs.json",
      JSON.stringify(
        {
          dockerfileSha256: createHash("sha256")
            .update(await readFile("Dockerfile"))
            .digest("hex"),
          originalLockfileSha256: createHash("sha256")
            .update(bytes)
            .digest("hex"),
          originalManifestSha256: createHash("sha256")
            .update(JSON.stringify(original))
            .digest("hex"),
          retainedDirectDependencies: runtimeDependencies,
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      "package.json",
      JSON.stringify(runtimeManifest(original), null, 2) + "\n",
    );
  }
}
