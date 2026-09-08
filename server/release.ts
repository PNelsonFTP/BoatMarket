import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  lstat,
  rename,
} from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { z } from "zod";
import { prepareSnapshot } from "../scripts/export-snapshot";
import { atomicJson } from "./refresh-report";
import { activateSnapshot, withPublicationLease } from "./publication";
const hash = (body: string | Buffer) =>
  createHash("sha256").update(body).digest("hex");
const releaseDirectory = () => process.env.RELEASE_DIR || "data/releases";
export type ReleasePayload = {
  version: 1;
  createdAt: string;
  snapshotHash: string;
  snapshotBytes: number;
  listings: number;
  sourceHash: string;
  sourceCommit: string | null;
  packageLockHash: string;
  sboms: { path: string; sha256: string }[];
  quality: {
    issues: string[];
    warnings: string[];
    contactListingIds: string[];
    observationRange: unknown;
  };
};
async function codeFiles(path: string): Promise<string[]> {
  const info = await lstat(path);
  if (info.isSymbolicLink())
    throw new Error("Release source cannot contain symlinks");
  if (!info.isDirectory()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const output: string[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isSymbolicLink())
      throw new Error("Release source cannot contain symlinks");
    if (e.isDirectory()) output.push(...(await codeFiles(join(path, e.name))));
    else if (e.isFile()) output.push(join(path, e.name));
  }
  return output;
}
export function canonicalReleasePaths(paths: string[]) {
  return paths.map((path) => path.replaceAll("\\", "/")).sort();
}
export async function releaseSourceHash(
  options: { read?: typeof readFile } = {},
) {
  const roots = [
    "app",
    "components",
    "lib",
    "server",
    "prisma",
    "scripts",
    "config",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "tsconfig.check.json",
    "Dockerfile",
    ".github",
    ".gitattributes",
    ".dockerignore",
    "compose.yaml",
    "postcss.config.mjs",
  ];
  const files = canonicalReleasePaths(
    (await Promise.all(roots.map(codeFiles)))
      .flat()
      .filter((p) => !p.endsWith(".tmp") && !p.endsWith(".db")),
  );
  const read = options.read || readFile;
  return hash(
    JSON.stringify(
      await Promise.all(files.map(async (p) => [p, hash(await read(p))])),
    ),
  );
}
async function sbomHashes() {
  const names = [
    "boatscout-production.cdx.json",
    "boatscout-full-required.cdx.json",
    "boatscout-all-platforms.cdx.json",
  ];
  const provenance = JSON.parse(await readFile("sbom/provenance.json", "utf8"));
  if (provenance.source.sha256 !== hash(await readFile("package-lock.json")))
    throw new Error(
      "SBOM provenance does not match package-lock.json; run npm run sbom first",
    );
  return Promise.all(
    names.map(async (name) => {
      const path = `sbom/${name}`,
        bytes = await readFile(path),
        bom = JSON.parse(bytes.toString());
      if (
        bom.bomFormat !== "CycloneDX" ||
        !Array.isArray(bom.components) ||
        !bom.components.length
      )
        throw new Error(`Invalid SBOM ${path}`);
      return { path, sha256: hash(bytes) };
    }),
  );
}
export function reviewSnapshotQuality(
  input: unknown,
  options: {
    maxBytes?: number;
    minimumRecords?: number;
    maximumAgeDays?: number;
    now?: number;
  } = {},
) {
  const raw = input as {
    listings?: unknown[];
    refresh?: { partial?: boolean };
  };
  if (!Array.isArray(raw?.listings))
    throw new Error("Snapshot must contain a listings array");
  const prepared = prepareSnapshot(raw.listings);
  const issues: string[] = [],
    warnings: string[] = [];
  const publicRecords = raw.listings as Record<string, unknown>[];
  for (const key of Object.keys(raw))
    if (
      ![
        "version",
        "generatedAt",
        "observationRange",
        "refresh",
        "listings",
      ].includes(key)
    )
      issues.push(`Private or unsupported snapshot field ${key}`);
  if (raw.refresh && typeof raw.refresh === "object")
    for (const key of Object.keys(raw.refresh))
      if (
        ![
          "runId",
          "status",
          "collectionStartedAt",
          "collectionCompletedAt",
          "partial",
        ].includes(key)
      )
        issues.push(`Private or unsupported refresh field ${key}`);
  const envelope = input as Record<string, unknown>;
  if (
    envelope.observationRange &&
    typeof envelope.observationRange === "object"
  )
    for (const key of Object.keys(envelope.observationRange))
      if (!["oldest", "newest"].includes(key))
        issues.push(`Private or unsupported observation-range field ${key}`);
  const metadata = z
    .object({
      version: z.literal(1).optional(),
      generatedAt: z.string().datetime().optional(),
      observationRange: z
        .object({
          oldest: z.string().datetime().nullable(),
          newest: z.string().datetime().nullable(),
        })
        .strict()
        .optional(),
      refresh: z
        .object({
          runId: z.string().max(120).optional(),
          status: z
            .enum(["success", "partial", "failed", "busy", "cancelled"])
            .optional(),
          collectionStartedAt: z.string().datetime().optional(),
          collectionCompletedAt: z.string().datetime().optional(),
          partial: z.boolean().optional(),
        })
        .strict()
        .optional(),
      listings: z.array(z.unknown()),
    })
    .strict()
    .safeParse(input);
  if (!metadata.success)
    issues.push(
      ...metadata.error.issues.map(
        (issue) =>
          `Unsupported snapshot metadata at ${issue.path.join(".") || "root"}`,
      ),
    );
  const checkProperties = (original: unknown, clean: unknown, path: string) => {
    if (Array.isArray(original)) {
      original.forEach((value, index) =>
        checkProperties(
          value,
          Array.isArray(clean) ? clean[index] : undefined,
          `${path}[${index}]`,
        ),
      );
      return;
    }
    if (original && typeof original === "object")
      for (const [key, value] of Object.entries(original)) {
        if (!clean || typeof clean !== "object" || !(key in clean))
          issues.push(`Private or unsupported property ${path}.${key}`);
        else
          checkProperties(
            value,
            (clean as Record<string, unknown>)[key],
            `${path}.${key}`,
          );
      }
  };
  const canonical = new Map(
    prepared.listings.map((listing) => [listing.id, listing]),
  );
  for (const listing of publicRecords) {
    if (listing.isSample === true) {
      issues.push(
        `Sample advertisement ${listing.id} is not eligible for a real-data release`,
      );
      continue;
    }
    const clean = canonical.get(String(listing.id));
    if (clean) checkProperties(listing, clean, `listing ${listing.id}`);
    if (clean)
      for (const key of Object.keys(listing))
        if (!(key in clean))
          issues.push(
            `Private field ${key} or unsupported listing property found in ${listing.id}`,
          );
  }
  for (const listing of publicRecords) {
    for (const key of [
      "rawPayload",
      "locationOverride",
      "routeEstimate",
      "sourceLocation",
      "notes",
      "workspace",
      "favorites",
    ])
      if (listing[key] != null)
        issues.push(`Private field ${key} found in ${listing.id}`);
  }
  for (const listing of publicRecords) {
    if (listing.specs && typeof listing.specs === "object")
      for (const key of Object.keys(listing.specs))
        if (
          /^(?:rawPayload|notes?|favorites?|savedSearches|password|token|api[-_]?key|authorization|credentials?|webhookUrl)$/i.test(
            key,
          )
        )
          issues.push(`Private specification ${key} found in ${listing.id}`);
    if (listing.fieldProvenance && typeof listing.fieldProvenance === "object")
      for (const history of Object.values(listing.fieldProvenance))
        if (
          Array.isArray(history) &&
          history.some((o) => o.method === "review" || o.evidence != null)
        )
          issues.push(`Private field review evidence found in ${listing.id}`);
  }
  const serialized = JSON.stringify(input),
    bytes = Buffer.byteLength(serialized);
  if (bytes > (options.maxBytes ?? 25 * 1024 * 1024))
    issues.push("Snapshot exceeds the reviewed size budget");
  if (prepared.listings.length < (options.minimumRecords ?? 1))
    issues.push("Snapshot has fewer records than the required minimum");
  if (raw.refresh?.partial)
    warnings.push("Snapshot came from an explicitly partial collection");
  const now = options.now ?? Date.now(),
    old = prepared.listings.filter(
      (l) =>
        now - Date.parse(l.lastSeenAt) >
        (options.maximumAgeDays ?? 14) * 86400000,
    );
  if (old.length)
    warnings.push(
      `${old.length} ads were last observed more than ${options.maximumAgeDays ?? 14} days ago`,
    );
  const contactListingIds = prepared.listings
    .filter((l) =>
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}/i.test(
        [l.description, l.title, ...Object.values(l.specs)].join(" "),
      ),
    )
    .map((l) => l.id);
  if (contactListingIds.length)
    warnings.push(
      `${contactListingIds.length} ads contain possible source-published contact details; review before publishing`,
    );
  for (const listing of prepared.listings) {
    for (const value of [
      listing.sourceUrl,
      ...listing.photos.filter((u) => /^https?:/.test(u)),
      ...Object.values(listing.fieldProvenance || {})
        .flat()
        .map((o) => o.sourceUrl),
    ]) {
      const url = new URL(value);
      if (url.username || url.password)
        issues.push(`URL credentials in ${listing.id}`);
      if (
        [...url.searchParams.keys()].some((key) =>
          /^(?:token|api_?key|password|access_token|authorization)$/i.test(key),
        )
      )
        issues.push(`Possible secret URL parameter in ${listing.id}`);
    }
  }
  return {
    issues: [...new Set(issues)],
    warnings,
    contactListingIds,
    observationRange: prepared.observationRange,
  };
}
export async function prepareRelease(snapshotPath = "public/snapshot.json") {
  const body = await readFile(snapshotPath, "utf8"),
    snapshot = JSON.parse(body),
    quality = reviewSnapshotQuality(snapshot);
  let previous: { listings?: unknown[] } | null = null;
  try {
    previous = JSON.parse(await readFile("public/snapshot.json", "utf8"));
  } catch {}
  if (
    previous?.listings?.length &&
    snapshot.listings.length < previous.listings.length * 0.75
  )
    quality.warnings.push(
      "Candidate has over 25% fewer ads than the current snapshot; verify collection coverage",
    );
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const payload: ReleasePayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    snapshotHash: hash(body),
    snapshotBytes: Buffer.byteLength(body),
    listings: snapshot.listings.length,
    sourceHash: await releaseSourceHash(),
    sourceCommit: commit.status === 0 ? commit.stdout.trim() : null,
    packageLockHash: hash(await readFile("package-lock.json")),
    sboms: await sbomHashes(),
    quality,
  };
  const reviewHash = hash(JSON.stringify(payload)),
    target = join(releaseDirectory(), reviewHash);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "snapshot.json"), body, {
    flag: "wx",
    mode: 0o600,
  });
  await atomicJson(join(target, "review.json"), payload);
  return {
    reviewHash,
    reviewPath: join(target, "review.json"),
    applyAllowed: quality.issues.length === 0,
    ...payload,
  };
}
async function loadRelease(reviewHash: string) {
  if (!/^[a-f0-9]{64}$/.test(reviewHash))
    throw new Error("Invalid release review hash");
  const payload = JSON.parse(
    await readFile(join(releaseDirectory(), reviewHash, "review.json"), "utf8"),
  ) as ReleasePayload;
  if (hash(JSON.stringify(payload)) !== reviewHash)
    throw new Error("Reviewed manifest changed");
  const body = await readFile(
    join(releaseDirectory(), reviewHash, "snapshot.json"),
    "utf8",
  );
  if (hash(body) !== payload.snapshotHash)
    throw new Error("Reviewed snapshot changed");
  return { payload, body };
}
export async function approveRelease(
  reviewHash: string,
  options: { privacyReviewed: boolean; acceptWarnings?: boolean; note: string },
) {
  if (!options.privacyReviewed || options.note.trim().length < 5)
    throw new Error("Record the privacy review and a meaningful review note");
  const { payload, body } = await loadRelease(reviewHash);
  if (payload.quality.issues.length)
    throw new Error("Release quality checks failed");
  if (payload.quality.warnings.length && !options.acceptWarnings)
    throw new Error(
      "Review source contact details and coverage warnings; explicit --accept-warnings is required",
    );
  if ((await releaseSourceHash()) !== payload.sourceHash)
    throw new Error("Source changed since review; prepare the release again");
  if (JSON.stringify(await sbomHashes()) !== JSON.stringify(payload.sboms))
    throw new Error("SBOM changed since review; prepare again");
  return withPublicationLease(async (lease) => {
    // Gate again under publication ownership; immutable review bytes remain the sole activation input.
    if (
      (await releaseSourceHash()) !== payload.sourceHash ||
      JSON.stringify(await sbomHashes()) !== JSON.stringify(payload.sboms)
    )
      throw new Error(
        "Release inputs changed while waiting for publication ownership; prepare again",
      );
    const approval = {
      reviewHash,
      reviewedAt: new Date().toISOString(),
      privacyReviewed: true,
      acceptedWarnings: !!options.acceptWarnings,
    };
    await atomicJson(join(releaseDirectory(), reviewHash, "approval.json"), {
      ...approval,
      note: options.note,
    });
    const generation = `snapshots/${payload.snapshotHash}.json`;
    // A failed activation may leave an unmatched manifest; verification refuses it. The active reader pointer stays coherent.
    await atomicJson("public/release-manifest.json", {
      ...payload,
      approval,
      generation,
    });
    const activation = await activateSnapshot(body, {
      listings: payload.listings,
      runId: `release-${reviewHash.slice(0, 24)}`,
      publicationLease: lease,
      signal: lease.signal,
    });
    const warnings: string[] = activation.auditError
      ? [activation.auditError]
      : [];
    const temporary = `public/snapshot.json.${randomUUID()}.tmp`;
    try {
      await lease.checkpoint();
      await writeFile(temporary, body);
      await lease.checkpoint();
      await rename(temporary, "public/snapshot.json");
    } catch (error) {
      warnings.push(
        `Reviewed generation committed but legacy alias update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return {
      reviewHash,
      activation,
      warnings,
      message:
        "Reviewed snapshot staged locally. GitHub Pages remains a separate, explicitly enabled manual deployment.",
    };
  });
}
export async function verifyRelease(
  reviewHash: string,
  options: { publicDirectory?: string; builtDirectory?: string } = {},
) {
  const publicDirectory = options.publicDirectory || "public";
  const manifest = JSON.parse(
    await readFile(join(publicDirectory, "release-manifest.json"), "utf8"),
  ) as ReleasePayload & {
    approval: {
      reviewHash: string;
      privacyReviewed: boolean;
      acceptedWarnings: boolean;
    };
    generation: string;
  };
  const { approval, generation, ...payload } = manifest;
  if (
    hash(JSON.stringify(payload)) !== reviewHash ||
    approval.reviewHash !== reviewHash ||
    !approval.privacyReviewed
  )
    throw new Error(
      "The release is not approved for the requested review hash",
    );
  if (
    payload.quality.issues.length ||
    (payload.quality.warnings.length && !approval.acceptedWarnings)
  )
    throw new Error("Unresolved release checks");
  if ((await releaseSourceHash()) !== payload.sourceHash)
    throw new Error("The release does not match the current source tree");
  if (JSON.stringify(await sbomHashes()) !== JSON.stringify(payload.sboms))
    throw new Error("The release does not match its SBOMs");
  if (!/^snapshots\/[a-f0-9]{64}\.json$/.test(generation))
    throw new Error("Invalid release generation path");
  const mode = JSON.parse(
    await readFile(join(publicDirectory, "data-mode.json"), "utf8"),
  );
  if (
    mode.snapshot !== true ||
    mode.path !== generation ||
    mode.sha256 !== payload.snapshotHash
  )
    throw new Error("Release pointer does not match reviewed generation");
  const body = await readFile(join(publicDirectory, generation), "utf8");
  if (hash(body) !== payload.snapshotHash)
    throw new Error("Snapshot integrity check failed");
  if (
    hash(await readFile(join(publicDirectory, "snapshot.json"))) !==
    payload.snapshotHash
  )
    throw new Error(
      "Legacy snapshot alias does not match the reviewed generation; stage the release again",
    );
  const quality = reviewSnapshotQuality(JSON.parse(body));
  if (quality.issues.length) throw new Error(quality.issues.join("; "));
  if (options.builtDirectory) {
    const built = resolve(options.builtDirectory);
    await verifyBuiltSnapshotFiles(built, {
      publicDirectory,
      generation,
      snapshotHash: payload.snapshotHash,
      activationId: mode.activationId,
    });
    const commit = spawnSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    });
    await atomicJson(join(built, "build-provenance.json"), {
      version: 1,
      builtAt: new Date().toISOString(),
      reviewHash,
      sourceHash: payload.sourceHash,
      snapshotHash: payload.snapshotHash,
      commit: commit.stdout.trim(),
      workflowRunId: process.env.GITHUB_RUN_ID || null,
      node: process.version,
      sboms: payload.sboms,
    });
  }
  return {
    status: "verified",
    reviewHash,
    snapshotHash: payload.snapshotHash,
    listings: payload.listings,
  };
}

export async function verifyBuiltSnapshotFiles(
  built: string,
  options: {
    publicDirectory: string;
    generation: string;
    snapshotHash: string;
    activationId: string;
  },
) {
  const { publicDirectory, generation, snapshotHash, activationId } = options;
  if (!/^snapshots\/[a-f0-9]{64}\.json$/.test(generation))
    throw new Error("Invalid release generation path");
  if (
    hash(await readFile(join(built, generation))) !== snapshotHash ||
    hash(await readFile(join(built, "release-manifest.json"))) !==
      hash(await readFile(join(publicDirectory, "release-manifest.json")))
  )
    throw new Error("Built output does not match the reviewed release");
  const builtMode = JSON.parse(
    await readFile(join(built, "data-mode.json"), "utf8"),
  );
  if (
    builtMode.snapshot !== true ||
    builtMode.path !== generation ||
    builtMode.sha256 !== snapshotHash ||
    builtMode.activationId !== activationId ||
    hash(await readFile(join(built, "snapshot.json"))) !== snapshotHash
  )
    throw new Error(
      "Built snapshot pointer or legacy alias does not match the reviewed release",
    );
}
