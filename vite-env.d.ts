/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** デッキ共通の統合 API キー（統合ポリシー geonicdb-livedeck-deck・origin 制限＋DPoP）。本番は CI で注入。 */
  readonly VITE_GEONICDB_KEY?: string;
  /** Geolonia Maps の API キー（index.html の CDN タグへ置換）。 */
  readonly VITE_GEOLONIA_API_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Geolonia Maps は CDN（embed）でグローバル `geolonia` として読み込む。
 * MapLibre GL 互換 API のうち、本デッキで使う最小サブセットだけを型宣言する
 * （CDN 版に厳密な型を引くとサンプルの見通しが悪くなるため、実用最小限）。
 */
interface GeoloniaNamespace {
  Map: new (options: Record<string, unknown>) => any;
  Popup: new (options?: Record<string, unknown>) => any;
  LngLatBounds: new () => any;
  GeolocateControl: new (options?: Record<string, unknown>) => any;
}

interface Window {
  geolonia?: GeoloniaNamespace;
  maplibregl?: GeoloniaNamespace;
}
