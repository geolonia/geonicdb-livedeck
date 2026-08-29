import { describe, expect, it } from "vitest";
import { buildContributionEntity, CONTRIBUTION_MODEL } from "../contributionEntity";

const INPUT = { origin: "サンプル県", specialty: "サンプル名物", hiddenSpot: "" };

describe("buildContributionEntity", () => {
  it("builds an NGSI-LD entity with @context/id/type", () => {
    const entity = buildContributionEntity(INPUT, { seeded: false, submittedAt: "2026-08-28T10:00:00.000Z" });
    expect(entity["@context"]).toEqual(expect.any(String));
    expect(entity.type).toBe(CONTRIBUTION_MODEL.type);
    expect(typeof entity.id).toBe("string");
    expect(entity.id as string).toMatch(/^urn:ngsi-ld:Contribution:/);
  });

  it("encodes origin/specialty as NGSI-LD Property attributes", () => {
    const entity = buildContributionEntity(INPUT, { seeded: false, submittedAt: "2026-08-28T10:00:00.000Z" });
    expect(entity.origin).toEqual({ type: "Property", value: "サンプル県" });
    expect(entity.specialty).toEqual({ type: "Property", value: "サンプル名物" });
  });

  it("omits hiddenSpot entirely when blank (optional second-stage field)", () => {
    const entity = buildContributionEntity(INPUT, { seeded: false, submittedAt: "2026-08-28T10:00:00.000Z" });
    expect(entity.hiddenSpot).toBeUndefined();
    expect("hiddenSpot" in entity).toBe(false);
  });

  it("includes hiddenSpot as a Property when provided", () => {
    const entity = buildContributionEntity(
      { ...INPUT, hiddenSpot: "サンプル展望台" },
      { seeded: false, submittedAt: "2026-08-28T10:00:00.000Z" },
    );
    expect(entity.hiddenSpot).toEqual({ type: "Property", value: "サンプル展望台" });
  });

  it("marks seeded contributions distinctly from real submissions", () => {
    const seeded = buildContributionEntity(INPUT, { seeded: true, submittedAt: "2026-08-28T10:00:00.000Z" });
    const real = buildContributionEntity(INPUT, { seeded: false, submittedAt: "2026-08-28T10:00:00.000Z" });
    expect(seeded.seeded).toEqual({ type: "Property", value: true });
    expect(real.seeded).toEqual({ type: "Property", value: false });
  });

  it("records submittedAt as given (caller supplies the timestamp)", () => {
    const entity = buildContributionEntity(INPUT, { seeded: false, submittedAt: "2026-08-28T10:00:00.000Z" });
    expect(entity.submittedAt).toEqual({ type: "Property", value: "2026-08-28T10:00:00.000Z" });
  });

  it("generates a fresh id on every call (no collisions across submissions)", () => {
    const a = buildContributionEntity(INPUT, { seeded: false, submittedAt: "2026-08-28T10:00:00.000Z" });
    const b = buildContributionEntity(INPUT, { seeded: false, submittedAt: "2026-08-28T10:00:00.000Z" });
    expect(a.id).not.toBe(b.id);
  });

  it("trims whitespace from origin/specialty/hiddenSpot before encoding", () => {
    const entity = buildContributionEntity(
      { origin: "  サンプル県  ", specialty: "  サンプル名物  ", hiddenSpot: "  サンプル展望台  " },
      { seeded: false, submittedAt: "2026-08-28T10:00:00.000Z" },
    );
    expect(entity.origin).toEqual({ type: "Property", value: "サンプル県" });
    expect(entity.specialty).toEqual({ type: "Property", value: "サンプル名物" });
    expect(entity.hiddenSpot).toEqual({ type: "Property", value: "サンプル展望台" });
  });
});
