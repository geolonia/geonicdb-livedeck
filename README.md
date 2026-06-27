# geonicdb-livedeck

GeonicDB の製品紹介スライドデッキ。HTML + CSS + JavaScript の全画面プレゼン（Google スライド風）で、**実際の GeonicDB（ステージング）に接続して動くインタラクティブなライブデモ**を内蔵しているのが特徴です。

## 起動

ビルド不要の静的サイトです。任意の静的サーバで配信できます。

```bash
python3 -m http.server 8745
# → http://localhost:8745 を開く
```

> ライブデモ用の API キーは **origin 制限**付きのため、`http://localhost:8745` または `https://geolonia.github.io` から開く必要があります（ポート 8745 固定）。

## 操作

- **→ / Space / PageDown**: 次へ　**← / PageUp**: 戻る　**Home / End**: 先頭・末尾
- **クリック**: 左 1/4 で戻る・それ以外で進む（フォーム/地図/ボタン上は除外）
- **F**: 全画面　**Esc**: 解除
- 編集後の確認は **Cmd+Shift+R（ハードリロード）**。参照する JS/CSS はキャッシュバスターを付けていないため、通常リロードだと古い版が残ることがあります。

## 構成（全 13 スライド）

1. タイトル / 2. Context Broker とは / 3. スマートシティ未来像（全画面イラスト）/ 4. 国際標準準拠 / 5. AI Native / 6. 品質・信頼性 / 7. Auth & Authz / 8. vs FIWARE Orion / **9. ジオクエリ（ライブ地図デモ）** / 10. ReactiveCore Rules / **11. ライブアンケート（WebSocket デモ）** / 12. ユースケース / 13. クロージング

## ライブデモ

いずれも `https://geonicdb.geolonia.com`（テナント `miya`）へ DPoP 認証で接続します。

### スライド 9 — 標準API（`dual.js`） / 10 — ジオクエリ（`aed-map.js`） / 11 — 時系列（`temporal.js`）
- いずれも読み取りのみ。`AedLocation` の地図表示＋ **NGSI-LD `georel=near` 検索**、同一エンティティの NGSIv2/NGSI-LD 二面取得、`WeatherObserved` の **Temporal API** 履歴など。
- 認可: ポリシー／キー **`geonicdb-livedeck-readonly`**（GET + WS のみ、DPoP 必須・origin 制限）を共用。

### スライド 13 — ライブアンケート（`survey.js`）
- 投票で `PollVote` エンティティを作成 → **WebSocket で全クライアントのバーチャートにリアルタイム集計**。
- 認可: ポリシー／キー **`geonicdb-livedeck-survey`**（GET|WS + `PollVote` への POST のみ、DPoP 必須・origin 制限）。
- カスタムデータモデル `PollVote`（`poll` 必須・`choice` は enum 制約）でサーバ側バリデーション。

## セットアップ（`geonic` CLI）

