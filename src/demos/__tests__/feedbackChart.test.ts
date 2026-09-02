import { describe, expect, it } from "vitest";
import { groupSmall, OTHER_KEY, PIE_COLORS, pieSegments, type PieItem } from "../feedbackChart";

function item(key: string, n: number): PieItem {
  return { key, label: key, color: PIE_COLORS[0], n };
}

describe("groupSmall", () => {
  it("returns an empty list when nothing has been answered", () => {
    // 集計対象がゼロ件（直近 1 週間に回答が無い / 全削除直後）でも例外にしない。
    expect(groupSmall([])).toEqual([]);
    expect(groupSmall([item("municipality", 0), item("sier", 0)])).toEqual([]);
  });

  it("keeps slices at or above 10% as-is", () => {
    const out = groupSmall([item("a", 5), item("b", 5)]);
    expect(out.map((o) => [o.key, o.n])).toEqual([
      ["a", 5],
      ["b", 5],
    ]);
  });

  it("folds slices below 10% into その他", () => {
    const out = groupSmall([item("a", 19), item("b", 1)]);
    expect(out.map((o) => [o.key, o.n])).toEqual([
      ["a", 19],
      [OTHER_KEY, 1],
    ]);
    expect(out[1].color).toBe(PIE_COLORS[PIE_COLORS.length - 1]);
  });

  it("caps the slice count at the reserved colors and folds the rest", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"].map((k) => item(k, 10));
    const out = groupSmall(many);
    expect(out).toHaveLength(PIE_COLORS.length);
    expect(out[out.length - 1].key).toBe(OTHER_KEY);
    expect(out.reduce((s, o) => s + o.n, 0)).toBe(70); // 丸めても総数は保たれる
  });

  it("never emits a negative その他 slice", () => {
    for (const items of [[item("a", 1)], [item("a", 3), item("b", 3), item("c", 4)]]) {
      expect(groupSmall(items).every((o) => o.n > 0)).toBe(true);
    }
  });
});

describe("pieSegments", () => {
  it("produces zero-width transparent segments when there are no answers", () => {
    // ゼロ件は 0 除算になりやすい箇所。NaN/Infinity が SVG 属性へ流れないことを固定する。
    const segs = pieSegments([], PIE_COLORS.length);
    expect(segs).toHaveLength(PIE_COLORS.length);
    expect(segs.every((s) => s.color === "transparent")).toBe(true);
    expect(segs.every((s) => s.frac === 0 && s.start === 0)).toBe(true);
    expect(segs.every((s) => Number.isFinite(s.frac) && Number.isFinite(s.start))).toBe(true);
  });

  it("keeps frac finite when every item is 0 件", () => {
    const segs = pieSegments([item("a", 0), item("b", 0)], 3);
    expect(segs.map((s) => s.frac)).toEqual([0, 0, 0]);
  });

  it("splits the ring by share and accumulates the start offsets", () => {
    const segs = pieSegments([item("a", 3), item("b", 1)], 3);
    expect(segs[0]).toMatchObject({ frac: 0.75, start: 0 });
    expect(segs[1]).toMatchObject({ frac: 0.25, start: 0.75 });
    expect(segs[2]).toMatchObject({ frac: 0, color: "transparent" });
  });

  it("always returns the fixed number of slices so the SVG circles can be reused", () => {
    expect(pieSegments([item("a", 1)], 6)).toHaveLength(6);
    expect(pieSegments([item("a", 1), item("b", 1)], 1)).toHaveLength(1);
  });
});
