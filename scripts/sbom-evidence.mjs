import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function requireCheck(value, message) {
  if (!value) throw new Error(message);
}
/** Inspect regular files in memory; never extract or execute package contents. */
function regularTarFiles(archive) {
  const tar = gunzipSync(archive, { maxOutputLength: 128 * 1024 * 1024 });
  const files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, end) =>
      header.subarray(start, end).toString("utf8").split("\0")[0];
    const file = [field(345, 500), field(0, 100)].filter(Boolean).join("/");
    requireCheck(
      !file.startsWith("/") && !file.split("/").includes(".."),
      "Unsafe archive member",
    );
    const sizeText = field(124, 136).trim();
    requireCheck(/^[0-7]+$/.test(sizeText), "Unsupported archive member size");
    const size = Number.parseInt(sizeText, 8);
    requireCheck(offset + 512 + size <= tar.length, "Truncated archive member");
    const type = field(156, 157);
    requireCheck(
      ["", "0", "5"].includes(type),
      `Unsupported archive member type ${type}; inspect explicitly before updating evidence`,
    );
    if (type !== "5") {
      requireCheck(!files.has(file), "Duplicate archive file path");
      files.set(file, tar.subarray(offset + 512, offset + 512 + size));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
export async function bundledEvidence(root, lock, refresh = false) {
  const parentPath = "node_modules/@tailwindcss/oxide-wasm32-wasi";
  const parent = lock.packages[parentPath];
  requireCheck(
    parent?.integrity && parent.resolved,
    "Expected WASM bundle is absent; update the bundled-inventory strategy for this lockfile",
  );
  const evidencePath = resolve(root, "sbom/bundled-package-evidence.json");
  if (refresh) {
    const response = await fetch(parent.resolved, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    requireCheck(response.ok, `Bundle download returned ${response.status}`);
    requireCheck(
      Number(response.headers.get("content-length") || 0) <= 32 * 1024 * 1024,
      "Bundle download exceeds inspection limit",
    );
    const archive = Buffer.from(await response.arrayBuffer());
    requireCheck(
      archive.length <= 32 * 1024 * 1024,
      "Bundle archive exceeds inspection limit",
    );
    const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    requireCheck(
      integrity === parent.integrity,
      "Published bundle does not match the lockfile integrity",
    );
    const files = regularTarFiles(archive);
    const packages = [];
    for (const [path, bytes] of files) {
      if (
        !path.startsWith("package/node_modules/") ||
        !path.endsWith("/package.json")
      )
        continue;
      const manifestText = bytes.toString("utf8");
      const manifest = JSON.parse(manifestText);
      if (!manifest.name || !manifest.version) continue; // e.g. tslib/modules/package.json is a module boundary, not a dependency.
      const prefix = path.slice(0, -"package.json".length);
      const contents = [...files]
        .filter(([file]) => file.startsWith(prefix))
        .map(([file, bytes]) => ({
          path: file.slice(prefix.length),
          sha256: sha256(bytes),
          bytes: bytes.length,
        }))
        .sort((a, b) => a.path.localeCompare(b.path, "en"));
      packages.push({
        archivePath: path,
        path: `${parentPath}/${path.slice("package/".length, -"/package.json".length)}`,
        name: manifest.name,
        version: manifest.version,
        license: manifest.license ?? null,
        manifestText,
        manifestSha256: sha256(bytes),
        fileInventory: contents,
        contentInventorySha256: sha256(JSON.stringify(contents)),
      });
    }
    requireCheck(packages.length > 0, "No bundled package manifests found");
    const evidence = {
      format: "boatscout-verified-bundle-evidence",
      version: 1,
      verifiedAt: new Date().toISOString(),
      verification:
        "Published tarball SHA-512 matched package-lock integrity before in-memory metadata inspection. No install, lifecycle script, or package code was executed.",
      parent: {
        path: parentPath,
        name: "@tailwindcss/oxide-wasm32-wasi",
        version: parent.version,
        url: parent.resolved,
        integrity: parent.integrity,
        archiveSha256: sha256(archive),
        archiveBytes: archive.length,
      },
      packages,
    };
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  }
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    throw new Error(
      "Verified bundle evidence is missing. Run npm run sbom -- --refresh-bundles to inspect the exact locked tarball.",
    );
  }
  requireCheck(
    evidence.parent?.integrity === parent.integrity &&
      evidence.parent?.version === parent.version &&
      evidence.parent?.url === parent.resolved,
    "Verified bundle evidence no longer matches the lockfile. Run with --refresh-bundles.",
  );
  for (const entry of evidence.packages) {
    requireCheck(
      sha256(entry.manifestText) === entry.manifestSha256,
      `Bundle manifest evidence changed: ${entry.path}`,
    );
    requireCheck(
      sha256(JSON.stringify(entry.fileInventory)) ===
        entry.contentInventorySha256,
      `Bundle file evidence changed: ${entry.path}`,
    );
    requireCheck(
      entry.fileInventory.some(
        (file) =>
          file.path === "package.json" && file.sha256 === entry.manifestSha256,
      ),
      "Manifest missing from bundled content inventory",
    );
    const manifest = JSON.parse(entry.manifestText);
    requireCheck(
      manifest.name === entry.name &&
        manifest.version === entry.version &&
        manifest.license === entry.license,
      "Bundle manifest metadata mismatch",
    );
  }
  for (const name of parent.bundleDependencies ?? [])
    requireCheck(
      evidence.packages.some((entry) => entry.name === name),
      `Declared bundled package ${name} has no verified exact version`,
    );
  return evidence;
}
