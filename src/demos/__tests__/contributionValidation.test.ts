import { describe, expect, it } from "vitest";
import { validateContribution } from "../contributionValidation";

describe("validateContribution", () => {
  it("accepts a minimal valid input (hiddenSpot omitted)", () => {
    const result = validateContribution({ origin: "サンプル県", specialty: "サンプル名物", hiddenSpot: "" });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("accepts a valid input with hiddenSpot filled in", () => {
    const result = validateContribution({
      origin: "France",
      specialty: "Fromage",
      hiddenSpot: "サンプル展望台",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects empty origin", () => {
    const result = validateContribution({ origin: "", specialty: "サンプル名物", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.origin).toBeDefined();
  });

  it("rejects whitespace-only origin", () => {
    const result = validateContribution({ origin: "   ", specialty: "サンプル名物", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.origin).toBeDefined();
  });

  it("rejects empty specialty", () => {
    const result = validateContribution({ origin: "サンプル県", specialty: "", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.specialty).toBeDefined();
  });

  it("does not require hiddenSpot (second stage is optional)", () => {
    const result = validateContribution({ origin: "サンプル県", specialty: "サンプル名物", hiddenSpot: "   " });
    expect(result.ok).toBe(true);
    expect(result.errors.hiddenSpot).toBeUndefined();
  });

  it("rejects origin longer than the limit (751b contract: maxLength 100)", () => {
    const tooLong = "あ".repeat(101);
    const result = validateContribution({ origin: tooLong, specialty: "サンプル名物", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.origin).toBeDefined();
  });

  it("accepts origin at exactly the limit", () => {
    const atLimit = "あ".repeat(100);
    const result = validateContribution({ origin: atLimit, specialty: "サンプル名物", hiddenSpot: "" });
    expect(result.ok).toBe(true);
  });

  it("rejects specialty longer than the limit (751b contract: maxLength 100)", () => {
    const tooLong = "a".repeat(101);
    const result = validateContribution({ origin: "サンプル県", specialty: tooLong, hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.specialty).toBeDefined();
  });

  it("rejects hiddenSpot longer than the limit (751b contract: maxLength 200)", () => {
    const tooLong = "a".repeat(201);
    const result = validateContribution({ origin: "サンプル県", specialty: "サンプル名物", hiddenSpot: tooLong });
    expect(result.ok).toBe(false);
    expect(result.errors.hiddenSpot).toBeDefined();
  });

  it("trims surrounding whitespace before checking emptiness", () => {
    const result = validateContribution({ origin: "  サンプル県  ", specialty: "  サンプル名物  ", hiddenSpot: "" });
    expect(result.ok).toBe(true);
  });

  it("reports multiple errors at once", () => {
    const result = validateContribution({ origin: "", specialty: "", hiddenSpot: "" });
    expect(result.ok).toBe(false);
    expect(result.errors.origin).toBeDefined();
    expect(result.errors.specialty).toBeDefined();
  });
});
