import { statfs, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function assertDiskSpace(
  target: string,
  options: { minimumFreeBytes?: number; requiredBytes?: number } = {},
  inspect: typeof statfs = statfs,
) {
  const minimumFreeBytes =
    options.minimumFreeBytes ??
    Number(process.env.MIN_FREE_DISK_BYTES ?? 512 * 1024 * 1024);
  const requiredBytes = options.requiredBytes ?? 0;
  if (
    ![minimumFreeBytes, requiredBytes].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    throw new Error(
      "Disk-space thresholds must be nonnegative safe integer byte counts",
    );
  let directory = resolve(target);
  while (true) {
    try {
      if (!(await stat(directory)).isDirectory())
        directory = dirname(directory);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(directory);
      if (parent === directory) throw error;
      directory = parent;
    }
  }
  const volume = await inspect(directory);
  const freeBytes = Number(volume.bavail) * Number(volume.bsize);
  if (!Number.isFinite(freeBytes))
    throw new Error("Could not determine available disk space");
  if (freeBytes < minimumFreeBytes + requiredBytes)
    throw new Error(
      `Insufficient free disk space: ${freeBytes} bytes available; ${minimumFreeBytes + requiredBytes} bytes required before writing ${target}`,
    );
  return { directory, freeBytes, minimumFreeBytes, requiredBytes };
}
