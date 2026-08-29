import { describe, expect, it } from "vitest";
import { resolveOriginCoords } from "../lib/originGeo";

describe("resolveOriginCoords", () => {
  it("resolves a JIS 2-digit prefecture code", () => {
    // 34 = 広島県（会場）
    expect(resolveOriginCoords("34")).toEqual([132.4596, 34.3963]);
  });

  it("resolves a full Japanese prefecture name (with suffix)", () => {
    expect(resolveOriginCoords("広島県")).toEqual([132.4596, 34.3963]);
    expect(resolveOriginCoords("東京都")).toEqual([139.6917, 35.6895]);
    expect(resolveOriginCoords("北海道")).toEqual([141.3469, 43.0642]);
  });

  it("resolves a bare prefecture name without the 都道府県 suffix", () => {
    expect(resolveOriginCoords("広島")).toEqual([132.4596, 34.3963]);
  });

  it("resolves an English/romaji prefecture name case-insensitively", () => {
    expect(resolveOriginCoords("Hiroshima")).toEqual([132.4596, 34.3963]);
    expect(resolveOriginCoords("hiroshima")).toEqual([132.4596, 34.3963]);
  });

  it("resolves a known country name (Japanese or English)", () => {
    expect(resolveOriginCoords("フランス")).toEqual([2.2137, 46.2276]);
    expect(resolveOriginCoords("France")).toEqual([2.2137, 46.2276]);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(resolveOriginCoords("  広島県  ")).toEqual([132.4596, 34.3963]);
  });

  it("returns null for unknown or empty input rather than guessing", () => {
    expect(resolveOriginCoords("")).toBeNull();
    expect(resolveOriginCoords("存在しない場所123")).toBeNull();
    // @ts-expect-error - runtime guard for unexpected non-string input
    expect(resolveOriginCoords(undefined)).toBeNull();
  });
});
