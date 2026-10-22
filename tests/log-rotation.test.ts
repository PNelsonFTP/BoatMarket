import { afterAll, afterEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { openSync, unlinkSync } from "node:fs";
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    openSync: vi.fn(actual.openSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  };
});
const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
const originalPlatform = process.platform;
afterEach(() => {
  vi.mocked(openSync).mockReset().mockImplementation(actualFs.openSync);
  vi.mocked(unlinkSync).mockReset().mockImplementation(actualFs.unlinkSync);
  Object.defineProperty(process, "platform", { value: originalPlatform });
});
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
    module = pathToFileURL(resolve("server/log-rotation.ts")).href;
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
  const source = `import { logger } from ${JSON.stringify(pathToFileURL(resolve("server/logger.ts")).href)}; for(let i=0;i<20;i++) logger.info({i,payload:'x'.repeat(120)},'budget fixture');`;
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

it("retries Windows exclusive-open sharing errors without treating them as stale ownership", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  const path = join(directory, "windows-sharing.log"),
    lock = `${path}.lock`;
  const warnings: string[] = [],
    errors = ["EPERM", "EACCES", "EBUSY"];
  let conflicts = 0;
  vi.mocked(openSync).mockImplementation((...args) => {
    if (
      String(args[0]) === lock &&
      args[1] === "wx" &&
      conflicts < errors.length
    ) {
      const code = errors[conflicts++];
      throw Object.assign(
        new Error(`${code}: simulated delete-pending lock open`),
        { code },
      );
    }
    return actualFs.openSync(...args);
  });
  const stream = rotatingLogDestination({
    path,
    warning: (message) => warnings.push(message),
  });
  await write(stream, '{"record":"retained"}\n');
  expect(conflicts).toBe(3);
  expect(warnings).toEqual([]);
  expect(await readFile(path, "utf8")).toBe('{"record":"retained"}\n');
  expect(
    vi
      .mocked(openSync)
      .mock.calls.some(([name]) => String(name) === `${lock}.recovery`),
  ).toBe(false);
  expect(
    vi.mocked(unlinkSync).mock.calls.filter(([name]) => String(name) === lock),
  ).toHaveLength(1);
  stream.end();
});
it("does not unlink unknown old owners or infer staleness from persistent Windows permission errors", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  const path = join(directory, "windows-permission.log"),
    lock = `${path}.lock`;
  const owner = '{"pid":"unknown","nonce":"unrecognized"}';
  await writeFile(lock, owner);
  const old = new Date(Date.now() - 86400000);
  await utimes(lock, old, old);
  const warnings: string[] = [];
  vi.mocked(openSync).mockImplementation((...args) => {
    if (String(args[0]) === lock && args[1] === "wx")
      throw Object.assign(
        new Error("EPERM: genuine permission denied or unresolved sharing"),
        { code: "EPERM" },
      );
    return actualFs.openSync(...args);
  });
  const stream = rotatingLogDestination({
    path,
    lockTimeoutMs: 20,
    warning: (message) => warnings.push(message),
  });
  await write(stream, "stdout fallback record\n");
  expect(warnings.join(" ")).toContain("bounded Windows sharing retries");
  expect(warnings.join(" ")).toContain("EPERM");
  expect(await readFile(lock, "utf8")).toBe(owner);
  expect(
    vi.mocked(unlinkSync).mock.calls.some(([name]) => String(name) === lock),
  ).toBe(false);
  expect(
    vi
      .mocked(openSync)
      .mock.calls.some(([name]) => String(name) === `${lock}.recovery`),
  ).toBe(false);
  stream.end();
});
it.each([
  "",
  "not-json",
  '{"pid":"unknown","nonce":"owner"}',
  '{"pid":-1,"nonce":"owner"}',
  '{"pid":1.5,"nonce":"owner"}',
  '{"pid":2147483647}',
  '{"pid":2147483647,"nonce":""}',
])(
  "preserves malformed or unknown lock ownership regardless of age: %s",
  async (owner) => {
    const path = join(
        directory,
        `unknown-${Math.random().toString(36).slice(2)}.log`,
      ),
      lock = `${path}.lock`;
    await writeFile(lock, owner);
    const old = new Date(Date.now() - 86400000);
    await utimes(lock, old, old);
    const warnings: string[] = [];
    const stream = rotatingLogDestination({
      path,
      lockTimeoutMs: 10,
      warning: (message) => warnings.push(message),
    });
    await write(stream, "preserve owner\n");
    expect(await readFile(lock, "utf8")).toBe(owner);
    expect(warnings.join(" ")).toContain("operator inspection");
    expect(
      vi.mocked(unlinkSync).mock.calls.some(([name]) => String(name) === lock),
    ).toBe(false);
    stream.end();
  },
);
it("retries transient Windows unlock sharing errors but checks nonce before every deletion", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  const path = join(directory, "windows-release.log"),
    lock = `${path}.lock`;
  const warnings: string[] = [];
  let conflicts = 0;
  vi.mocked(unlinkSync).mockImplementation((...args) => {
    if (String(args[0]) === lock && conflicts++ < 2)
      throw Object.assign(new Error("EPERM: simulated shared lock release"), {
        code: "EPERM",
      });
    return actualFs.unlinkSync(...args);
  });
  const stream = rotatingLogDestination({
    path,
    warning: (message) => warnings.push(message),
  });
  await write(stream, "first record\n");
  await write(stream, "second record\n");
  expect(warnings).toEqual([]);
  expect(await readFile(path, "utf8")).toBe("first record\nsecond record\n");
  expect(conflicts).toBe(4);
  stream.end();
});
it("does not retry non-Windows permission failures or replace a symlinked lock", async () => {
  Object.defineProperty(process, "platform", { value: "linux" });
  const path = join(directory, "posix-permission.log"),
    lock = `${path}.lock`;
  let calls = 0;
  const warnings: string[] = [];
  vi.mocked(openSync).mockImplementation((...args) => {
    if (String(args[0]) === lock && args[1] === "wx") {
      calls++;
      throw Object.assign(new Error("EACCES: directory permissions"), {
        code: "EACCES",
      });
    }
    return actualFs.openSync(...args);
  });
  const stream = rotatingLogDestination({
    path,
    warning: (message) => warnings.push(message),
  });
  await write(stream, "fallback\n");
  expect(calls).toBe(1);
  expect(warnings.join(" ")).toContain("EACCES");
  stream.end();
  vi.mocked(openSync).mockImplementation(actualFs.openSync);
  Object.defineProperty(process, "platform", { value: "win32" });
  const outside = join(directory, "lock-symlink-target.txt");
  await writeFile(outside, '{"pid":2147483647,"nonce":"dead"}');
  const linkedPath = join(directory, "linked-lock.log");
  await symlink(outside, `${linkedPath}.lock`);
  const linked = rotatingLogDestination({
    path: linkedPath,
    lockTimeoutMs: 20,
    warning: (message) => warnings.push(message),
  });
  await write(linked, "must not delete linked target\n");
  expect(await readFile(outside, "utf8")).toContain("dead");
  expect(warnings.join(" ")).toContain("non-regular");
  linked.end();
});

it("preserves a changed nonce if Windows release sharing forces a retry", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  const path = join(directory, "windows-changed-owner.log"),
    lock = `${path}.lock`;
  const successor = JSON.stringify({
    pid: process.pid,
    nonce: "different-owner",
  });
  const warnings: string[] = [];
  let attempts = 0;
  vi.mocked(unlinkSync).mockImplementation((...args) => {
    if (String(args[0]) === lock) {
      attempts++;
      if (attempts === 1) {
        actualFs.writeFileSync(lock, successor);
        throw Object.assign(
          new Error("EPERM: sharing during ownership change"),
          { code: "EPERM" },
        );
      }
    }
    return actualFs.unlinkSync(...args);
  });
  const stream = rotatingLogDestination({
    path,
    warning: (message) => warnings.push(message),
  });
  await write(stream, "already logged record\n");
  expect(attempts).toBe(1);
  expect(await readFile(lock, "utf8")).toBe(successor);
  expect(warnings.join(" ")).toContain("ownership changed");
  expect(await readFile(path, "utf8")).toBe("already logged record\n");
  stream.end();
});
