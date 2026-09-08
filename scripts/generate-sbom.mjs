import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";

// Reads the lockfile; never installs, fixes, or changes dependencies.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "sbom");
mkdirSync(destination, { recursive: true });
const lockBytes = readFileSync(resolve(root, "package-lock.json"));
const lock = JSON.parse(lockBytes);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const generatedAt = new Date().toISOString();
const chicagoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(generatedAt));
const timestamp = generatedAt.replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmEnvironment = { ...process.env, NODE_ENV: "development", npm_config_logs_max: "0" };
// Explicit include/omit arguments below prevent NODE_ENV-dependent scope changes.
function runNpm(args) {
  const result = spawnSync(npmCommand, args, {
    cwd: root, encoding: "utf8", env: npmEnvironment, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}
function save(name, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(resolve(destination, name), contents);
  return { file: `sbom/${name}`, sha256: hash(contents) };
}
function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}
function packageName(path, entry) {
  return entry.name ?? path.slice(path.lastIndexOf("node_modules/") + 13);
}
const packages = Object.entries(lock.packages).filter(([path]) => path).map(([path, entry]) => ({
  path, name: packageName(path, entry), ...entry,
}));
const byIdentity = new Map();
for (const entry of packages) {
  const identity = `${entry.name}@${entry.version}`;
  byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), entry]);
}
function resolveDependency(from, name) {
  let current = from;
  for (;;) {
    const candidate = `${current ? `${current}/` : ""}node_modules/${name}`;
    if (lock.packages[candidate]) return candidate;
    if (!current) return null;
    current = posix.dirname(current);
    if (current.endsWith("/node_modules")) current = posix.dirname(current);
    if (current === "node_modules" || current === ".") current = "";
  }
}
const declaredEdges = [];
for (const [from, entry] of Object.entries(lock.packages)) {
  for (const kind of ["dependencies", "optionalDependencies", "peerDependencies", ...(from ? [] : ["devDependencies"])]) {
    for (const [name, requested] of Object.entries(entry[kind] ?? {})) {
      const to = resolveDependency(from, name);
      declaredEdges.push({ from, kind, name, requested, to,
        ...(to ? {} : { bundled: Array.isArray(entry.bundleDependencies) && entry.bundleDependencies.includes(name),
          optionalPeer: Boolean(entry.peerDependenciesMeta?.[name]?.optional) }),
      });
    }
  }
}
const unresolved = declaredEdges.filter((edge) => !edge.to);
const inventory = {
  format: "boatscout-lock-inventory", formatVersion: 1, generatedAt,
  source: { file: "package-lock.json", sha256: hash(lockBytes), lockfileVersion: lock.lockfileVersion },
  root: lock.packages[""],
  description: "Every non-root package-lock entry, including platform optional packages. Dependency edges resolve package paths in this lockfile; unresolved declarations have to:null. This is supplementary inventory, not CycloneDX.",
  packageCount: packages.length, packages, declaredEdges, unresolved,
};
const artifacts = [save("package-lock-inventory.json", inventory)];
const validation = [];
const commands = [];
function validateBom(bom, name) {
  requireCheck(bom.bomFormat === "CycloneDX", `${name}: incorrect format`);
  requireCheck(bom.specVersion === "1.5", `${name}: unexpected CycloneDX version; update validator`);
  requireCheck(Array.isArray(bom.components) && Array.isArray(bom.dependencies), `${name}: missing arrays`);
  const rootRef = bom.metadata?.component?.["bom-ref"];
  requireCheck(rootRef, `${name}: missing root component reference`);
  const refs = new Set([rootRef]);
  for (const component of bom.components) {
    requireCheck(!refs.has(component["bom-ref"]), `${name}: duplicate component reference`);
    refs.add(component["bom-ref"]);
    const candidates = byIdentity.get(`${component.name}@${component.version}`);
    requireCheck(candidates?.length, `${name}: component absent from lockfile`);
    requireCheck(component.purl?.startsWith("pkg:npm/"), `${name}: missing npm package URL`);
    for (const digest of component.hashes ?? []) {
      const algorithm = digest.alg.replaceAll("-", "").toLowerCase();
      requireCheck(candidates.some((entry) => (entry.integrity ?? "").split(/\s+/).some((sri) => {
        const separator = sri.indexOf("-");
        return sri.slice(0, separator) === algorithm && Buffer.from(sri.slice(separator + 1), "base64").toString("hex") === digest.content;
      })), `${name}: digest does not match lockfile for ${component.name}`);
    }
  }
  const nodes = new Set();
  for (const dependency of bom.dependencies) {
    requireCheck(refs.has(dependency.ref) && !nodes.has(dependency.ref), `${name}: invalid graph source`);
    nodes.add(dependency.ref);
    for (const target of dependency.dependsOn ?? []) requireCheck(refs.has(target), `${name}: dangling graph reference`);
  }
  requireCheck(nodes.size === refs.size, `${name}: graph omits a component`);
  return {
    file: `sbom/${name}`, componentCountExcludingRoot: bom.components.length,
    dependencyGraphNodes: nodes.size, dependencyGraphEdges: bom.dependencies.reduce((total, edge) => total + edge.dependsOn.length, 0),
    componentsWithIntegrityHashes: bom.components.filter((component) => component.hashes?.length).length,
    componentsWithLicenseMetadata: bom.components.filter((component) => component.licenses?.length).length,
    jsonParsed: true, referenceCompleteness: true, exactVersionsCorrespondToLockfile: true,
    emittedIntegrityHashesMatchLockfile: true, fullCycloneDxSchemaValidated: false,
  };
}
const baseArgs = ["sbom", "--package-lock-only", "--sbom-format=cyclonedx", "--sbom-type=application"];
const variants = [
  ["boatscout-full.cdx.json", ["--include=dev", "--include=optional", "--include=peer"], true],
  ["boatscout-full-required.cdx.json", ["--omit=optional", "--include=dev", "--include=peer"], false],
  ["boatscout-production.cdx.json", ["--omit=dev", "--include=optional", "--include=peer"], false],
];
for (const [name, scopeArgs, allowKnownBundledFailure] of variants) {
  const args = [...baseArgs, ...scopeArgs];
  const result = runNpm(args);
  const diagnostics = result.stderr.replaceAll(root, "<project>").replace(/\/Users\/[^\s]+/g, "<local-path>").trim();
  const command = { command: ["npm", ...args].join(" "), exitCode: result.status };
  if (result.status !== 0) {
    rmSync(resolve(destination, name), { force: true });
    const missing = diagnostics.split("\n").filter((line) => line.startsWith("npm error missing:"));
    const knownFailure = allowKnownBundledFailure && diagnostics.includes("ESBOMPROBLEMS") && missing.length > 0 &&
      missing.every((line) => unresolved.some((edge) => edge.bundled && line.includes(`${edge.name}@${edge.requested},`)));
    requireCheck(knownFailure, `SBOM generation failed: ${diagnostics}`);
    const errorArtifact = save("full-sbom-generation-limitation.json", {
      generatedAt, sourceLockSha256: hash(lockBytes), ...command, diagnostics,
      explanation: "npm lock-only SBOM cannot resolve some bundled dependency versions of an optional WASM package. No synthetic versions or dependency fixes were added. See package-lock-inventory.json for every available locked package and unresolved declaration.",
    });
    artifacts.push(errorArtifact);
    commands.push({ ...command, result: "known limitation", evidence: errorArtifact.file });
    continue;
  }
  const bom = JSON.parse(result.stdout);
  // npm uses the checkout directory as the root display name in lock-only mode.
  // Normalize only that display field to make the artifact independent of folder name.
  bom.metadata.component.name = lock.packages[""].name;
  validation.push(validateBom(bom, name));
  artifacts.push(save(name, bom));
  commands.push({ ...command, result: "generated", file: `sbom/${name}` });
}
const audits = [];
if (process.argv.includes("--audit")) {
  for (const [scope, scopeArgs] of [
    ["full", ["--include=dev", "--include=optional", "--include=peer"]],
    ["production", ["--omit=dev", "--include=optional", "--include=peer"]],
  ]) {
    const args = ["audit", "--package-lock-only", "--json", "--ignore-scripts", "--registry=https://registry.npmjs.org", ...scopeArgs];
    const checkedAt = new Date().toISOString();
    const result = runNpm(args);
    let report;
    try { report = JSON.parse(result.stdout); } catch { throw new Error(`npm audit ${scope} did not return JSON`); }
    requireCheck(report.metadata?.vulnerabilities && !report.error, `npm audit ${scope} failed to obtain a vulnerability report`);
    const artifact = save(`npm-audit-${scope}-${timestamp}.json`, report);
    artifacts.push(artifact);
    audits.push({ scope, checkedAt, command: ["npm", ...args].join(" "), exitCode: result.status,
      ...artifact, vulnerabilities: report.metadata.vulnerabilities,
      note: "Read-only registry advisory report; no audit fix or dependency changes performed.",
    });
  }
  save("audit-provenance.json", { generatedAt, chicagoDate, timezone: "America/Chicago", sourceLockSha256: hash(lockBytes), audits });
}
requireCheck(hash(readFileSync(resolve(root, "package-lock.json"))) === hash(lockBytes), "Lockfile changed during generation; rerun after edits finish");
requireCheck(packages.length === Object.keys(lock.packages).length - 1, "Inventory dropped lock entries");
const report = {
  generatedAt, chicagoDate, timezone: "America/Chicago", nodeVersion: process.version,
  npmVersion: runNpm(["--version"]).stdout.trim(), platform: process.platform, arch: process.arch,
  source: { file: "package-lock.json", sha256: hash(lockBytes), lockfileVersion: lock.lockfileVersion },
  transformations: ["Normalized CycloneDX root display name to package-lock root name; no dependency components or graph edges changed."],
  lockInventory: { packages: packages.length, uniqueNameVersionPairs: byIdentity.size,
    optionalFlaggedEntries: packages.filter((entry) => entry.optional).length,
    entriesWithIntegrity: packages.filter((entry) => entry.integrity).length,
    entriesWithDeclaredLicense: packages.filter((entry) => entry.license).length,
    unresolvedDependencyDeclarations: unresolved.length, unresolvedBundledDeclarations: unresolved.filter((edge) => edge.bundled).length },
  lockUnchangedAfterGeneration: true, commands, artifacts, validation,
  auditReports: audits.length ? "sbom/audit-provenance.json" : "Not refreshed by this run; --audit requests new read-only reports.",
  limitations: [
    "A source dependency SBOM, not an inventory of an installed deployment, bundled browser assets, container OS, Node binary, browser binaries, or separately downloaded Prisma engines.",
    "License identifiers and integrity digests are declared lock metadata; license texts and downloaded artifact contents were not independently reviewed.",
    "Structural/reference/lock correspondence checks are performed, not complete CycloneDX JSON Schema validation.",
    "Timestamp and serial UUID fields vary between regenerations. Use the same lockfile and npm version for comparable dependency content.",
  ],
};
save("provenance.json", report);
console.log(JSON.stringify({ generatedAt, sourceLockSha256: hash(lockBytes), lockInventory: report.lockInventory, validation, audits }, null, 2));
