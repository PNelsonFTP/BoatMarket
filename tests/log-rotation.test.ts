import { afterAll, expect, it } from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { rotatingLogDestination } from "../server/log-rotation";
const directory = await mkdtemp(join(tmpdir(), "boatscout-log-rotation-"));
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
function write(
  stream: ReturnType<typeof rotatingLogDestination>,
  text: string,
) {
  return new Promise<void>((done, reject) =>
    stream.write(text, (error) => (error ? reject(error) : done())),
  );
}
it("rotates complete records with retention-compatible names and keeps no open detached descriptor", async () => {
  const path = join(directory, "records.log"),
    stream = rotatingLogDestination({
      path,
      maximumBytes: 150,
      maximumRotations: 10,
    });
  for (let i = 0; i < 8; i++)
    await write(stream, JSON.stringify({ i, payload: "x".repeat(40) }) + "\n");
  const paths = (await readdir(directory)).filter((name) =>
    /^records\.log(?:\.\d+)?$/.test(name),
  );
  expect(paths.length).toBeGreaterThan(1);
  const rows = (
    await Promise.all(
      paths.map((name) => readFile(join(directory, name), "utf8")),
    )
  ).flatMap((body) =>
    body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  );
  expect(rows.map((row) => row.i).sort((a, b) => a - b)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7,
  ]);
  expect(
    paths
      .filter((name) => name !== "records.log")
      .every((name) => /\.log\.\d+$/.test(name)),
  ).toBe(true);
  stream.end();
});
it("bounds disk usage/count without deleting young rotations and reports stdout fallback", async () => {
  const path = join(directory, "bounded.log"),
    warnings: string[] = [];
  const stream = rotatingLogDestination({
    path,
    maximumBytes: 100,
    maximumRotations: 2,
    warning: (message) => warnings.push(message),
  });
  for (let i = 0; i < 20; i++)
    await write(stream, JSON.stringify({ i, payload: "x".repeat(35) }) + "\n");
  const paths = (await readdir(directory)).filter((name) =>
    /^bounded\.log(?:\.\d+)?$/.test(name),
  );
  expect(paths).toHaveLength(3);
  const bodies = await Promise.all(
    paths.map((name) => readFile(join(directory, name))),
  );
  expect(bodies.every((body) => body.length <= 100)).toBe(true);
  expect(warnings.join(" ")).toContain("Full records continue to stdout");
  expect(
    JSON.parse(await readFile(`${path}.rotation.json`, "utf8")),
  ).toMatchObject({
    blocked: true,
    rotations: 2,
    maximumRotations: 2,
    retentionRequired: true,
  });
  stream.end();
});
it("serializes concurrent app/worker processes without corrupting or losing JSON records", async () => {
  const path = join(directory, "concurrent.log"),
    module = resolve("server/log-rotation.ts");
  const results = await Promise.all(
    [0, 1, 2].map(
      (worker) =>
        new Promise<void>((done, reject) => {
          const source = `import { rotatingLogDestination } from ${JSON.stringify(module)}; const stream = rotatingLogDestination({path:${JSON.stringify(path)},maximumBytes:512,maximumRotations:40,lockTimeoutMs:10000}); for(let i=0;i<50;i++) stream.write(JSON.stringify({worker:${worker},i,payload:'record'})+'\\n'); stream.end();`;
          const child = spawn(
            process.execPath,
            ["--import", "tsx", "--input-type=module", "-e", source],
            { env: process.env, stdio: ["ignore", "ignore", "pipe"] },
          );
          let error = "";
          child.stderr.on("data", (chunk) => {
            error += chunk;
          });
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0 && !error
              ? done()
              : reject(new Error(error || `Child exit ${code}`)),
          );
        }),
    ),
  );
  expect(results).toHaveLength(3);
  const paths = (await readdir(directory)).filter((name) =>
    /^concurrent\.log(?:\.\d+)?$/.test(name),
  );
  const rows = (
    await Promise.all(
      paths.map((name) => readFile(join(directory, name), "utf8")),
    )
  ).flatMap((body) =>
    body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  );
  expect(rows).toHaveLength(150);
  expect(new Set(rows.map((row) => `${row.worker}:${row.i}`)).size).toBe(150);
});
it("refuses symlink targets and recovers a dead writer's lock without changing its target", async () => {
  const outside = join(directory, "protected.txt");
  await writeFile(outside, "protected");
  const link = join(directory, "symlink.log");
  await symlink(outside, link);
  const warnings: string[] = [];
  const stream = rotatingLogDestination({
    path: link,
    warning: (message) => warnings.push(message),
  });
  await write(stream, "unwanted\n");
  expect(await readFile(outside, "utf8")).toBe("protected");
  expect(warnings.join(" ")).toContain("non-regular");
  const path = join(directory, "abandoned.log");
  await writeFile(
    `${path}.lock`,
    JSON.stringify({ pid: 2147483647, nonce: "dead" }),
  );
  const recovered = rotatingLogDestination({ path });
  await write(recovered, "after crash\n");
  expect(await readFile(path, "utf8")).toBe("after crash\n");
  stream.end();
  recovered.end();
});

it("preserves every stdout record when the bounded file sink reaches its limit", async () => {
  const path = join(directory, "integrated.log");
  const source = `import { logger } from ${JSON.stringify(resolve("server/logger.ts"))}; for(let i=0;i<20;i++) logger.info({i,payload:'x'.repeat(120)},'budget fixture');`;
  const output = await new Promise<{ stdout: string; stderr: string }>(
    (done, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", source],
        {
          env: {
            ...process.env,
            LOG_FILE: path,
            LOG_MAX_BYTES: "400",
            LOG_MAX_ROTATIONS: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? done({ stdout, stderr }) : reject(new Error(stderr)),
      );
    },
  );
  expect(
    output.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).i),
  ).toEqual(Array.from({ length: 20 }, (_, i) => i));
  expect(output.stderr).toContain("Full records continue to stdout");
  expect(
    JSON.parse(await readFile(`${path}.rotation.json`, "utf8")).blocked,
  ).toBe(true);
});
