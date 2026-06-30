/* ===================================================================
   GeonicDB live-deck — エントリポイント。
   各ライブデモ（slidechange リスナ）を先に登録してから、デッキを起動する。
   この順序により「全デモがリスナ登録済み → デッキ初回 render が slidechange を
   発火」という従来の挙動を再現する。
   =================================================================== */
import "./styles/styles.css";

import { initAiNative } from "./demos/aiNative";
import { initDual } from "./demos/dual";
import { initTemporal } from "./demos/temporal";
import { initSurvey } from "./demos/survey";
import { initMap } from "./demos/map";
import { initDeck } from "./deck/slides";

function boot(): void {
  // 1) 各デモが slidechange を購読（順不同で可）。
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
