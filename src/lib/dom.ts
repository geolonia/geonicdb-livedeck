/**
 * 型安全な DOM ヘルパ群（各デモで重複していた小物をここに集約）。
 */

/** id で要素を取得（型を指定可能）。見つからなければ null。 */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** セレクタで要素を取得（型を指定可能）。見つからなければ null。 */
export function qs<T extends Element = Element>(
  selector: string,
  root: ParentNode = document,
): T | null {
  return root.querySelector<T>(selector);
}

/** HTML エスケープ（`&` `<` `>` のみ。属性値ではなくテキスト埋め込み用）。 */
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>]/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string;
  });
}

/**
 * ブラウザがアイドルのときに処理を走らせる。
 * DPoP トークン交換や PoW のような重い同期処理を、スライド遷移アニメーションと
 * 干渉させないために使う。requestIdleCallback が無い環境では setTimeout で代替。
 */
export function whenIdle(fn: () => void): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(fn, { timeout: 800 });
  } else {
    setTimeout(fn, 600);
  }
}
