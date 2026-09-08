import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { atomicJson } from "./refresh-report";
export const evidenceDirectory = () =>
  process.env.EVIDENCE_ARCHIVE_DIR || "data/evidence";
export const contentHash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export async function archiveEvidence(
  url: string,
  body: string,
  observedAt: string,
  kind: "html" | "rendered" = "html",
) {
  const root = evidenceDirectory(),
    sha256 = contentHash(body);
  await mkdir(join(root, "objects"), { recursive: true, mode: 0o700 });
  await mkdir(join(root, "observations"), { recursive: true, mode: 0o700 });
  const objectPath = join(root, "objects", sha256 + ".html");
  try {
    await writeFile(objectPath, body, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  const record = {
    version: 1,
    url,
    observedAt,
    kind,
    sha256,
    bytes: Buffer.byteLength(body),
    objectPath,
  };
  const observationId = contentHash(
    JSON.stringify([url, observedAt, sha256, kind]),
  );
  const recordPath = join(root, "observations", observationId + ".json");
  try {
    await writeFile(recordPath, JSON.stringify(record, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  return { ...record, recordPath };
}
export async function archiveExistingCache(
  url: string,
  path: string,
  kind: "html" | "rendered" = "html",
) {
  try {
    const [body, info] = await Promise.all([
      readFile(path, "utf8"),
      stat(path),
    ]);
    return await archiveEvidence(url, body, info.mtime.toISOString(), kind);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
/** Local parser fixtures omit contact details and embedded credentials; review before committing. */
export function redactFixture(html: string) {
  return html
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "redacted@example.invalid",
    )
    .replace(
      /(?<!\d)(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}(?!\d)/g,
      "000-000-0000",
    )
    .replace(
      /((?:["']?)(?:api[_-]?key|password|access[_-]?token|authorization|client[_-]?secret)(?:["']?)\s*[:=]\s*["'])[^"']+/gi,
      "$1REDACTED",
    );
}
export async function writeRedactedFixture(
  body: string,
  target: string,
  provenance: unknown,
) {
  const destination = resolve(target);
  if (!/\.html?$/i.test(destination))
    throw new Error("Fixture target must be .html");
  const cleaned = redactFixture(body);
  await mkdir(resolve(destination, ".."), { recursive: true });
  await writeFile(destination, cleaned, { flag: "wx", mode: 0o600 });
  await atomicJson(destination + ".provenance.json", {
    version: 1,
    createdAt: new Date().toISOString(),
    sha256: contentHash(cleaned),
    provenance,
    redacted: true,
    reviewRequired: true,
  });
  return {
    target: destination,
    sha256: contentHash(cleaned),
    reviewRequired: true,
  };
}
