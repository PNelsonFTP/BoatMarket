import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
const root = process.env.BOATSCOUT_TEST_ROOT;
if (!root)
  throw new Error(
    "Vitest database safety setup is missing its dedicated temporary root",
  );
const suite = mkdtempSync(join(root, "suite-"));
// Always replace inherited .env/live settings before any test module's static imports.
process.env.DATABASE_URL = `file:${join(suite, "fallback.db").replaceAll("\\", "/")}`;
// Existing tests create their own fixtures with os.tmpdir(); keep all of them inside the guard.
for (const key of ["TMPDIR", "TMP", "TEMP"]) process.env[key] = suite;

vi.mock("@prisma/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@prisma/client")>();
  const { assertTestDatabaseUrl } = await import("../server/database-safety");
  class GuardedPrismaClient extends actual.PrismaClient {
    constructor(options?: import("@prisma/client").Prisma.PrismaClientOptions) {
      const url = assertTestDatabaseUrl(
        options?.datasourceUrl ??
          options?.datasources?.db?.url ??
          process.env.DATABASE_URL,
      )!;
      const { datasourceUrl: _url, datasources, ...rest } = options || {};
      super({ ...rest, datasources: { ...datasources, db: { url } } });
    }
  }
  return { ...actual, PrismaClient: GuardedPrismaClient };
});

// Prisma migration subprocesses must use the same isolated root, including explicit env overrides.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { assertTestDatabaseUrl } = await import("../server/database-safety");
  const guarded =
    (operation: (...args: any[]) => any) =>
    (...args: any[]) => {
      const options = args.find(
        (arg) => arg && typeof arg === "object" && !Array.isArray(arg),
      );
      const environment = options?.env || process.env;
      assertTestDatabaseUrl(environment.DATABASE_URL, {
        ...environment,
        VITEST: "true",
        BOATSCOUT_TEST_ROOT: root,
      });
      return operation(...args);
    };
  return {
    ...actual,
    spawn: guarded(actual.spawn),
    spawnSync: guarded(actual.spawnSync),
    execFile: guarded(actual.execFile),
    execFileSync: guarded(actual.execFileSync),
  };
});
