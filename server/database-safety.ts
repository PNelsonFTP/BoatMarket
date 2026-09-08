import { existsSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
export function isTestDatabaseContext(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    environment.VITEST === "true" ||
    environment.NODE_ENV === "test" ||
    !!environment.BOATSCOUT_TEST_ROOT
  );
}
/** Resolve existing ancestors too: a symlink inside a test directory must not escape it. */
function canonicalPath(path: string): string {
  let existing = resolve(path);
  const missing: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error("Cannot resolve database path");
    missing.unshift(basename(existing));
    existing = parent;
  }
  // Native realpath expands Windows 8.3 aliases (RUNNER~1) consistently for
  // both existing files and their ancestor directories before containment checks.
  return resolve(realpathSync.native(existing), ...missing);
}
const within = (root: string, target: string) => {
  const part = relative(root, target);
  return (
    !!part && !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`)
  );
};
export function assertTestDatabaseUrl(
  value: string | undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if (!isTestDatabaseContext(environment)) return value;
  const configuredRoot = environment.BOATSCOUT_TEST_ROOT;
  if (!configuredRoot || !isAbsolute(configuredRoot))
    throw new Error(
      "Test database safety: an isolated BOATSCOUT_TEST_ROOT is required before importing the database",
    );
  const root = canonicalPath(configuredRoot),
    workspace = canonicalPath(projectRoot);
  if (
    !basename(root).startsWith("boatscout-vitest-") ||
    root === workspace ||
    within(workspace, root)
  )
    throw new Error(
      "Test database safety: the dedicated test root must be outside the workspace",
    );
  if (
    !value?.startsWith("file:") ||
    !value.slice(5) ||
    /[?#%\0]/.test(value.slice(5))
  )
    throw new Error(
      "Test database safety: an unambiguous temporary SQLite file URL is required",
    );
  const raw = value.slice(5);
  const path = canonicalPath(
    isAbsolute(raw) ? raw : resolve(projectRoot, "prisma", raw),
  );
  if (!within(root, path))
    throw new Error(
      "Test database safety: refusing a database outside the isolated test root; live/workspace databases are forbidden",
    );
  return `file:${path.replaceAll("\\", "/")}`;
}
