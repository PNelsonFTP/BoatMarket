import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

function flag(name) {
  return process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}
export function normalizedBasePath(value = "") {
  if (!value || value === "/") return "";
  const result = value.replace(/\/$/, "");
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(result))
    throw new Error(
      "Built-site base path must contain ordinary URL path segments",
    );
  return result;
}
export async function startBuiltServer(options = {}) {
  const directory = resolve(
    options.directory ||
      flag("directory") ||
      process.env.BUILT_DIRECTORY ||
      "out",
  );
  const basePath = normalizedBasePath(
    options.basePath ?? flag("base-path") ?? process.env.BUILT_BASE_PATH,
  );
  const port = Number(
    options.port ?? flag("port") ?? process.env.BUILT_PORT ?? 4390,
  );
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid built-site port");
  await access(join(directory, "index.html"));
  const server = Fastify({ logger: false });
  await server.register(fastifyStatic, {
    root: directory,
    prefix: `${basePath}/`,
    preCompressed: true,
  });
  await server.listen({ host: "127.0.0.1", port });
  return server;
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const server = await startBuiltServer();
  console.log(
    `Built site: ${server.listeningOrigin}${normalizedBasePath(flag("base-path") ?? process.env.BUILT_BASE_PATH)}/`,
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await server.close();
    });
}
