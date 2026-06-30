/**
 * 型付きの `slidechange` イベント。
 *
 * デッキ（slides.ts）がスライドを切り替えるたびに発火し、各ライブデモはこれを購読して
 * 「自分のスライドに入ったら起動 / 1 つ前で先読み」する。document 上の CustomEvent を
 * 薄くラップして detail の型を固定するだけで、仕組みは従来どおり。
 */
export interface SlideChangeDetail {
  /** 現在のスライド index（0 始まり） */
  index: number;
  /** 総スライド数 */
  total: number;
}

const EVENT = "slidechange";

/** スライド変更を発火（デッキ側が呼ぶ）。 */
export function emitSlideChange(detail: SlideChangeDetail): void {
  document.dispatchEvent(new CustomEvent<SlideChangeDetail>(EVENT, { detail }));
}

/** スライド変更を購読（各デモが呼ぶ）。 */
export function onSlideChange(handler: (detail: SlideChangeDetail) => void): void {
  document.addEventListener(EVENT, (e) => {
    const detail = (e as CustomEvent<SlideChangeDetail>).detail;
    if (detail) handler(detail);
  });
}
