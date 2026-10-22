import { describe, expect, it } from "vitest";
import { normalizeListing } from "../server/adapters/normalize";
import { recordFieldProvenance } from "../lib/provenance";

const url = "https://dealer.example/inventory/boat-1";
const normalize = (raw: Record<string, unknown>) =>
  recordFieldProvenance(normalizeListing(raw, "Dealer", url));
describe("hull and engine make evidence", () => {
  it.each([
    ["2027 Vexus ADX 200 w/ 250hp Yamaha SHO!!", "Vexus", "Yamaha"],
    ["2022 Lund 1875 Impact with Mercury 150", "Lund", "Mercury"],
    ["2025 G3 Sportsman with Yamaha 115 SHO", "G3", "Yamaha"],
    ["2024 Tige21 with Indmar engine", "Tige", "Indmar"],
  ])("keeps %s under its supported hull make", (title, make, engine) => {
    const listing = normalize({ title, make, sourceListingId: "stable-id" });
    expect(listing.make).toBe(make);
    expect(listing.engines[0].make).toBe(engine);
    expect(listing.specs.engineMake).toBe(engine);
    expect(listing.fieldProvenance?.make).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: make,
          sourceUrl: url,
          observedAt: listing.lastSeenAt,
        }),
      ]),
    );
    expect(listing.fieldProvenance?.["engines.make"]?.[0].value).toBe(engine);
    expect(listing.specs.makeConflict).toBeUndefined();
  });
  it("infers the hull before a motor manufacturer without structured metadata", () => {
    const listing = normalize({
      title: "2027 Vexus ADX 200 w/ 250hp Yamaha SHO!!",
    });
    expect(listing.make).toBe("Vexus");
    expect(listing.engines[0].make).toBe("Yamaha");
    expect(listing.confidence.make).toBe(0.8);
  });
  it.each([
    "2021 Yamaha SX195",
    "2023 Yamaha 242 Limited S",
    "Yamaha WaveRunner FX",
    "Yamaha AR190 180hp",
  ])("preserves genuine Yamaha hulls/PWC: %s", (title) => {
    const listing = normalize({ title, make: "Yamaha" });
    expect(listing.make).toBe("Yamaha");
    expect(listing.specs.makeConflict).toBeUndefined();
  });
  it("separates explicit engine specification from Yamaha hull evidence", () => {
    const listing = normalize({
      title: "2021 Yamaha SX195",
      make: "Yamaha",
      specs: { engineDescription: "Yamaha 1.8L engine" },
    });
    expect(listing.make).toBe("Yamaha");
    expect(listing.engines[0].make).toBe("Yamaha");
  });
  it("keeps a credible structured hull make and records conflicting title evidence", () => {
    const listing = normalize({ title: "2020 Ranger 1850", make: "Lund" });
    expect(listing.make).toBe("Lund");
    expect(listing.specs.makeConflict).toBe(true);
    expect(listing.specs.makeUncertain).toBe(true);
    expect(listing.specs.makeWarning).toMatch(/Lund.*Ranger/);
    expect(listing.confidence.make).toBeLessThan(1);
    expect(listing.fieldProvenance?.make.map((entry) => entry.value)).toEqual([
      "Lund",
      "Ranger",
    ]);
  });
  it("flags motor-only structured make and leaves ambiguous hull titles unknown", () => {
    const corrected = normalize({
      title: "Lund 1875 Mercury 150",
      make: "Mercury",
    });
    expect(corrected.make).toBe("Lund");
    expect(corrected.specs.makeConflict).toBe(true);
    const ambiguous = normalize({
      title: "Lund or Ranger fishing boat",
      make: "unknown",
    });
    expect(ambiguous.make).toBeNull();
    expect(ambiguous.specs.makeUncertain).toBe(true);
    expect(ambiguous.specs.makeWarning).toMatch(/left unknown/);
    const motor = normalize({
      title: "2026 Yamaha 250hp outboard motor",
      make: "Yamaha",
    });
    expect(motor.make).toBeNull();
    expect(motor.engines[0].make).toBe("Yamaha");
  });
  it("does not treat an engine-brand phrase as a credible structured hull manufacturer", () => {
    expect(
      normalize({ title: "Vexus ADX 200", make: "Yamaha Outboards" }),
    ).toMatchObject({ make: "Vexus", engines: [{ make: "Yamaha" }] });
    expect(
      normalize({ title: "Fishing boat", make: "Mercury Marine" }),
    ).toMatchObject({ make: null, engines: [{ make: "Mercury" }] });
    expect(
      normalize({ title: "2023 Caravelle boat", make: "Caravelle" }).make,
    ).toBe("Caravelle");
  });
  it("flags multiple motor manufacturers without guessing which powers the hull", () => {
    const listing = normalize({
      title: "Lund 1875 with Yamaha 200 and Mercury kicker",
      make: "Lund",
    });
    expect(listing.make).toBe("Lund");
    expect(listing.engines).toEqual([]);
    expect(listing.specs.engineMakeWarning).toMatch(
      /More than one manufacturer/,
    );
    expect(listing.confidence["engines.make"]).toBe(0);
    const structured = normalize({
      title: "Lund 1875 with Yamaha 200",
      make: "Lund",
      specs: { engineDescription: "Mercury 150" },
    });
    expect(structured.engines[0].make).toBe("Mercury");
    expect(structured.specs.engineMakeWarning).toMatch(
      /confirm installed engines/,
    );
  });
  it("records uncertainty rather than pretending an unbranded title is identified", () => {
    const listing = normalize({
      title: "Aluminum fishing boat",
      make: "not specified",
    });
    expect(listing.make).toBeNull();
    expect(listing.confidence.make).toBe(0);
    expect(listing.specs.makeUncertain).toBe(true);
  });
  it("does not treat BassCat spelling variants as conflicting hull brands", () => {
    const listing = normalize({
      title: "2027 BassCat Lynx Yamaha 250 SHO",
      make: "Bass Cat",
    });
    expect(listing.make).toBe("Bass Cat");
    expect(listing.specs.makeConflict).toBeUndefined();
  });
  it("preserves advertisement identity when the inferred hull make changes", () => {
    const raw = {
      title: "2027 Vexus ADX 200 w/ 250hp Yamaha SHO!!",
      sourceListingId: "retained-identity",
      price: 65000,
    };
    const fromEvidence = normalize({ ...raw, make: "Vexus" });
    const inferred = normalize(raw);
    expect(inferred.id).toBe(fromEvidence.id);
    expect(inferred.sourceListingId).toBe(fromEvidence.sourceListingId);
    expect(inferred.price).toBe(fromEvidence.price);
    expect(fromEvidence.rawPayload).toMatchObject({ make: "Vexus" });
  });
  it("records make and engine evidence at the original capture time after a historical reparse", () => {
    const captureAt = "2026-09-12T12:03:52.968Z";
    const parsed = normalizeListing(
      { title: "2026 Vexus AVX with Yamaha 250 SHO", make: "Yamaha" },
      "Dealer",
      url,
    );
    expect(parsed.fieldProvenance).toBeUndefined();
    const reparsed = recordFieldProvenance(
      { ...parsed, firstSeenAt: captureAt, lastSeenAt: captureAt },
      null,
      { observedAt: captureAt, method: "source" },
    );
    expect(reparsed.make).toBe("Vexus");
    for (const entries of Object.values(reparsed.fieldProvenance || {}))
      expect(entries.every((entry) => entry.observedAt === captureAt)).toBe(
        true,
      );
    expect(
      reparsed.fieldProvenance?.make.map((entry) => entry.value),
    ).toContain("Yamaha");
    const reused = recordFieldProvenance(
      { ...parsed, lastSeenAt: new Date().toISOString() },
      reparsed,
      { observe: false },
    );
    expect(reused.fieldProvenance).toEqual(reparsed.fieldProvenance);
  });
  it("does not re-observe an engine make retained from an old detail page", () => {
    const oldAt = "2026-09-12T12:03:52.968Z";
    const parsed = normalizeListing(
      { title: "Vexus ADX 200 with Yamaha 250 SHO", make: "Vexus" },
      "Dealer",
      url,
    );
    const previous = recordFieldProvenance(parsed, null, {
      observedAt: oldAt,
      method: "detail",
    });
    const retained = recordFieldProvenance(
      {
        ...parsed,
        specs: {
          ...parsed.specs,
          retainedDetailFields: "make, engines",
          retainedDetailObservedAt: oldAt,
        },
      },
      previous,
      { observedAt: "2026-10-21T12:00:00.000Z", method: "source" },
    );
    expect(retained.fieldProvenance?.["engines.make"]).toEqual(
      previous.fieldProvenance?.["engines.make"],
    );
    expect(retained.fieldProvenance?.make).toEqual(
      previous.fieldProvenance?.make,
    );
  });
});
