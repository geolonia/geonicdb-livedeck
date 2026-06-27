/* =====================================================================
   GeonicDB live-deck — 設定ファイル
   ---------------------------------------------------------------------
   ライブデモが接続する GeonicDB と、各デモが使うエンティティをまとめて
   定義します。ここを書き換えれば全デモに反映されます。
   （index.html で各デモスクリプトより先に読み込まれます）

   ※ 地図の基盤（Geolonia Maps）の API キーだけは、仕組み上 index.html の
      <script src="https://cdn.geolonia.com/v1/embed?geolonia-api-key=..."> に
      記述します（現在はデモ用の "YOUR-API-KEY"）。
   ===================================================================== */
window.DECK_CONFIG = {
  // 接続先 GeonicDB（ステージング）と対象テナント
  baseUrl: "https://geonicdb.geolonia.com",
  tenant: "miya",

  // API キー（いずれも DPoP 必須・origin 制限付き。クライアント同梱前提の設計）
  keys: {
    // 読み取り専用（GET + WS）。地図 / 標準API / 時系列 の各デモで共用
    //   policy: presentation-aed-readonly
    readonly: "gdb_fc49b6790379e8d28bddb21801b597dcbb8a721e498ce30c8a94b1bea0faa9d4",
    // 投票用（GET|WS ＋ PollVote への POST のみ）。ライブアンケートで使用
    //   policy: presentation-survey
    survey: "gdb_a9d30ecf8ec3dfc402dd45549c5894588206150e72e6d83463763dc11b0903a8",
  },

  // 各ライブデモで使用するエンティティ
  demos: {
    // スライド9: 標準API（NGSIv2 / NGSI-LD 二面取得）
    dual: {
      ldId: "urn:ngsi-ld:AedLocation:1",  // NGSI-LD で取得するエンティティ
      v2Id: "env-sensor-001",             // NGSIv2 で取得するエンティティ
    },
    // スライド10: ジオクエリ（地図）
    map: {
      type: "AedLocation",         // 地図に表示するエンティティタイプ
      center: [134.0475, 34.34],   // 初期表示の中心 [lng, lat]（高松市あたり）
      zoom: 11,
    },
    // スライド11: 時系列（Temporal API）
    temporal: {
      entityId: "urn:ngsi-ld:WeatherObserved:takamatsu-1", // 履歴を表示するエンティティ
      from: "2026-06-26T00:00:00Z", // 取得期間 開始
      to: "2026-06-27T00:30:00Z",   // 取得期間 終了
    },
    // スライド13: ライブアンケート（WebSocket）
    survey: {
      type: "PollVote",        // 投票エンティティタイプ
      poll: "features-2026",   // この設問の poll 識別子（集計対象の絞り込み）
    },
  },
};
