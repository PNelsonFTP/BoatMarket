import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, basename, join, resolve } from "node:path";
import { Writable } from "node:stream";

export type LogRotationOptions = {
  path: string;
  maximumBytes?: number;
  maximumRotations?: number;
  lockTimeoutMs?: number;
  warning?: (message: string) => void;
};
const pause = (milliseconds: number) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
function regular(path: string) {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error(`Log rotation refuses non-regular file: ${path}`);
    return info;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
function safeDirectory(path: string) {
  const absolute = resolve(path);
  let current = absolute;
  const missing: string[] = [];
  while (!existsSync(current)) {
    missing.push(current);
    const parent = dirname(current);
    if (parent === current) throw new Error("Cannot resolve log directory");
    current = parent;
  }
  for (let ancestor = current; ; ancestor = dirname(ancestor)) {
    const info = lstatSync(ancestor);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error(`Log rotation refuses unsafe directory: ${ancestor}`);
    if (dirname(ancestor) === ancestor) break;
  }
  for (const directory of missing.reverse())
    mkdirSync(directory, { mode: 0o700 });
}
/** A fresh O_APPEND descriptor for every record prevents detached writers after rename. */
export function rotatingLogDestination(options: LogRotationOptions): Writable {
  const maximumBytes = options.maximumBytes ?? 10 * 1024 ** 2;
  const maximumRotations = options.maximumRotations ?? 12;
  const lockTimeoutMs = options.lockTimeoutMs ?? 1000;
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 64 ||
    !Number.isSafeInteger(maximumRotations) ||
    maximumRotations < 1 ||
    maximumRotations > 1000 ||
    !Number.isSafeInteger(lockTimeoutMs) ||
    lockTimeoutMs < 1 ||
    lockTimeoutMs > 60000
  )
    throw new Error("Invalid bounded log rotation settings");
  const path = resolve(options.path),
    directory = dirname(path);
  const lock = `${path}.lock`,
    recovery = `${lock}.recovery`;
  const warning =
    options.warning ??
    ((message: string) => process.stderr.write(`${message}\n`));
  let warnedAt = 0;
  function warn(message: string) {
    if (Date.now() - warnedAt > 60000) {
      warnedAt = Date.now();
      warning(
        `BoatScout file logging paused: ${message}. Full records continue to stdout. Run the retention preview for expired rotations; no logs were deleted.`,
      );
    }
  }
  function ownerAlive(pid: unknown) {
    if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid < 1)
      return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }
  function recoverAbandonedLock() {
    let descriptor: number | undefined;
    try {
      // The recovery barrier keeps a new writer from acquiring a just-released lock.
      descriptor = openSync(recovery, "wx", 0o600);
      const info = regular(lock);
      if (!info) return;
      let record: { pid?: number } = {};
      try {
        record = JSON.parse(readFileSync(lock, "utf8"));
      } catch {
        /* Interrupted creation waits 30 seconds. */
      }
      if (
        record.pid ? ownerAlive(record.pid) : Date.now() - info.mtimeMs < 30000
      )
        return;
      const current = regular(lock);
      if (
        current &&
        current.ino === info.ino &&
        current.mtimeMs === info.mtimeMs
      )
        unlinkSync(lock);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    } finally {
      if (descriptor !== undefined) {
        closeSync(descriptor);
        unlinkSync(recovery);
      }
    }
  }
  function acquire() {
    const deadline = Date.now() + lockTimeoutMs;
    while (Date.now() <= deadline) {
      if (existsSync(recovery)) {
        pause(3);
        continue;
      }
      try {
        const descriptor = openSync(lock, "wx", 0o600);
        const nonce = randomUUID();
        try {
          writeFileSync(
            descriptor,
            JSON.stringify({
              pid: process.pid,
              nonce,
              createdAt: new Date().toISOString(),
            }),
          );
        } finally {
          closeSync(descriptor);
        }
        return nonce;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        recoverAbandonedLock();
        pause(3);
      }
    }
    throw new Error(
      `another writer holds ${basename(lock)} (or an abandoned recovery barrier needs operator inspection)`,
    );
  }
  function state(
    blocked: boolean,
    rotations: number,
    bytes: number,
    reason?: string,
  ) {
    const status = `${path}.rotation.json`,
      temporary = `${status}.${process.pid}.${randomUUID()}.tmp`;
    const existing = regular(status);
    if (existing && blocked && Date.now() - existing.mtimeMs < 60000) {
      const previous = JSON.parse(readFileSync(status, "utf8"));
      if (
        previous.blocked &&
        previous.reason === reason &&
        previous.rotations === rotations
      )
        return;
    }
    writeFileSync(
      temporary,
      JSON.stringify({
        version: 1,
        at: new Date().toISOString(),
        pid: process.pid,
        blocked,
        reason: reason ?? null,
        rotations,
        currentBytes: bytes,
        maximumBytes,
        maximumRotations,
        retentionRequired: blocked,
      }) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    renameSync(temporary, status);
  }
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      let nonce: string | undefined;
      try {
        safeDirectory(directory);
        nonce = acquire();
        const record = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const info = regular(path);
        const prefix = `${basename(path)}.`;
        const rotations = readdirSync(directory).filter(
          (name) =>
            name.startsWith(prefix) &&
            /^(?:\d+|\d{4}-\d{2}-\d{2})(?:\.gz)?$/.test(
              name.slice(prefix.length),
            ),
        );
        for (const name of rotations) regular(join(directory, name));
        if (
          record.length > maximumBytes ||
          ((info?.size ?? 0) + record.length > maximumBytes &&
            rotations.length >= maximumRotations)
        ) {
          const reason =
            record.length > maximumBytes
              ? "record exceeds the per-file byte limit"
              : "rotation count reached its configured limit";
          state(true, rotations.length, info?.size ?? 0, reason);
          warn(reason);
        } else {
          let count = rotations.length;
          let rotated = false;
          if ((info?.size ?? 0) + record.length > maximumBytes && info?.size) {
            let suffix = Date.now();
            while (existsSync(`${path}.${suffix}`)) suffix++;
            renameSync(path, `${path}.${suffix}`);
            count++;
            rotated = true;
          }
          const descriptor = openSync(
            path,
            constants.O_WRONLY |
              constants.O_CREAT |
              constants.O_APPEND |
              (constants.O_NOFOLLOW || 0),
            0o600,
          );
          try {
            appendFileSync(descriptor, record);
          } finally {
            closeSync(descriptor);
          }
          if (rotated) state(false, count, regular(path)?.size ?? 0);
          // Clear a previous budget warning after the reviewed retention command frees a slot.
          if (existsSync(`${path}.rotation.json`)) {
            const old = JSON.parse(
              readFileSync(`${path}.rotation.json`, "utf8"),
            );
            if (old.blocked) state(false, count, regular(path)?.size ?? 0);
          }
        }
      } catch (error) {
        warn(error instanceof Error ? error.message : String(error));
      } finally {
        if (nonce) {
          try {
            if (JSON.parse(readFileSync(lock, "utf8")).nonce === nonce)
              unlinkSync(lock);
          } catch (error) {
            warn(`could not release file-log lock: ${String(error)}`);
          }
        }
        // File logging is an optional second sink: never crash the app or lose stdout on disk errors.
        callback();
      }
    },
  });
}
