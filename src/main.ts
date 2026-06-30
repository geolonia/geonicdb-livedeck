/* ===================================================================
   GeonicDB live-deck — エントリポイント。
   各ライブデモ（slidechange リスナ）を先に登録してから、デッキを起動する。
   この順序により「全デモがリスナ登録済み → デッキ初回 render が slidechange を
   発火」という従来の挙動を再現する。

   CSS は index.html の <link> で読み込む（JS import にしないことで、dev リロード時の
   FOUC＝一瞬スタイル無しで表示される問題を防ぐ）。
   =================================================================== */
import { initAiNative } from "./demos/aiNative";
import { initTitleQr } from "./demos/titleQr";
import { initDual } from "./demos/dual";
import { initTemporal } from "./demos/temporal";
import { initSurvey } from "./demos/survey";
import { initMap } from "./demos/map";
import { initDeck } from "./deck/slides";

function boot(): void {
  // 1) 各デモが slidechange を購読（順不同で可）。
  initTitleQr();
  initAiNative();
  initDual();
  initTemporal();
  initSurvey();
  initMap();
  // 2) その後でデッキを起動 → 初回 render() が slidechange を発火する。
  initDeck();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
