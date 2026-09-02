import { describe, expect, it } from "vitest";
import { groupSlides, moveFocus, normalizeTitle, TOC_MAIN_LABEL, type SlideMeta } from "../toc";

function meta(slug: string, title: string, extra: Partial<SlideMeta> = {}): SlideMeta {
  return { slug, title, divider: false, live: false, ...extra };
}

describe("normalizeTitle", () => {
  it("改行・連続空白・全角空白を 1 つの空白に潰す", () => {
    expect(normalizeTitle("  自前運用の\n  コストと手間を\tなくした ")).toBe(
      "自前運用の コストと手間を なくした",
    );
    expect(normalizeTitle("都市 OS を、　フルマネージドで。")).toBe("都市 OS を、 フルマネージドで。");
  });

  it("空白だけなら空文字（呼び出し側でフォールバックできるように）", () => {
    expect(normalizeTitle(" \n ")).toBe("");
  });
});

describe("groupSlides", () => {
  const metas = [
    meta("title", "タイトル"),
    meta("ngsi-ld", "NGSI-LD"),
    meta("live-demo", "Live Demo", { divider: true }),
    meta("live-feedback", "フィードバック", { live: true }),
    meta("appendix", "Appendix", { divider: true }),
    meta("comparison", "競合比較"),
  ];

  it("区切りページごとに章立てし、最初の章は本編になる", () => {
    const groups = groupSlides(metas);
    expect(groups.map((g) => g.label)).toEqual([TOC_MAIN_LABEL, "Live Demo", "Appendix"]);
  });

  it("区切りページ自体も章の先頭項目として残る（区切りページへも飛べる）", () => {
    const groups = groupSlides(metas);
    expect(groups[1].items.map((i) => i.title)).toEqual(["Live Demo", "フィードバック"]);
  });

  it("全項目が DOM 順のスライド番号を保つ（取りこぼし・重複なし）", () => {
    const indexes = groupSlides(metas).flatMap((g) => g.items.map((i) => i.index));
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("ライブデモの印は項目に引き継がれる", () => {
    const live = groupSlides(metas).flatMap((g) => g.items.filter((i) => i.live));
    expect(live.map((i) => i.index)).toEqual([3]);
  });

  it("区切りが 1 つも無ければ全体が 1 章になる", () => {
    const groups = groupSlides([meta("a", "A"), meta("b", "B")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe(TOC_MAIN_LABEL);
  });

  it("先頭が区切りページのときは本編の空章を作らない", () => {
    const groups = groupSlides([meta("appendix", "Appendix", { divider: true }), meta("x", "X")]);
    expect(groups.map((g) => g.label)).toEqual(["Appendix"]);
    expect(groups[0].items).toHaveLength(2);
  });

  it("スライドが無ければ空", () => {
    expect(groupSlides([])).toEqual([]);
  });
});

describe("moveFocus", () => {
  it("左右は 1 つずつ、上下は列数分ジャンプする", () => {
    expect(moveFocus(0, 10, "ArrowRight", 3)).toBe(1);
    expect(moveFocus(5, 10, "ArrowLeft", 3)).toBe(4);
    expect(moveFocus(1, 10, "ArrowDown", 3)).toBe(4);
    expect(moveFocus(4, 10, "ArrowUp", 3)).toBe(1);
  });

  it("端では止まり、回り込まない（先頭で ← / 末尾で → は動かない）", () => {
    expect(moveFocus(0, 10, "ArrowLeft", 3)).toBe(0);
    expect(moveFocus(9, 10, "ArrowRight", 3)).toBe(9);
    expect(moveFocus(1, 10, "ArrowUp", 3)).toBe(0);
    expect(moveFocus(8, 10, "ArrowDown", 3)).toBe(9);
  });

  it("Home / End で一覧の先頭・末尾へ", () => {
    expect(moveFocus(5, 10, "Home", 3)).toBe(0);
    expect(moveFocus(5, 10, "End", 3)).toBe(9);
  });

  it("列数が取れなくても 1 列として動く（0 除算・停止を防ぐ）", () => {
    expect(moveFocus(3, 10, "ArrowDown", 0)).toBe(4);
    expect(moveFocus(3, 10, "ArrowUp", NaN)).toBe(2);
  });

  it("項目が無ければ -1（フォーカス先なし）", () => {
    expect(moveFocus(0, 0, "ArrowRight", 3)).toBe(-1);
  });
});
