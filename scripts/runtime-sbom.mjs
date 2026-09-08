import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  chmod,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { docker, smokeImage } from "./docker-smoke.mjs";
import { schemaValidator } from "./sbom-schema.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (data) => createHash("sha256").update(data).digest("hex");
export function normalizeScannerLicenses(bom, supportedIds) {
  const changed = [];
  function visit(component) {
    if (!component) return;
    for (const entry of component.licenses || []) {
      const id = entry.license?.id;
      if (id && !supportedIds.has(id)) {
        entry.license = { ...entry.license, name: id };
        delete entry.license.id;
        component.properties = [
          ...(component.properties || []),
          {
            name: "boatscout:scanner-license-identifier-outside-vendored-spdx-enum",
            value: id,
          },
        ];
        changed.push({
          component: component["bom-ref"] || component.name,
          reportedIdentifier: id,
          representation: "named license; original scanner identifier retained",
        });
      }
    }
    for (const child of component.components || []) visit(child);
  }
  visit(bom.metadata?.component);
  for (const component of bom.components || []) visit(component);
  return changed;
}
export function enrichRuntimeBom(bom, report, toolchain) {
  const evidence = report.probe;
  const component = bom.metadata?.component;
  if (!component)
    throw new Error("Scanner did not identify an image component");
  bom.serialNumber = `urn:uuid:${randomUUID()}`;
  component.properties = [
    ...(component.properties || []),
    { name: "boatscout:image-id", value: report.image },
    { name: "boatscout:platform", value: report.platform },
    {
      name: "boatscout:runtime-package-lock-sha256",
      value: evidence.packageLockSha256,
    },
  ];
  bom.components ||= [];
  const added = [];
  const record = (entry) => {
    bom.components.push(entry);
    added.push(entry["bom-ref"]);
  };
  record({
    type: "application",
    "bom-ref": "boatscout:runtime:node",
    name: "Node.js executable runtime",
    version: evidence.node,
    properties: [
      {
        name: "boatscout:compiled-versions",
        value: JSON.stringify(evidence.versions),
      },
    ],
  });
  for (const file of evidence.nativeFiles)
    record({
      type: "file",
      "bom-ref": `boatscout:file:${file.sha256}:${file.path}`,
      name: file.path,
      version: evidence.prismaEngineVersion,
      hashes: [{ alg: "SHA-256", content: file.sha256 }],
      properties: [
        { name: "boatscout:category", value: "Prisma native engine" },
        { name: "boatscout:bytes", value: String(file.bytes) },
      ],
    });
  for (const file of evidence.browserFiles)
    record({
      type: "file",
      "bom-ref": `boatscout:file:${file.sha256}:${file.path}`,
      name: file.path,
      ...(file.version ? { version: file.version } : {}),
      hashes: [{ alg: "SHA-256", content: file.sha256 }],
      properties: [
        { name: "boatscout:category", value: "Browser runtime executable" },
        {
          name: "boatscout:rendered-fixture",
          value: evidence.rendering.status,
        },
      ],
    });
  bom.dependencies ||= [];
  const parent = bom.dependencies.find(
    (entry) => entry.ref === component["bom-ref"],
  );
  if (parent)
    parent.dependsOn = [...new Set([...(parent.dependsOn || []), ...added])];
  else bom.dependencies.push({ ref: component["bom-ref"], dependsOn: added });
  for (const ref of added) bom.dependencies.push({ ref, dependsOn: [] });
  bom.metadata.properties = [
    ...(bom.metadata.properties || []),
    { name: "boatscout:scanner-release", value: toolchain.release },
    { name: "boatscout:scanner-archive-sha256", value: toolchain.asset.sha256 },
    { name: "boatscout:scanner-binary-sha256", value: toolchain.binarySha256 },
    {
      name: "boatscout:coverage-limit",
      value:
        "Packages detected in this exact local image plus executable hashes; not a vulnerability scan, proof of source reproducibility, every statically linked component, or a registry publication attestation.",
    },
  ];
  return bom;
}
async function scanner(directory) {
  const toolchain = JSON.parse(
    await readFile(join(root, "scripts/runtime-toolchain.json"), "utf8"),
  );
  const asset = toolchain.assets[`${process.platform}-${process.arch}`];
  if (!asset)
    throw new Error(
      "No verified Syft archive configured for this host architecture",
    );
  const url = `https://github.com/anchore/syft/releases/download/v${toolchain.version}/${asset.name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok)
    throw new Error(`Scanner download returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha(bytes) !== asset.sha256)
    throw new Error(
      "Scanner archive checksum did not match verified official release metadata",
    );
  const archive = join(directory, asset.name),
    executable = process.platform === "win32" ? "syft.exe" : "syft";
  await writeFile(archive, bytes);
  const extracted = spawnSync(
    "tar",
    ["-xf", archive, "-C", directory, executable],
    { encoding: "utf8" },
  );
  if (extracted.error || extracted.status !== 0)
    throw new Error(extracted.error?.message || extracted.stderr);
  const path = join(directory, executable);
  await chmod(path, 0o700);
  const binarySha256 = sha(await readFile(path));
  const version = spawnSync(path, ["version", "-o", "json"], {
    encoding: "utf8",
  });
  if (version.error || version.status !== 0)
    throw new Error("Verified scanner failed to start");
  return {
    path,
    evidence: {
      release: toolchain.release,
      version: JSON.parse(version.stdout),
      asset: { ...asset, url },
      binarySha256,
    },
  };
}
async function main() {
  const [image, ...options] = process.argv.slice(2);
  if (!image || options.some((option) => option !== "--rendered"))
    throw new Error("Usage: npm run sbom:runtime -- IMAGE [--rendered]");
  const temporary = await mkdtemp(join(tmpdir(), "boatscout-syft-"));
  try {
    const syft = await scanner(temporary);
    const { report, output: smokeReport } = await smokeImage(image, {
      rendered: options.includes("--rendered"),
    });
    const context = JSON.parse(docker(["context", "inspect"]))[0];
    const output = spawnSync(
      syft.path,
      [
        "scan",
        `docker:${report.image}`,
        "--scope",
        "squashed",
        "--output",
        "cyclonedx-json@1.5",
      ],
      {
        encoding: "utf8",
        maxBuffer: 100 * 1024 * 1024,
        env: {
          ...process.env,
          ...(process.env.DOCKER_HOST
            ? {}
            : { DOCKER_HOST: context.Endpoints.docker.Host }),
          SYFT_CHECK_FOR_APP_UPDATE: "false",
        },
      },
    );
    if (output.error || output.status !== 0)
      throw new Error(output.error?.message || output.stderr);
    const bom = enrichRuntimeBom(
      JSON.parse(output.stdout),
      report,
      syft.evidence,
    );
    const licenseRepresentations = normalizeScannerLicenses(
      bom,
      new Set(
        JSON.parse(
          await readFile(join(root, "sbom/schemas/spdx.schema.json"), "utf8"),
        ).enum,
      ),
    );
    schemaValidator(root).validate(bom, "Runtime image SBOM");
    const digest = report.image.replace(":", "-"),
      destination = join(root, "sbom/runtime");
    await mkdir(destination, { recursive: true });
    const file = join(
      destination,
      `${digest}.${report.generatedAt.replaceAll(":", "-")}.cdx.json`,
    );
    const payload = JSON.stringify(bom, null, 2) + "\n";
    await writeFile(file, payload, { flag: "wx" });
    const manifest = {
      generatedAt: report.generatedAt,
      imageId: report.image,
      repositoryDigests: report.repositoryDigests,
      platform: report.platform,
      sbom: {
        file: file.slice(root.length + 1),
        sha256: sha(payload),
        components: bom.components.length,
        schema: "CycloneDX 1.5 full schema validation passed",
      },
      smokeReport: smokeReport.replace(/^.*sbom\/runtime\//, "sbom/runtime/"),
      scanner: syft.evidence,
      licenseRepresentations,
      originalImageCreated: JSON.parse(
        docker(["image", "inspect", report.image]),
      )[0].Created,
      limitation:
        "The immutable local Docker image ID identifies the scanned image. Repository digest metadata comes from the local daemon; no registry push is implied.",
    };
    await writeFile(
      file.replace(/\.cdx\.json$/, ".provenance.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx" },
    );
    console.log(JSON.stringify(manifest));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
