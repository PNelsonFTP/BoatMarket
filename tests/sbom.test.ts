import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { schemaValidator } from "../scripts/sbom-schema.mjs";
import { bundledEvidence } from "../scripts/sbom-evidence.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
describe("SBOM schema and verified bundle evidence", () => {
  it("validates the actual full-platform BOM and rejects unsupported fields and invalid license identifiers", () => {
    const validator = schemaValidator(root);
    const bom = JSON.parse(
      readFileSync(
        resolve(root, "sbom/boatscout-all-platforms.cdx.json"),
        "utf8",
      ),
    );
    expect(() => validator.validate(bom, "published")).not.toThrow();
    expect(() =>
      validator.validate({ ...bom, unexpected: true }, "bad-field"),
    ).toThrow(/additional properties/);
    const badLicense = structuredClone(bom);
    badLicense.components[0].licenses = [
      { license: { id: "Invented-Not-SPDX" } },
    ];
    expect(() => validator.validate(badLicense, "bad-license")).toThrow(
      /schema validation failed/,
    );
  });
  it("includes all exact bundled versions and rejects stale or tampered evidence without network calls", async () => {
    const lock = JSON.parse(
      readFileSync(resolve(root, "package-lock.json"), "utf8"),
    );
    const evidence = await bundledEvidence(root, lock);
    expect(evidence.packages).toHaveLength(6);
    expect(
      evidence.packages.find((p: { name: string }) => p.name === "@emnapi/core")
        .version,
    ).toBe("1.11.1");
    const dir = mkdtempSync(resolve(tmpdir(), "boatscout-sbom-"));
    scratch.push(dir);
    mkdirSync(resolve(dir, "sbom"));
    const altered = structuredClone(evidence);
    altered.packages[0].manifestText += " ";
    writeFileSync(
      resolve(dir, "sbom/bundled-package-evidence.json"),
      JSON.stringify(altered),
    );
    await expect(bundledEvidence(dir, lock)).rejects.toThrow(
      /evidence changed/,
    );
    altered.parent.version = "0.0.0";
    writeFileSync(
      resolve(dir, "sbom/bundled-package-evidence.json"),
      JSON.stringify(altered),
    );
    await expect(bundledEvidence(dir, lock)).rejects.toThrow(
      /no longer matches/,
    );
  });
});
