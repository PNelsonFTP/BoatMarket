import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { bundledEvidence } from "./sbom-evidence.mjs";
import { schemaValidator } from "./sbom-schema.mjs";

// Reads the lockfile; never installs, fixes, or changes dependencies.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "sbom");
mkdirSync(destination, { recursive: true });
const lockBytes = readFileSync(resolve(root, "package-lock.json"));
const lock = JSON.parse(lockBytes);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const generatedAt = new Date().toISOString();
const chicagoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(generatedAt));
const timestamp = generatedAt.replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
const npmEntrypoint = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
].find((path) => path && /\.[cm]?js$/.test(path) && existsSync(path));
if (process.platform === "win32" && !npmEntrypoint)
  throw new Error(
    "Could not locate npm's JavaScript entry point. Run this script through npm run sbom on Windows.",
  );
const npmEnvironment = {
  ...process.env,
  NODE_ENV: "development",
  npm_config_logs_max: "0",
};
// Explicit include/omit arguments below prevent NODE_ENV-dependent scope changes.
function runNpm(args) {
  const result = spawnSync(
    npmEntrypoint ? process.execPath : "npm",
    npmEntrypoint ? [npmEntrypoint, ...args] : args,
    {
      cwd: root,
      encoding: "utf8",
      env: npmEnvironment,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
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
const packages = Object.entries(lock.packages)
  .filter(([path]) => path)
  .map(([path, entry]) => ({
    path,
    name: packageName(path, entry),
    ...entry,
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
  for (const kind of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    ...(from ? [] : ["devDependencies"]),
  ]) {
    for (const [name, requested] of Object.entries(entry[kind] ?? {})) {
      const to = resolveDependency(from, name);
      declaredEdges.push({
        from,
        kind,
        name,
        requested,
        to,
        ...(to
          ? {}
          : {
              bundled:
                Array.isArray(entry.bundleDependencies) &&
                entry.bundleDependencies.includes(name),
              optionalPeer: Boolean(
                entry.peerDependenciesMeta?.[name]?.optional,
              ),
            }),
      });
    }
  }
}
const unresolved = declaredEdges.filter((edge) => !edge.to);
const inventory = {
  format: "boatscout-lock-inventory",
  formatVersion: 1,
  generatedAt,
  source: {
    file: "package-lock.json",
    sha256: hash(lockBytes),
    lockfileVersion: lock.lockfileVersion,
  },
  root: lock.packages[""],
  description:
    "Every non-root package-lock entry, including platform optional packages. Dependency edges resolve package paths in this lockfile; unresolved declarations have to:null. This is supplementary inventory, not CycloneDX.",
  packageCount: packages.length,
  packages,
  declaredEdges,
  unresolved,
};
const artifacts = [save("package-lock-inventory.json", inventory)];
const validation = [];
const commands = [];
const schema = schemaValidator(root);
const bundle = await bundledEvidence(
  root,
  lock,
  process.argv.includes("--refresh-bundles"),
);
const bundleEntries = bundle.packages.map((entry) => ({
  ...JSON.parse(entry.manifestText),
  path: entry.path,
  bundleEvidence: entry,
  dev: true,
  optional: true,
}));
const fullPackages = [...packages, ...bundleEntries];
const fullByIdentity = new Map(byIdentity);
for (const entry of bundleEntries) {
  const identity = `${entry.name}@${entry.version}`;
  fullByIdentity.set(identity, [
    ...(fullByIdentity.get(identity) || []),
    entry,
  ]);
}
function validateBom(bom, name, includeVerifiedBundle = false) {
  schema.validate(bom, name);
  requireCheck(bom.bomFormat === "CycloneDX", `${name}: incorrect format`);
  requireCheck(
    bom.specVersion === "1.5",
    `${name}: unexpected CycloneDX version; update validator`,
  );
  requireCheck(
    Array.isArray(bom.components) && Array.isArray(bom.dependencies),
    `${name}: missing arrays`,
  );
  const rootRef = bom.metadata?.component?.["bom-ref"];
  requireCheck(rootRef, `${name}: missing root component reference`);
  const refs = new Set([rootRef]);
  for (const component of bom.components) {
    requireCheck(
      !refs.has(component["bom-ref"]),
      `${name}: duplicate component reference`,
    );
    refs.add(component["bom-ref"]);
    const candidates = (
      includeVerifiedBundle ? fullByIdentity : byIdentity
    ).get(`${component.name}@${component.version}`);
    requireCheck(
      candidates?.length,
      `${name}: component absent from lockfile or applicable verified bundle evidence`,
    );
    requireCheck(
      component.purl?.startsWith("pkg:npm/"),
      `${name}: missing npm package URL`,
    );
    for (const digest of component.hashes ?? []) {
      const algorithm = digest.alg.replaceAll("-", "").toLowerCase();
      requireCheck(
        candidates.some((entry) =>
          (entry.integrity ?? "").split(/\s+/).some((sri) => {
            const separator = sri.indexOf("-");
            return (
              sri.slice(0, separator) === algorithm &&
              Buffer.from(sri.slice(separator + 1), "base64").toString(
                "hex",
              ) === digest.content
            );
          }),
        ),
        `${name}: digest does not match lockfile for ${component.name}`,
      );
    }
  }
  const nodes = new Set();
  for (const dependency of bom.dependencies) {
    requireCheck(
      refs.has(dependency.ref) && !nodes.has(dependency.ref),
      `${name}: invalid graph source`,
    );
    nodes.add(dependency.ref);
    for (const target of dependency.dependsOn ?? [])
      requireCheck(refs.has(target), `${name}: dangling graph reference`);
  }
  requireCheck(nodes.size === refs.size, `${name}: graph omits a component`);
  return {
    file: `sbom/${name}`,
    componentCountExcludingRoot: bom.components.length,
    dependencyGraphNodes: nodes.size,
    dependencyGraphEdges: bom.dependencies.reduce(
      (total, edge) => total + edge.dependsOn.length,
      0,
    ),
    componentsWithIntegrityHashes: bom.components.filter(
      (component) => component.hashes?.length,
    ).length,
    componentsWithLicenseMetadata: bom.components.filter(
      (component) => component.licenses?.length,
    ).length,
    jsonParsed: true,
    referenceCompleteness: true,
    exactVersionsCorrespondToLockfile: !includeVerifiedBundle,
    ...(includeVerifiedBundle
      ? { exactVersionsCorrespondToLockfileOrVerifiedBundle: true }
      : {}),
    emittedIntegrityHashesMatchLockfile: true,
    fullCycloneDxSchemaValidated: true,
    schemaCommit: schema.provenance.commit,
    schemaFormatPolicy: schema.formatPolicy,
  };
}
const baseArgs = [
  "sbom",
  "--package-lock-only",
  "--sbom-format=cyclonedx",
  "--sbom-type=application",
];
const variants = [
  [
    "boatscout-full.cdx.json",
    ["--include=dev", "--include=optional", "--include=peer"],
    true,
  ],
  [
    "boatscout-full-required.cdx.json",
    ["--omit=optional", "--include=dev", "--include=peer"],
    false,
  ],
  [
    "boatscout-production.cdx.json",
    ["--omit=dev", "--include=optional", "--include=peer"],
    false,
  ],
];
for (const [name, scopeArgs, allowKnownBundledFailure] of variants) {
  const args = [...baseArgs, ...scopeArgs];
  const result = runNpm(args);
  const diagnostics = result.stderr
    .replaceAll(root, "<project>")
    .replace(/\/Users\/[^\s]+/g, "<local-path>")
    .trim();
  const command = {
    command: ["npm", ...args].join(" "),
    exitCode: result.status,
  };
  if (result.status !== 0) {
    rmSync(resolve(destination, name), { force: true });
    const missing = diagnostics
      .split("\n")
      .filter((line) => line.startsWith("npm error missing:"));
    const knownFailure =
      allowKnownBundledFailure &&
      diagnostics.includes("ESBOMPROBLEMS") &&
      missing.length > 0 &&
      missing.every((line) =>
        unresolved.some(
          (edge) =>
            edge.bundled && line.includes(`${edge.name}@${edge.requested},`),
        ),
      );
    requireCheck(knownFailure, `SBOM generation failed: ${diagnostics}`);
    const errorArtifact = save("full-sbom-generation-limitation.json", {
      generatedAt,
      sourceLockSha256: hash(lockBytes),
      ...command,
      diagnostics,
      explanation:
        "npm lock-only SBOM cannot resolve some bundled dependency versions of an optional WASM package. No lockfile changes or synthetic versions were added. The separate boatscout-all-platforms.cdx.json includes exact bundled versions from integrity-verified published contents; this file preserves npm's tool limitation.",
    });
    artifacts.push(errorArtifact);
    commands.push({
      ...command,
      result: "known limitation",
      evidence: errorArtifact.file,
    });
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
// npm's lock-only command cannot see bundled manifests. Build a distinct, explicitly
// scoped all-lock-platform BOM using the verified physical package instances.
const fullPathMap = new Map(fullPackages.map((entry) => [entry.path, entry]));
function fullDependency(from, name) {
  let current = from;
  for (;;) {
    const candidate = `${current ? `${current}/` : ""}node_modules/${name}`;
    if (fullPathMap.has(candidate)) return candidate;
    if (!current) return null;
    current = posix.dirname(current);
    if (current.endsWith("/node_modules")) current = posix.dirname(current);
    if (current === "node_modules" || current === ".") current = "";
  }
}
const allEntries = [{ ...lock.packages[""], path: "" }, ...fullPackages];
const fullEdges = allEntries.flatMap((entry) =>
  [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    ...(entry.path ? [] : ["devDependencies"]),
  ].flatMap((kind) =>
    Object.entries(entry[kind] || {}).map(([name, requested]) => ({
      from: entry.path,
      kind,
      name,
      requested,
      to: fullDependency(entry.path, name),
      optionalPeer: Boolean(entry.peerDependenciesMeta?.[name]?.optional),
    })),
  ),
);
const fullUnresolved = fullEdges.filter((edge) => !edge.to);
requireCheck(
  fullUnresolved.every(
    (edge) => edge.kind === "peerDependencies" && edge.optionalPeer,
  ),
  "The full bundle-enriched dependency graph still has unexplained unresolved dependencies",
);
const ref = (path) =>
  path
    ? `urn:boatscout:npm:${encodeURIComponent(path)}`
    : "urn:boatscout:application";
const purl = (name, version) =>
  `pkg:npm/${name.replace(/^@/, "%40")}@${encodeURIComponent(version)}`;
const component = (entry) => ({
  "bom-ref": ref(entry.path),
  type: "library",
  name: entry.name,
  version: entry.version,
  scope: entry.optional ? "optional" : "required",
  purl: purl(entry.name, entry.version),
  ...(entry.license ? { licenses: [{ expression: entry.license }] } : {}),
  ...(entry.integrity
    ? {
        hashes: entry.integrity.split(/\s+/).map((sri) => {
          const i = sri.indexOf("-");
          return {
            alg: sri.slice(0, i).replace(/^sha/, "SHA-"),
            content: Buffer.from(sri.slice(i + 1), "base64").toString("hex"),
          };
        }),
      }
    : {}),
  ...(entry.resolved
    ? { externalReferences: [{ type: "distribution", url: entry.resolved }] }
    : {}),
  properties: [
    { name: "boatscout:package-path", value: entry.path },
    { name: "boatscout:development", value: String(Boolean(entry.dev)) },
    ...(entry.os
      ? [{ name: "boatscout:platform-os", value: JSON.stringify(entry.os) }]
      : []),
    ...(entry.cpu
      ? [{ name: "boatscout:platform-cpu", value: JSON.stringify(entry.cpu) }]
      : []),
    ...(entry.bundleEvidence
      ? [
          { name: "boatscout:bundled-in", value: bundle.parent.path },
          {
            name: "boatscout:manifest-sha256",
            value: entry.bundleEvidence.manifestSha256,
          },
          {
            name: "boatscout:content-inventory-sha256",
            value: entry.bundleEvidence.contentInventorySha256,
          },
        ]
      : []),
  ],
});
const enrichedBom = {
  $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: generatedAt,
    lifecycles: [{ phase: "pre-build" }],
    tools: [
      {
        vendor: "BoatScout",
        name: "lock-and-verified-bundle-inventory",
        version: "1.0.0",
      },
    ],
    component: {
      "bom-ref": ref(""),
      type: "application",
      name: lock.packages[""].name,
      version: lock.packages[""].version,
      purl: purl(lock.packages[""].name, lock.packages[""].version),
    },
    properties: [
      {
        name: "boatscout:scope",
        value:
          "All package-lock physical entries for all platforms plus exact verified bundled package instances. Absent optional peer declarations remain excluded and documented in enriched-dependency-evidence.json. This is not an installed image inventory.",
      },
    ],
  },
  components: fullPackages.map(component),
  dependencies: allEntries.map((entry) => ({
    ref: ref(entry.path),
    dependsOn: [
      ...new Set(
        fullEdges
          .filter((edge) => edge.from === entry.path && edge.to)
          .map((edge) => ref(edge.to)),
      ),
    ].sort(),
  })),
};
validation.push(
  validateBom(enrichedBom, "boatscout-all-platforms.cdx.json", true),
);
artifacts.push(save("boatscout-all-platforms.cdx.json", enrichedBom));
artifacts.push(
  save("enriched-dependency-evidence.json", {
    generatedAt,
    sourceLockSha256: hash(lockBytes),
    bundledEvidence: "sbom/bundled-package-evidence.json",
    packages: fullPackages.length,
    bundledPhysicalPackages: bundleEntries.length,
    declaredEdges: fullEdges,
    unresolvedOptionalPeers: fullUnresolved,
  }),
);
artifacts.push({
  file: "sbom/bundled-package-evidence.json",
  sha256: hash(
    readFileSync(resolve(destination, "bundled-package-evidence.json")),
  ),
});
commands.push({
  command:
    "BoatScout generator: lock inventory + verified bundled package manifests",
  result: "generated",
  file: "sbom/boatscout-all-platforms.cdx.json",
});
const audits = [];
if (process.argv.includes("--audit")) {
  for (const [scope, scopeArgs] of [
    ["full", ["--include=dev", "--include=optional", "--include=peer"]],
    ["production", ["--omit=dev", "--include=optional", "--include=peer"]],
  ]) {
    const args = [
      "audit",
      "--package-lock-only",
      "--json",
      "--ignore-scripts",
      "--registry=https://registry.npmjs.org",
      ...scopeArgs,
    ];
    const checkedAt = new Date().toISOString();
    const result = runNpm(args);
    let report;
    try {
      report = JSON.parse(result.stdout);
    } catch {
      throw new Error(`npm audit ${scope} did not return JSON`);
    }
    requireCheck(
      report.metadata?.vulnerabilities && !report.error,
      `npm audit ${scope} failed to obtain a vulnerability report`,
    );
    const artifact = save(`npm-audit-${scope}-${timestamp}.json`, report);
    artifacts.push(artifact);
    audits.push({
      scope,
      checkedAt,
      command: ["npm", ...args].join(" "),
      exitCode: result.status,
      ...artifact,
      vulnerabilities: report.metadata.vulnerabilities,
      note: "Read-only registry advisory report; no audit fix or dependency changes performed.",
    });
  }
  save("audit-provenance.json", {
    generatedAt,
    chicagoDate,
    timezone: "America/Chicago",
    sourceLockSha256: hash(lockBytes),
    audits,
  });
}
requireCheck(
  hash(readFileSync(resolve(root, "package-lock.json"))) === hash(lockBytes),
  "Lockfile changed during generation; rerun after edits finish",
);
requireCheck(
  packages.length === Object.keys(lock.packages).length - 1,
  "Inventory dropped lock entries",
);
const report = {
  generatedAt,
  chicagoDate,
  timezone: "America/Chicago",
  nodeVersion: process.version,
  npmVersion: runNpm(["--version"]).stdout.trim(),
  platform: process.platform,
  arch: process.arch,
  source: {
    file: "package-lock.json",
    sha256: hash(lockBytes),
    lockfileVersion: lock.lockfileVersion,
  },
  transformations: [
    "Normalized npm-generated CycloneDX root display name to package-lock root name; their dependency components and graph edges remain unchanged.",
    "Built separate all-platforms CycloneDX from every locked physical package instance plus previously integrity-verified bundled manifests.",
  ],
  schemaValidation: {
    implementation: "Ajv and ajv-formats already present in the lockfile",
    provenance: "sbom/schemas/provenance.json",
    commit: schema.provenance.commit,
    formatPolicy: schema.formatPolicy,
  },
  verifiedBundle: {
    file: "sbom/bundled-package-evidence.json",
    verifiedAt: bundle.verifiedAt,
    packages: bundleEntries.length,
    archiveIntegrityMatchesCurrentLock: true,
    tarballFetchedThisRun: process.argv.includes("--refresh-bundles"),
  },
  lockInventory: {
    packages: packages.length,
    uniqueNameVersionPairs: byIdentity.size,
    optionalFlaggedEntries: packages.filter((entry) => entry.optional).length,
    entriesWithIntegrity: packages.filter((entry) => entry.integrity).length,
    entriesWithDeclaredLicense: packages.filter((entry) => entry.license)
      .length,
    unresolvedDependencyDeclarations: unresolved.length,
    unresolvedBundledDeclarations: unresolved.filter((edge) => edge.bundled)
      .length,
  },
  lockUnchangedAfterGeneration: true,
  commands,
  artifacts,
  validation,
  auditReports: audits.length
    ? "sbom/audit-provenance.json"
    : "Not refreshed by this run; --audit requests new read-only reports.",
  limitations: [
    "A source dependency SBOM, not an inventory of an installed deployment, bundled browser assets, container OS, Node binary, browser binaries, or separately downloaded Prisma engines.",
    "License identifiers and integrity digests are declared lock metadata; license texts and downloaded artifact contents were not independently reviewed.",
    "Full vendored CycloneDX 1.5 JSON Schema validation is performed; international IRI/email forms fail closed because the generator currently accepts only their ASCII URI/email subsets.",
    "All-platform bundled components are evidenced by a previously integrity-verified published archive. Ordinary generation checks committed evidence; --refresh-bundles downloads and re-verifies the current locked archive.",
    "Timestamp and serial UUID fields vary between regenerations. Use the same lockfile and npm version for comparable dependency content.",
  ],
};
save("provenance.json", report);
console.log(
  JSON.stringify(
    {
      generatedAt,
      sourceLockSha256: hash(lockBytes),
      lockInventory: report.lockInventory,
      validation,
      audits,
    },
    null,
    2,
  ),
);
