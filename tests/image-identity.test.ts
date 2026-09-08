import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  canonicalImageIdentity,
  hashDistance,
  imageEvidenceMatch,
  type AuditedImageEvidence,
} from "../lib/image-identity";
import { auditLocalImage } from "../server/image-evidence";
import { duplicateEvidence } from "../server/dedup";
import { makeSeed } from "../lib/seed";

describe("bounded image evidence", () => {
  it("joins only supported image resize shapes and preserves unknown image IDs/query/path case", () => {
    expect(
      canonicalImageIdentity(
        "https://images.craigslist.org/00v0v_iR0GVLKuJzS_0t20CI_600x450.jpg",
      ),
    ).toBe(
      canonicalImageIdentity(
        "https://images.craigslist.org/00v0v_iR0GVLKuJzS_0t20CI_1200x900.jpg",
      ),
    );
    const path =
      "/imglib/v1/640x480/imglib/assets/inventory/87/EE/87EE6044-85F4-4F7B-9164-88D36504AD0C.jpg";
    expect(canonicalImageIdentity(`https://cdn.dealerspike.com${path}`)).toBe(
      canonicalImageIdentity(
        `https://cdn.dealerspike.com${path.replace("640x480", "800x600").replace("assets/inventory", "Assets/Inventory")}`,
      ),
    );
    expect(
      canonicalImageIdentity("https://example.com/Boat.jpg?w=300"),
    ).not.toBe(canonicalImageIdentity("https://example.com/boat.jpg?w=600"));
    expect(
      canonicalImageIdentity(
        "https://images.craigslist.org.evil.test/x_600x450.jpg",
      ),
    ).toBe("https://images.craigslist.org.evil.test/x_600x450.jpg");
    expect(canonicalImageIdentity("javascript:alert(1)")).toBeNull();
    expect(
      canonicalImageIdentity("https://example.com/no-image.jpg"),
    ).toBeNull();
  });
  it("treats perceptual similarity as supporting evidence and retains HIN conflicts", () => {
    const a = {
      ...makeSeed()[0],
      id: "a",
      isSample: false,
      photos: ["https://example.com/a.jpg"],
      specs: { hin: "ABC12345A626" },
    };
    const b = {
      ...a,
      id: "b",
      photos: ["https://different.example/b.jpg"],
      specs: { hin: "ABC12346A626" },
    };
    const record: AuditedImageEvidence = {
      listingId: "a",
      url: a.photos[0],
      identity: a.photos[0],
      sha256: "a".repeat(64),
      dHash: "a1a1a1a1a1a1a1a1",
      width: 800,
      height: 600,
      usableHash: true,
      method: "sharp-dhash64-v1",
      observedAt: "2026-09-08T00:00:00.000Z",
      auditedAt: "2026-09-08T00:00:00.000Z",
      provenance: {
        suppliedBy: "Owner",
        permission: "Owner-supplied permitted image for local research",
        reference: "Local fixture",
      },
    };
    const second = {
      ...record,
      listingId: "b",
      url: b.photos[0],
      sha256: "b".repeat(64),
      dHash: "a1a1a1a1a1a1a1a0",
    };
    expect(hashDistance(record.dHash, second.dHash)).toBe(1);
    expect(imageEvidenceMatch(record, second)?.kind).toBe("similar-image");
    const evidence = duplicateEvidence(a, b, [record, second]);
    expect(evidence?.imageAudits).toHaveLength(1);
    expect(evidence?.automatic).toBe(false);
    expect(evidence?.conflicts).toContain("Different modern-format HINs");
    expect(
      imageEvidenceMatch({ ...record, usableHash: false }, second),
    ).toBeNull();
  });
  it("audits only explicitly supplied local raster bytes with provenance and rejects unrelated photo URLs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "boatscout-image-audit-"));
    try {
      const sharp = (await import("sharp")).default;
      const data = Buffer.from(
        Array.from({ length: 20 * 16 * 3 }, (_, i) => (i * 31) % 256),
      );
      const file = join(dir, "fixture.png");
      writeFileSync(
        file,
        await sharp(data, { raw: { width: 20, height: 16, channels: 3 } })
          .png()
          .toBuffer(),
      );
      const listing = {
        ...makeSeed()[0],
        id: "a",
        photos: ["https://example.com/a.png"],
      };
      const input = {
        listingId: "a",
        url: listing.photos[0],
        file,
        observedAt: "2026-09-08T00:00:00.000Z",
        provenance: {
          suppliedBy: "Test owner",
          permission: "Generated fixture owned by this test suite",
          reference: "Synthetic gradient fixture",
        },
      };
      const evidence = await auditLocalImage(input, listing);
      expect(evidence.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(evidence.dHash).toHaveLength(16);
      expect(evidence.width).toBe(20);
      await expect(
        auditLocalImage(
          { ...input, url: "https://example.com/other.png" },
          listing,
        ),
      ).rejects.toThrow("must belong");
      await expect(
        auditLocalImage(
          { ...input, provenance: { ...input.provenance, permission: "" } },
          listing,
        ),
      ).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
