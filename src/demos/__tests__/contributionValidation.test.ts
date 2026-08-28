import { describe, expect, it } from "vitest";
import { validateContribution } from "../contributionValidation";

describe("validateContribution", () => {
  it("accepts a minimal valid input (hiddenSpot omitted)", () => {
    const result = validateContribution({ origin: "香川県", specialty: "讃岐うどん", hiddenSpot: "" });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("accepts a valid input with hiddenSpot filled in", () => {
    const result = validateContribution({
      origin: "France",
      specialty: "Fromage",
      hiddenSpot: "地元の人しか知らない小さな展望台",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects empty origin", () => {
    const result = validateContribution({ origin: "", specialty: "讃岐うどん", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.origin).toBeDefined();
  });

  it("rejects whitespace-only origin", () => {
    const result = validateContribution({ origin: "   ", specialty: "讃岐うどん", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.origin).toBeDefined();
  });

  it("rejects empty specialty", () => {
    const result = validateContribution({ origin: "香川県", specialty: "", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.specialty).toBeDefined();
  });

  it("does not require hiddenSpot (second stage is optional)", () => {
    const result = validateContribution({ origin: "香川県", specialty: "讃岐うどん", hiddenSpot: "   " });
    expect(result.ok).toBe(true);
    expect(result.errors.hiddenSpot).toBeUndefined();
  });

  it("rejects origin longer than the limit (municipality-level essays should not fit)", () => {
    const tooLong = "あ".repeat(41);
    const result = validateContribution({ origin: tooLong, specialty: "讃岐うどん", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.origin).toBeDefined();
  });

  it("accepts origin at exactly the limit", () => {
    const atLimit = "あ".repeat(40);
    const result = validateContribution({ origin: atLimit, specialty: "讃岐うどん", hiddenSpot: "" });
    expect(result.ok).toBe(true);
  });

  it("rejects specialty longer than the limit", () => {
    const tooLong = "a".repeat(61);
    const result = validateContribution({ origin: "香川県", specialty: tooLong, hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.specialty).toBeDefined();
  });

  it("rejects hiddenSpot longer than the limit", () => {
    const tooLong = "a".repeat(121);
    const result = validateContribution({ origin: "香川県", specialty: "讃岐うどん", hiddenSpot: tooLong });
    expect(result.ok).toBe(false);
    expect(result.errors.hiddenSpot).toBeDefined();
  });

  it("trims surrounding whitespace before checking emptiness", () => {
    const result = validateContribution({ origin: "  香川県  ", specialty: "  讃岐うどん  ", hiddenSpot: "" });
    expect(result.ok).toBe(true);
  });

  it("reports multiple errors at once", () => {
    const result = validateContribution({ origin: "", specialty: "", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.origin).toBeDefined();
    expect(result.errors.specialty).toBeDefined();
  });
});
