import { rm } from "node:fs/promises";
import type { TestProject } from "vitest/node";
export default function setup(project: TestProject) {
  const root = project.config.env.BOATSCOUT_TEST_ROOT;
  // This path is the freshly created config-owned root, never a value changed by a test.
  return async () => {
    if (root) await rm(root, { recursive: true, force: true });
  };
}