ライブデモが使う XACML ポリシー・API キー・デモ用データは [`geonic` CLI](https://github.com/geolonia/geonicdb-cli) で作成します。
前提: 対象テナント（例 `miya`）の `tenant_admin` として認証済み（`geonic auth login` → `geonic profile use <profile>`）。以下は `-s <tenant>` でテナントを明示する例です。

### 1. 読み取り専用ポリシー＋キー（スライド 9 / 10 / 11 で共用）

```bash
# policy: GET 読み取りのみ。さらに必要なエンティティタイプだけに限定
#   - クエリ GET（?type=…）→ entityType で許可（AedLocation / EnvironmentSensor / WeatherObserved）
#   - ID 指定 GET は entityType が認可に乗らないため、パスで個別に許可
cat > readonly-policy.json <<'JSON'
{
  "policyId": "geonicdb-livedeck-readonly",
  "description": "geonicdb-livedeck: readonly GET, limited to the demo entity types",
  "target": { "resources": [
    {"attributeId":"path","matchValue":"/ngsi-ld/**","matchFunction":"glob"},
    {"attributeId":"path","matchValue":"/v2/**","matchFunction":"glob"}
  ]},
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {"ruleId":"allow-by-type","effect":"Permit","target":{
      "resources":[{"attributeId":"entityType","matchValue":"^(AedLocation|EnvironmentSensor|WeatherObserved)$","matchFunction":"string-regexp"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"allow-by-path","effect":"Permit","target":{
      "resources":[
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/entities/*AedLocation*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/temporal/entities/*WeatherObserved*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/v2/entities/env-sensor-001","matchFunction":"glob"}
      ],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"deny-others","effect":"Deny"}
  ]
}
JSON
geonic -s miya me policies create @readonly-policy.json

# key（DPoP 必須・origin 制限）。出力された gdb_… を config.js の keys.readonly へ
geonic -s miya me api-keys create \
  --name geonicdb-livedeck-readonly \
  --policy geonicdb-livedeck-readonly \
  --origins "http://localhost:8745,https://geolonia.github.io" \
  --dpop-required
```

### 2. 投票用ポリシー＋キー（スライド 13）

```bash
# policy: 読み書きを PollVote に限定。WS 接続だけは仕様上「type なしの
# GET /v2/entities」許可が必要（WS ⊂ GET。接続ハンドシェイクの認可で評価される）
cat > survey-policy.json <<'JSON'
{
  "policyId": "geonicdb-livedeck-survey",
  "description": "geonicdb-livedeck: live-poll — WS + PollVote read/write",
  "target": { "resources": [
    {"attributeId":"path","matchValue":"/ngsi-ld/**","matchFunction":"glob"},
    {"attributeId":"path","matchValue":"/v2/**","matchFunction":"glob"}
  ]},
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {"ruleId":"allow-stream","effect":"Permit","target":{"actions":[
      {"attributeId":"method","matchValue":"WS"}]}},
    {"ruleId":"allow-ws-handshake","effect":"Permit","target":{
      "resources":[{"attributeId":"path","matchValue":"/v2/entities","matchFunction":"glob"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"allow-poll-read","effect":"Permit","target":{
      "resources":[{"attributeId":"entityType","matchValue":"PollVote"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"allow-vote","effect":"Permit","target":{
      "resources":[{"attributeId":"entityType","matchValue":"PollVote"}],
      "actions":[{"attributeId":"method","matchValue":"POST"}]}},
    {"ruleId":"deny-others","effect":"Deny"}
  ]
}
JSON
geonic -s miya me policies create @survey-policy.json

# key（出力された gdb_… を config.js の keys.survey へ）
geonic -s miya me api-keys create \
  --name geonicdb-livedeck-survey \
  --policy geonicdb-livedeck-survey \
  --origins "http://localhost:8745,https://geolonia.github.io" \
  --dpop-required
```

> ポリシーは個人ポリシーとして作成され、priority は 100・scope は personal に固定されます。
> 作成したキー値（`gdb_…`）は二度と表示されないため、その場で `config.js` に転記してください。

### 3. デモ用データ

```bash
# 投票エンティティのスキーマ（choice を enum 制約）
geonic -s miya custom-data-models create '{
  "type":"PollVote","domain":"Survey",
  "propertyDetails":{
    "poll":{"ngsiType":"Property","valueType":"string","required":true},
    "choice":{"ngsiType":"Property","valueType":"string","required":true,
      "validation":{"enum":["geoquery","realtime","reactivecore","standards"]}}
  }
}'

# 地図デモ用 AedLocation（NGSI-LD）
geonic -s miya entities create '{"id":"urn:ngsi-ld:AedLocation:1","type":"AedLocation","name":{"type":"Property","value":"…"},"location":{"type":"GeoProperty","value":{"type":"Point","coordinates":[134.045,34.341]}}}'

# 時系列デモ用 WeatherObserved（observedAt 付きの配列）
geonic -s miya temporal entities create @weather-temporal.json
```

> 標準APIデモの NGSIv2 側エンティティ（`env-sensor-001`）は NGSIv2 API（`POST /v2/entities`、ヘッダー `Fiware-Service: miya`）で作成します。GeonicDB は NGSIv2 と NGSI-LD のエンティティを別空間で保持するため、デモは各プロトコルに 1 件ずつ用意しています。

## ファイル

| ファイル | 役割 |
|---|---|
| `config.js` | **設定ファイル**（テナント名・API キー・各デモのエンティティタイプ/ID など。ここを書き換えれば全デモに反映） |
| `index.html` | デッキ本体（全スライドのマークアップ） |
| `styles.css` | テーマ・レイアウト・アニメーション |
| `slides.js` | スライドエンジン（ナビゲーション・背景同期・スケーリング） |
| `dual.js` | スライド 9 標準API（NGSIv2 / NGSI-LD 二面取得）デモ |
| `aed-map.js` | スライド 10 ジオクエリの地図デモ |
| `temporal.js` | スライド 11 時系列（Temporal API）デモ |
| `survey.js` | スライド 13 ライブアンケートの WebSocket デモ |
| `manifest.webmanifest` / `sw.js` | PWA（インストール対応・オフラインシェル） |
| `assets/` | ロゴ・イラスト SVG・地図スタイル・GeonicDB SDK（IIFE）・OGP/アイコン画像 |

## メモ

- 埋め込みの API キーは **DPoP 必須・origin 制限**の設計で、クライアントバンドルに含めてよい前提です（他 origin からの流用はサーバ側 origin 検証で防止）。
- デモのキー／ポリシー／カスタムデータモデルは `geonic` CLI で発行・管理しています。
