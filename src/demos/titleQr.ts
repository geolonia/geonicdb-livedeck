/**
 * 表紙の QR コード。
 * アクセスされた URL（ハッシュ＝スライド番号を除いたデッキのルート）から
 * 実行時に QR を生成するため、localhost でもデプロイ先でも常に「今開いている
 * デッキ自身」を指す。
 *
 * 例外: `window.__DECK_URL_OVERRIDE__` が設定されていればそちらを優先する。
 * PDF 書き出し（scripts/build-pdf.mjs）は preview サーバー
 * （http://localhost:8745）上でスクリーンショットを撮るため、これが無いと
 * QR コードが preview の URL を指してしまう。
 */
import QRCode from "qrcode";
import { byId } from "../lib/dom";

declare global {
  interface Window {
    __DECK_URL_OVERRIDE__?: string;
  }
}

/** デッキのルート URL（origin + pathname、末尾スラッシュ正規化・hash/search 除去）。 */
function deckUrl(): string {
  if (window.__DECK_URL_OVERRIDE__) return window.__DECK_URL_OVERRIDE__;
  const { origin, pathname } = window.location;
  // 末尾スラッシュ → そのまま。ファイル名（拡張子付き）→ ディレクトリへ落とす。
  // 拡張子なしパス（例 /livedeck）→ ディレクトリとみなし末尾スラッシュを補う。
  let path: string;
  if (pathname.endsWith("/")) path = pathname;
  else if (/\.[^/]+$/.test(pathname)) path = pathname.replace(/[^/]*$/, "");
  else path = pathname + "/";
  return origin + path;
}

/** 表示用の短い URL（プロトコルと末尾スラッシュを省く）。 */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function initTitleQr(): void {
  const card = byId<HTMLDivElement>("titleQr");
  const label = byId<HTMLSpanElement>("titleQrUrl");
  if (!card) return;

  const url = deckUrl();
  if (label) label.textContent = displayUrl(url);

  QRCode.toString(
    url,
    { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } },
    (err, svg) => {
      if (err || !svg) return;
      card.innerHTML = svg;
      const el = card.querySelector("svg");
      if (el) {
        el.removeAttribute("width");
        el.removeAttribute("height");
        el.classList.add("title__qr-img");
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", url);
      }
    },
  );
}
