import { expect, it } from "vitest";
import {
  reviewSnapshotQuality,
  verifyBuiltSnapshotFiles,
} from "../server/release";
import { listingSchema } from "../lib/types";
const listing = () =>
  listingSchema.parse({
    id: "one",
    source: "Dealer",
    sourceListingId: "one",
    sourceUrl: "https://dealer.example/boat",
    title: "Boat",
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  });
it("gates private fields and size while identifying published contact details for human review", () => {
  const quality = reviewSnapshotQuality(
    {
      listings: [
        { ...listing(), description: "Call 630-555-1234", notes: "private" },
      ],
    },
    { maxBytes: 20 },
  );
  expect(quality.issues.join(" ")).toMatch(/Private field notes/);
  expect(quality.issues.join(" ")).toMatch(/size budget/);
  expect(quality.contactListingIds).toEqual(["one"]);
});
it("reports observation age separately from generation and requires valid public URL credentials", () => {
  const quality = reviewSnapshotQuality({
    refresh: { partial: true },
    listings: [
      {
        ...listing(),
        lastSeenAt: "2020-01-01T00:00:00.000Z",
        sourceUrl: "https://dealer.example/boat?access_token=secret",
      },
    ],
  });
  expect(quality.issues.join(" ")).toMatch(/secret URL/);
  expect(quality.warnings.join(" ")).toMatch(/partial/);
  expect(quality.warnings.join(" ")).toMatch(/last observed/);
});
it("valid clean real inventory passes review without generating a deployment", () => {
  expect(reviewSnapshotQuality({ listings: [listing()] }).issues).toEqual([]);
});

it("rejects private envelope metadata, unknown listing properties, and mixed sample ads", () => {
  const quality = reviewSnapshotQuality({
    listings: [
      { ...listing(), privateSellerInstructions: "Never share this" },
      { ...listing(), id: "sample", isSample: true },
    ],
    workspace: { notes: "private" },
    refresh: { partial: false, privateToken: "secret" },
    observationRange: { oldest: null, newest: null, internalPath: "/private" },
  });
  expect(quality.issues.join(" ")).toMatch(/snapshot field workspace/);
  expect(quality.issues.join(" ")).toMatch(/privateSellerInstructions/);
  expect(quality.issues.join(" ")).toMatch(/Sample advertisement sample/);
  expect(quality.issues.join(" ")).toMatch(/refresh field privateToken/);
  expect(quality.issues.join(" ")).toMatch(
    /observation-range field internalPath/,
  );
});

it("rejects unknown nested provenance and engine properties from an unsanitized release body", () => {
  const quality = reviewSnapshotQuality({
    listings: [
      {
        ...listing(),
        fieldProvenance: {
          length: [
            {
              value: 20,
              source: "Dealer",
              sourceUrl: "https://dealer.example/boat",
              method: "source",
              observedAt: new Date().toISOString(),
              privateEvidence: "secret",
            },
          ],
        },
      },
    ],
  });
  expect(quality.issues.join(" ")).toMatch(/privateEvidence/);
});
it("verifies the actual built reader pointer rather than only a matching unused generation", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { createHash } = await import("node:crypto");
  const root = await mkdtemp(join(tmpdir(), "boatscout-built-review-"));
  const body = "reviewed public fixture",
    snapshotHash = createHash("sha256").update(body).digest("hex"),
    generation = `snapshots/${snapshotHash}.json`,
    activationId = "reviewed-activation";
  const options = {
    publicDirectory: join(root, "public"),
    generation,
    snapshotHash,
    activationId,
  };
  try {
    for (const directory of ["public", "built"]) {
      await mkdir(join(root, directory, "snapshots"), { recursive: true });
      await writeFile(join(root, directory, generation), body);
      await writeFile(join(root, directory, "snapshot.json"), body);
      await writeFile(
        join(root, directory, "release-manifest.json"),
        '{"review":"fixture"}',
      );
      await writeFile(
        join(root, directory, "data-mode.json"),
        JSON.stringify({
          snapshot: true,
          path: generation,
          sha256: snapshotHash,
          activationId,
        }),
      );
    }
    await verifyBuiltSnapshotFiles(join(root, "built"), options);
    await writeFile(
      join(root, "built/data-mode.json"),
      JSON.stringify({
        snapshot: false,
        path: generation,
        sha256: snapshotHash,
        activationId,
      }),
    );
    await expect(
      verifyBuiltSnapshotFiles(join(root, "built"), options),
    ).rejects.toThrow("Built snapshot pointer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
