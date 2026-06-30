/**
 * ライブデッキの設定。
 *
 * - 接続先・テナント・各デモが使うエンティティなどの「非秘密」値はここに直書きする。
 * - API キーだけは秘密情報なので Vite の環境変数（`.env` / CI シークレット）から注入する。
 *   いずれも origin 制限付きで、クライアント同梱を前提に設計されたキー。
 */
export interface DeckConfig {
  /** 接続先 GeonicDB（ステージング） */
  baseUrl: string;
  /** 対象テナント */
  tenant: string;
  keys: {
    /** 読み取り専用（GET + WS）。地図 / 標準API / 時系列デモで共用 */
    readonly: string;
    /** 投票用（GET|WS ＋ PollVote への POST）。ライブアンケートで使用 */
    survey: string;
    /** フィードバック用（GET|WS ＋ Feedback への POST）。NGSI-LD デモで使用 */
    feedback: string;
  };
  demos: {
    /** スライド: 標準API（NGSIv2 / NGSI-LD 二面取得） */
    dual: { ldId: string; v2Id: string };
    /** スライド: ジオクエリ（地図） */
    map: { type: string; center: [number, number]; zoom: number };
    /** スライド: 時系列（Temporal API） */
    temporal: { entityId: string; from: string; to: string };
    /** スライド: ライブアンケート（WebSocket） */
    survey: { type: string; poll: string };
    /** スライド: NGSI-LD フィードバック（カスタムデータモデル Feedback + WebSocket） */
    feedback: {
      /** カスタムデータモデルの型（サーバ側に custom-data-model 登録） */
      type: string;
      /** 会場の位置（GeoProperty 用の固定座標 [lng, lat]） */
      venue: { name: string; coordinates: [number, number] };
    };
  };
}

export const config: DeckConfig = {
  baseUrl: "https://geonicdb.geolonia.com",
  tenant: "miya",
  keys: {
    readonly: import.meta.env.VITE_GEONICDB_READONLY_KEY ?? "",
    survey: import.meta.env.VITE_GEONICDB_SURVEY_KEY ?? "",
    feedback: import.meta.env.VITE_GEONICDB_FEEDBACK_KEY ?? "",
  },
  demos: {
    dual: { ldId: "urn:ngsi-ld:AedLocation:1", v2Id: "env-sensor-001" },
    map: { type: "AedLocation", center: [134.0475, 34.34], zoom: 11 },
    temporal: {
      entityId: "urn:ngsi-ld:WeatherObserved:takamatsu-1",
      from: "2026-06-26T00:00:00Z",
      to: "2026-06-27T00:30:00Z",
    },
    survey: { type: "PollVote", poll: "features-2026" },
    feedback: {
      type: "Feedback",
      venue: { name: "会場（高松）", coordinates: [134.0475, 34.34] },
    },
  },
};
