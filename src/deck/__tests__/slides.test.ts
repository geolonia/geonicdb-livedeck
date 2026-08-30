import { describe, expect, it } from "vitest";
import { computeScale, measureViewport } from "../slides";

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
