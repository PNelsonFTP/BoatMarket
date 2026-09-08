import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const testRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "boatscout-vitest-")),
);
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
    setupFiles: ["./tests/setup-database.ts"],
    globalSetup: ["./tests/database-global.ts"],
    env: { BOATSCOUT_TEST_ROOT: testRoot },
  },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
