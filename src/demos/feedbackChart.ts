/* ===================================================================
   フィードバック集計（円グラフ）の純粋ロジック。

   `feedback.ts` の描画（DOM/SVG）から、割合の丸め込みとセグメント幾何の計算を
   切り出したもの。**回答ゼロ件でも例外を出さず・NaN を作らない**ことが要件なので、
   ここを単体テストで固定する（`__tests__/feedbackChart.test.ts`）。
   =================================================================== */

/** 円グラフの 1 スライス。 */
export interface PieItem {
  key: string;
  label: string;
  color: string;
  n: number;
}

/** スライスの色（最後の 1 色は「その他」用のグレーとして予約）。 */
export const PIE_COLORS = ["#fc6c00", "#39d6c6", "#fba40c", "#e8401e", "#c89bff", "#6b7a90"];

/** 「その他」に丸め込まれたスライスのキー。 */
export const OTHER_KEY = "__other";
/** この割合を下回るスライスは「その他」へ丸め込む。 */
export const OTHER_SHARE = 0.1;

/**
 * 全体の 10% 未満のスライスを「その他」（グレー）に集約する。
 * スライス数の上限（色数）を超えた分も同様に丸める。
 *
 * 合計 0 件（＝集計対象の回答がゼロ）のときは**空配列**を返す。呼び出し側は
 * 「まだ回答がありません」の空表示に切り替える。ここで 0 除算を作らないことが
 * ゼロ件時にエラーを出さない前提になっている。
 */
export function groupSmall(items: PieItem[]): PieItem[] {
  const t = items.reduce((s, it) => s + it.n, 0);
  if (t <= 0) return [];
  const major = items.filter((it) => it.n / t >= OTHER_SHARE);
  const shown = major.slice(0, PIE_COLORS.length - 1);
  const restN = t - shown.reduce((s, it) => s + it.n, 0);
  if (restN > 0)
    shown.push({
      key: OTHER_KEY,
      label: "その他",
      color: PIE_COLORS[PIE_COLORS.length - 1],
      n: restN,
    });
  return shown;
}

/** ドーナツの 1 セグメント（`stroke-dasharray` / `-dashoffset` にそのまま流せる値）。 */
export interface PieSegment {
  /** 線色。スライスが無い枠は "transparent"。 */
  color: string;
  /** このスライスの占める割合（0〜1）。合計 0 件なら 0。 */
  frac: number;
  /** 12 時起点で、このスライスが始まる累積割合（0〜1）。 */
  start: number;
}

/**
 * 固定数（`slices`）のセグメント幾何を計算する。
 *
 * `items` が `slices` に足りない枠は `color: "transparent"` / `frac: 0` で埋める
 * （SVG の circle を使い回して transition を効かせるため、常に同じ本数を返す）。
 * 合計 0 件でも `frac` は 0 に落ち、NaN／Infinity にはならない。
 */
export function pieSegments(items: PieItem[], slices: number): PieSegment[] {
  const total = items.reduce((s, it) => s + it.n, 0);
  const out: PieSegment[] = [];
  let acc = 0;
  for (let i = 0; i < slices; i++) {
    const it = items[i];
    const frac = it && total > 0 ? it.n / total : 0;
    out.push({ color: it ? it.color : "transparent", frac, start: acc });
    acc += frac;
  }
  return out;
}
