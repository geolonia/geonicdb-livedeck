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
  /** デッキ全体で共用する単一 API キー（統合ポリシー geonicdb-livedeck-deck にバインド）。 */
  key: string;
  demos: {
    /** スライド: 標準API（NGSIv2 / NGSI-LD 二面取得） */
    dual: { ldId: string; v2Id: string };
    /** スライド: ジオクエリ（地図） */
    map: { type: string; center: [number, number]; zoom: number };
    /** スライド: ライブアンケート（WebSocket） */
    /** スライド: NGSI-LD フィードバック（カスタムデータモデル Feedback + WebSocket） */
    feedback: {
      /** カスタムデータモデルの型（サーバ側に custom-data-model 登録） */
      type: string;
      /** 会場の位置（GeoProperty 用の固定座標 [lng, lat]） */
      venue: { name: string; coordinates: [number, number] };
    };
    /** スライド: 避難所の混雑状況（地図 + Temporal API・自治体ユースケース） */
    shelter: {
      /** 避難所の型（EvacuationArea） */
      type: string;
      /** 高松市の避難所だけに絞るための市区町村コード */
      municipalityCode: string;
      /** 地図の初期表示 [lng, lat] / zoom */
      center: [number, number];
      zoom: number;
      /** 混雑度の時系列を取得する固定期間（相対期間だとデータが古くなるため固定） */
      from: string;
      to: string;
    };
    /** スライド: 共同編集 GIS（作図 + WebSocket・民間ユースケース） */
    collab: {
      /** 書き込む地物の型（プレフィックス付き） */
      type: string;
      /** 地図の初期表示 [lng, lat] / zoom */
      center: [number, number];
      zoom: number;
    };
    /** スライド: メッセージング + ReactiveCore Rules ログ（民間ユースケース） */
    messaging: {
      /** 投稿メッセージの型（プレフィックス付き） */
      messageType: string;
      /** Rules が自動生成するログの型（プレフィックス付き） */
      logType: string;
      /** メッセージ本文の最大文字数 */
      maxLen: number;
    };
  };
}

export const config: DeckConfig = {
  baseUrl: "https://geonicdb.geolonia.com",
  tenant: "miya",
  key: import.meta.env.VITE_GEONICDB_KEY ?? "",
  demos: {
    dual: { ldId: "urn:ngsi-ld:EnvironmentSensor:001", v2Id: "env-sensor-001" },
    map: { type: "AedLocation", center: [134.0475, 34.34], zoom: 11 },
    feedback: {
      type: "Feedback",
      venue: { name: "会場（高松）", coordinates: [134.0475, 34.34] },
    },
    shelter: {
      type: "EvacuationArea",
      municipalityCode: "372013",
      center: [134.045, 34.345],
      zoom: 12.6,
      from: "2026-06-26T00:00:00Z",
      to: "2026-06-27T00:00:00Z",
    },
    messaging: {
      messageType: "geonicdb-livedeck-Message",
      logType: "geonicdb-livedeck-MessageLog",
      maxLen: 100,
    },
    collab: {
      type: "geonicdb-livedeck-MapFeature",
      // 広島県尾道市周辺
      center: [133.2045, 34.409],
      zoom: 14,
    },
  },
};
