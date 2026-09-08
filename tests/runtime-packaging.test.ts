import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runtimeManifest } from "../scripts/prune-runtime.mjs";
import {
  enrichRuntimeBom,
  normalizeScannerLicenses,
} from "../scripts/runtime-sbom.mjs";
import { schemaValidator } from "../scripts/sbom-schema.mjs";
it("keeps the deliberate migration and rendered-collector dependencies while removing the website build dependency graph", () => {
  const input = JSON.parse(readFileSync("package.json", "utf8")),
    before = structuredClone(input);
  const output = runtimeManifest(input);
  expect(input).toEqual(before);
  expect(output.dependencies.prisma).toBe(input.dependencies.prisma);
  expect(output.dependencies.playwright).toBe("1.63.0");
  expect(output.dependencies.next).toBeUndefined();
  expect(output.dependencies.react).toBeUndefined();
  expect(output.devDependencies).toEqual({});
  expect(() => runtimeManifest({ ...input, dependencies: {} })).toThrow(
    "Runtime dependency missing",
  );
});
it("adds exact image, native engine and browser hashes to a fully validated runtime CycloneDX graph", () => {
  const digest = "a".repeat(64),
    reference = "boatscout:image:" + digest;
  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      component: { type: "container", name: "boatscout", "bom-ref": reference },
    },
    components: [
      {
        type: "operating-system",
        name: "debian",
        version: "12",
        "bom-ref": "debian",
      },
    ],
    dependencies: [{ ref: reference, dependsOn: ["debian"] }],
  };
  const report = {
    image: "sha256:" + digest,
    platform: "linux/arm64",
    probe: {
      node: "v22.23.2",
      versions: { openssl: "3" },
      packageLockSha256: digest,
      prismaEngineVersion: "6.19.3",
      nativeFiles: [{ path: "schema-engine", sha256: digest, bytes: 100 }],
      browserFiles: [{ path: "chrome", sha256: digest, bytes: 200 }],
      rendering: { status: "passed" },
    },
  };
  const output = enrichRuntimeBom(bom, report, {
    release: "https://github.com/anchore/syft/releases/tag/v1.51.1",
    asset: { sha256: digest },
    binarySha256: digest,
  });
  expect(() =>
    schemaValidator(process.cwd()).validate(output, "runtime fixture"),
  ).not.toThrow();
  expect(output.components).toHaveLength(4);
  expect(output.dependencies[0].dependsOn).toHaveLength(4);
  const invalid = structuredClone(output);
  invalid.components.at(-1).hashes[0].content = "not-a-hash";
  expect(() =>
    schemaValidator(process.cwd()).validate(invalid, "bad hash"),
  ).toThrow();
});
it("preserves newer scanner license identifiers as named licenses without claiming unsupported SPDX validity", () => {
  const bom = {
    components: [
      {
        name: "fixture",
        licenses: [
          { license: { id: "Newer-SPDX-Identifier" } },
          { license: { id: "MIT" } },
        ],
      },
    ],
  };
  expect(normalizeScannerLicenses(bom, new Set(["MIT"]))).toEqual([
    {
      component: "fixture",
      reportedIdentifier: "Newer-SPDX-Identifier",
      representation: "named license; original scanner identifier retained",
    },
  ]);
  expect(bom.components[0].licenses).toEqual([
    { license: { name: "Newer-SPDX-Identifier" } },
    { license: { id: "MIT" } },
  ]);
});
