/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** origin 制限付き readonly API キー（GET + WebSocket）。本番は CI で注入。 */
  readonly VITE_GEONICDB_READONLY_KEY?: string;
  /** PollVote 用 API キー（POST + GET/WS）。本番は CI で注入。 */
  readonly VITE_GEONICDB_SURVEY_KEY?: string;
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
