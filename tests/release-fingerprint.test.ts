import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { canonicalReleasePaths, releaseSourceHash } from "../server/release";

it("normalizes Windows separators before ordering prefix-colliding source paths", () => {
  const posix = [
    "scripts/a0.ts",
    "scripts/a/run.ts",
    ".github/workflows/pages.yml",
  ];
  const windows = posix.map((path) => path.replaceAll("/", "\\"));
  expect(canonicalReleasePaths(posix)).toEqual([
    ".github/workflows/pages.yml",
    "scripts/a/run.ts",
    "scripts/a0.ts",
  ]);
  expect(canonicalReleasePaths(windows)).toEqual(canonicalReleasePaths(posix));
});

it.each([
  ".github/workflows/checks.yml",
  ".github/workflows/pages.yml",
  ".gitattributes",
  ".dockerignore",
  "compose.yaml",
  "postcss.config.mjs",
])(
  "invalidates reviewed release provenance when %s changes",
  async (target) => {
    const before = await releaseSourceHash();
    const after = await releaseSourceHash({
      read: (async (path: unknown) =>
        String(path).replaceAll("\\", "/") === target
          ? Buffer.from("changed deployment/build input")
          : readFile(String(path))) as typeof readFile,
    });
    expect(after).not.toBe(before);
  },
);
