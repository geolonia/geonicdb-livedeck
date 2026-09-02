import { describe, expect, it } from "vitest";
import {
  AUTOPLAY_DEFAULT_SEC,
  autoplayLastIndex,
  computeScale,
  measureViewport,
  nextSlideIndex,
  parseAutoplaySeconds,
} from "../slides";

describe("computeScale", () => {
  it("16:9 の表示領域では縦横いっぱいに収まる", () => {
    expect(computeScale(1280, 720)).toBeCloseTo(1);
    expect(computeScale(2560, 1440)).toBeCloseTo(2);
  });

  it("横長の表示領域では高さ基準になる", () => {
    expect(computeScale(1920, 720)).toBeCloseTo(1);
  });

  it("縦長（ポートレート）の表示領域では幅基準になる", () => {
    expect(computeScale(640, 1200)).toBeCloseTo(0.5);
  });

  it("サイズが取れないときは 1 を返す（0 倍で消さない）", () => {
    expect(computeScale(0, 0)).toBe(1);
    expect(computeScale(NaN, 720)).toBe(1);
  });
});

describe("measureViewport", () => {
  it("ピンチズームで縮んだ window.innerWidth ではなくレイアウト実サイズを使う", () => {
    // 端末は 1024x768 のまま、ズームで visual viewport だけ 500x375 に縮んだ状態。
    const size = measureViewport({ clientWidth: 1024, clientHeight: 768 }, null, 500, 375);
    expect(size).toEqual({ w: 1024, h: 768 });
  });

  it("回転後の実サイズが取れれば、旧サイズの innerWidth/innerHeight に勝つ", () => {
    // 回転直後に window.inner* がポートレートのまま返るケース。
    const size = measureViewport({ clientWidth: 932, clientHeight: 430 }, null, 430, 932);
    expect(computeScale(size.w, size.h)).toBeCloseTo(430 / 720);
  });

  it("実サイズが 0 なら documentElement、それも 0 なら window へ退避する", () => {
    expect(measureViewport({ clientWidth: 0, clientHeight: 0 }, { clientWidth: 800, clientHeight: 600 }, 1, 1))
      .toEqual({ w: 800, h: 600 });
    expect(measureViewport(null, null, 800, 600)).toEqual({ w: 800, h: 600 });
  });
});

describe("autoplayLastIndex", () => {
  it("Appendix の区切りページの直前を終端にする", () => {
    // 本編 3 枚 → 区切り → Appendix 2 枚。終端は本編の最後（index 2）。
    expect(autoplayLastIndex(["title", "intro", "messaging", "appendix", "catalog", "glossary"])).toBe(2);
  });

  it("スラグで境界を決めるので、前にスライドを挿入しても追従する", () => {
    expect(autoplayLastIndex(["title", "new-slide", "intro", "messaging", "appendix", "catalog"])).toBe(3);
  });

  it("区切りが無ければ全スライドを対象にする", () => {
    expect(autoplayLastIndex(["title", "intro", "messaging"])).toBe(2);
  });

  it("スライドが無い・区切りが先頭でも 0 に倒す（負の終端を作らない）", () => {
    expect(autoplayLastIndex([])).toBe(0);
    expect(autoplayLastIndex(["appendix", "catalog"])).toBe(0);
  });

  it("data-slide が無いスライド（null）が混ざっても壊れない", () => {
    expect(autoplayLastIndex(["title", null, "messaging", "appendix"])).toBe(2);
  });
});

describe("nextSlideIndex", () => {
  it("次のスライドへ進む", () => {
    expect(nextSlideIndex(0, 4)).toBe(1);
    expect(nextSlideIndex(2, 4)).toBe(3);
  });

  it("ループ範囲の最終ページの次は先頭に戻る", () => {
    expect(nextSlideIndex(4, 4)).toBe(0);
    expect(nextSlideIndex(0, 0)).toBe(0);
  });

  it("Appendix 側（範囲の外）から再生したときも先頭へ戻す", () => {
    expect(nextSlideIndex(30, 22)).toBe(0);
  });

  it("番号が壊れているときは先頭に倒す", () => {
    expect(nextSlideIndex(NaN, 5)).toBe(0);
    expect(nextSlideIndex(3, NaN)).toBe(0);
    expect(nextSlideIndex(-1, 5)).toBe(0);
  });
});

describe("parseAutoplaySeconds", () => {
  it("パラメータが無ければ null（自動再生は開始しない）", () => {
    expect(parseAutoplaySeconds(null)).toBeNull();
  });

  it("値なし・非数値は既定秒", () => {
    expect(parseAutoplaySeconds("")).toBe(AUTOPLAY_DEFAULT_SEC);
    expect(parseAutoplaySeconds("fast")).toBe(AUTOPLAY_DEFAULT_SEC);
  });

  it("秒数を指定できる", () => {
    expect(parseAutoplaySeconds("3")).toBe(3);
    expect(parseAutoplaySeconds("2.5")).toBe(2.5);
  });

  it("0 や巨大値は 1〜600 秒にクランプする（暴走・実質停止を防ぐ）", () => {
    expect(parseAutoplaySeconds("0")).toBe(1);
    expect(parseAutoplaySeconds("-5")).toBe(1);
    expect(parseAutoplaySeconds("99999")).toBe(600);
  });
});
