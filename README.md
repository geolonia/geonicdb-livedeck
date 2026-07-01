# geonicdb-livedeck

GeonicDB の製品紹介スライドデッキ。全画面プレゼン（Google スライド風）に、**実際の GeonicDB（ステージング）へ接続して動くインタラクティブなライブデモ**を内蔵。**TypeScript + Vite** で構成し、公式 SDK `@geolonia/geonicdb-sdk` の使い方が一目で追える「お手本アプリ」を兼ねています。

## 技術構成

- **Vite + TypeScript（strict）**。地図は Geolonia Maps（CDN）、データは公式 SDK（npm）。
- `src/main.ts` がエントリ。`src/deck/`（スライドエンジン）、`src/demos/`（各ライブデモ）、`src/lib/`（SDK クライアント・型付き設定・DOM/イベントの小物）。
- SDK 初期化は `src/lib/client.ts` の `createClient()` に集約。

## 起動

```bash
npm install        # 初回のみ
cp .env.example .env   # API キーを設定（下記）
npm run dev        # → http://localhost:8745
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（ポート **8745 固定**） |
| `npm run build` | 型チェック（`tsc --noEmit`）＋ 本番ビルド（`dist/`） |
| `npm run preview` | ビルド成果物の確認サーバー（8745） |
| `npm run typecheck` | 型チェックのみ |

> ライブデモ用の API キーは **origin 制限**付きのため、`http://localhost:8745` または `https://geolonia.github.io` から開く必要があります（ポート 8745 固定）。

### 環境変数（`.env`）

| 変数 | 用途 |
|---|---|
| `VITE_GEONICDB_READONLY_KEY` | 読み取り専用（地図・標準API・時系列デモ） |
| `VITE_GEONICDB_SURVEY_KEY` | ライブアンケートの投票（PollVote POST） |
| `VITE_GEONICDB_FEEDBACK_KEY` | NGSI-LD フィードバック（Feedback POST + WS） |
| `VITE_GEOLONIA_API_KEY` | Geolonia Maps（任意。未設定なら `YOUR-API-KEY`） |

非秘密の設定（接続先・テナント・各デモのエンティティ）は `src/lib/config.ts` に直書きしています。

本番デプロイ（GitHub Pages）ではキーを**リポジトリシークレット**からビルド時に注入します（`.github/workflows/deploy.yml`）。必要なシークレット:

| シークレット名 | 対応する env | 必須 |
|---|---|---|
| `GEONICDB_READONLY_KEY` | `VITE_GEONICDB_READONLY_KEY` | ✅（標準API/地図/時系列デモ） |
| `GEONICDB_SURVEY_KEY` | `VITE_GEONICDB_SURVEY_KEY` | ✅（ライブアンケート） |
| `GEONICDB_FEEDBACK_KEY` | `VITE_GEONICDB_FEEDBACK_KEY` | ✅（NGSI-LD フィードバック） |
| `VITE_GEOLONIA_API_KEY` | `VITE_GEOLONIA_API_KEY` | 任意（未設定なら `YOUR-API-KEY` にフォールバック。`*.github.io` で動作） |

> いずれかの GeonicDB キーが未設定だと、そのデモが `AuthenticationError`（空キー）で動かない。新しいライブデモを足したら deploy.yml の env とこの表も更新すること。

## 操作

- **→ / Space / PageDown**: 次へ　**← / PageUp**: 戻る　**Home / End**: 先頭・末尾
- **F**: 全画面　**Esc**: 解除
- ページ移動は**矢印ボタンとキーボードのみ**（スライド本体クリック・スワイプでは移動しません）

## 構成

本編（タイトル → Context Broker → 標準準拠 → AI Native → 競合比較 → 各ライブデモ → ユースケース）と、**Appendix**（全機能カタログ・管理機能・セキュリティ・信頼性・クエリパラメータ・用語集）＋クロージングで構成。スライド順序は `index.html` の `<section class="slide">` の並びで決まり、ライブデモは `.slide--dual` / `.slide--map` / `.slide--tmp` / `.slide--svy` / `.slide--ai` のクラスで識別する（番号がずれても各デモが自分のスライドを自動追従）。

## ライブデモ

いずれも `https://geonicdb.geolonia.com`（テナント `miya`）へ DPoP 認証で接続します。

### 標準API（`src/demos/dual.ts`） / ジオクエリ（`src/demos/map.ts`） / 時系列（`src/demos/temporal.ts`）
- いずれも読み取りのみ。`AedLocation` の地図表示＋ **NGSI-LD `georel=near` 検索**、**同じ内容の環境センサーを NGSIv2 と NGSI-LD の両形式で取得**（`env-sensor-001` / `urn:ngsi-ld:EnvironmentSensor:001`）してプロトコル差を対比、`WeatherObserved` の **Temporal API** 履歴など。デモデータは特定地域を想起させない中立的な内容にしている。
- 認可: ポリシー／キー **`geonicdb-livedeck-readonly`**（GET + WS のみ、DPoP 必須・origin 制限）を共用。

### ライブアンケート（`src/demos/survey.ts`）
- 投票で `PollVote` エンティティを作成 → **WebSocket で全クライアントのバーチャートにリアルタイム集計**。
- 認可: ポリシー／キー **`geonicdb-livedeck-survey`**（GET|WS + `PollVote` への POST のみ、DPoP 必須・origin 制限）。
- カスタムデータモデル `PollVote`（`poll` 必須・`choice` は enum 制約）でサーバ側バリデーション。

### NGSI-LD フィードバック（`src/demos/feedback.ts`）
- フォーム送信でカスタムデータモデル `Feedback` の NGSI-LD エンティティを作成 → **WebSocket で受信し件数を集計**。送信前はデフォルトで最新の回答エンティティを表示。
- 右はタブ切替: 「NGSI-LD エンティティ」（注釈付き JSON）と「カスタムデータモデル」（`GET /custom-data-models/Feedback` の実データ）。
- 各項目を NGSI-LD の構文要素にマッピング: 所属/期待度 → **Property**（`observedAt` メタデータ）、関心/地域 → **Relationship**（`urn:ngsi-ld:UseCase:*` / `urn:ngsi-ld:AdministrativeArea:*`）、会場位置 → **GeoProperty**。
- 認可: ポリシー／キー **`geonicdb-livedeck-feedback`**（GET|WS + `Feedback` への POST、`/custom-data-models/**` の GET、DPoP 必須・origin 制限）。
- カスタムデータモデル `Feedback`（`role`・`expectation`・`interestedIn`・`region`・`location`）でサーバ側バリデーション。

## セットアップ（`geonic` CLI）

ライブデモが使う XACML ポリシー・API キー・デモ用データは [`geonic` CLI](https://github.com/geolonia/geonicdb-cli) で作成します。
前提: 対象テナント（例 `miya`）の `tenant_admin` として認証済み（`geonic auth login` → `geonic profile use <profile>`）。以下は `-s <tenant>` でテナントを明示する例です。

### 1. 読み取り専用ポリシー＋キー（標準API・ジオクエリ・時系列デモで共用）

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
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/entities/*EnvironmentSensor*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/temporal/entities/*WeatherObserved*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/v2/entities/env-sensor-001","matchFunction":"glob"}
      ],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"deny-others","effect":"Deny"}
  ]
}
JSON
geonic -s miya me policies create @readonly-policy.json

# key（DPoP 必須・origin 制限）。出力された gdb_… を .env の VITE_GEONICDB_READONLY_KEY へ
geonic -s miya me api-keys create \
  --name geonicdb-livedeck-readonly \
  --policy geonicdb-livedeck-readonly \
  --origins "http://localhost:8745,https://geolonia.github.io" \
  --dpop-required
```

### 2. 投票用ポリシー＋キー（ライブアンケート）

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

# key（出力された gdb_… を .env の VITE_GEONICDB_SURVEY_KEY へ）
geonic -s miya me api-keys create \
  --name geonicdb-livedeck-survey \
  --policy geonicdb-livedeck-survey \
  --origins "http://localhost:8745,https://geolonia.github.io" \
  --dpop-required
```

> ポリシーは個人ポリシーとして作成され、priority は 100・scope は personal に固定されます。
> 作成したキー値（`gdb_…`）は二度と表示されないため、その場で `.env`（VITE_GEONICDB_*_KEY）に転記してください。

### 3. フィードバック用ポリシー＋キー＋データモデル（NGSI-LD デモ）

```bash
# policy: WS + Feedback の読み書き、加えてカスタムデータモデルの参照を許可
# （「カスタムデータモデル」タブが GET /custom-data-models/Feedback で実データを取得するため）
cat > feedback-policy.json <<'JSON'
{
  "policyId": "geonicdb-livedeck-feedback",
  "description": "geonicdb-livedeck: NGSI-LD feedback — WS + Feedback read/write + custom-data-model read",
  "target": { "resources": [
    {"attributeId":"path","matchValue":"/ngsi-ld/**","matchFunction":"glob"},
    {"attributeId":"path","matchValue":"/v2/**","matchFunction":"glob"},
    {"attributeId":"path","matchValue":"/custom-data-models/**","matchFunction":"glob"}
  ]},
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {"ruleId":"allow-stream","effect":"Permit","target":{"actions":[
      {"attributeId":"method","matchValue":"WS"}]}},
    {"ruleId":"allow-ws-handshake","effect":"Permit","target":{
      "resources":[{"attributeId":"path","matchValue":"/v2/entities","matchFunction":"glob"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"allow-feedback-read","effect":"Permit","target":{
      "resources":[{"attributeId":"entityType","matchValue":"Feedback"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"allow-feedback-write","effect":"Permit","target":{
      "resources":[{"attributeId":"entityType","matchValue":"Feedback"}],
      "actions":[{"attributeId":"method","matchValue":"POST"}]}},
    {"ruleId":"allow-cdm-read","effect":"Permit","target":{
      "resources":[{"attributeId":"path","matchValue":"/custom-data-models/**","matchFunction":"glob"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"deny-others","effect":"Deny"}
  ]
}
JSON
geonic -s miya me policies create @feedback-policy.json

# key（出力された gdb_… を .env の VITE_GEONICDB_FEEDBACK_KEY へ）
geonic -s miya me api-keys create \
  --name geonicdb-livedeck-feedback \
  --policy geonicdb-livedeck-feedback \
  --origins "http://localhost:8745,https://geolonia.github.io" \
  --dpop-required

# カスタムデータモデル Feedback（関心・地域は Relationship、位置は GeoProperty）
geonic -s miya custom-data-models create '{
  "type":"Feedback","domain":"Survey",
  "propertyDetails":{
    "role":{"ngsiType":"Property","valueType":"string","required":true},
    "expectation":{"ngsiType":"Property","valueType":"number","required":true},
    "interestedIn":{"ngsiType":"Relationship","required":true},
    "region":{"ngsiType":"Relationship","required":true},
    "location":{"ngsiType":"GeoProperty","required":true}
  }
}'
```

### 4. デモ用データ

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

# 標準APIデモ（dual）用: 同じ内容の環境センサーを NGSI-LD 側にも用意（NGSIv2 側は下記の注参照）
geonic -s miya entities create '{
  "@context":"https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "id":"urn:ngsi-ld:EnvironmentSensor:001","type":"EnvironmentSensor",
  "name":{"type":"Property","value":"サンプル環境センサー 001"},
  "temperature":{"type":"Property","value":24.3,"unitCode":"CEL"},
  "relativeHumidity":{"type":"Property","value":58},
  "co2":{"type":"Property","value":612},
  "location":{"type":"GeoProperty","value":{"type":"Point","coordinates":[139.767,35.681]}}
}'

# 地図デモ用 AedLocation（NGSI-LD）
geonic -s miya entities create '{"id":"urn:ngsi-ld:AedLocation:1","type":"AedLocation","name":{"type":"Property","value":"…"},"location":{"type":"GeoProperty","value":{"type":"Point","coordinates":[134.045,34.341]}}}'

# 時系列デモ用 WeatherObserved（observedAt 付きの配列）
geonic -s miya temporal entities create @weather-temporal.json
```

> 標準APIデモ（dual）は「同じデータを両プロトコルで見せる」ことでプロトコル差を強調する。GeonicDB は NGSIv2 と NGSI-LD を別空間で保持するため、同内容を 2 件用意する: NGSI-LD 側は上記 `urn:ngsi-ld:EnvironmentSensor:001`、NGSIv2 側 `env-sensor-001` は NGSIv2 API（`PUT /v2/entities/env-sensor-001/attrs`、ヘッダー `Fiware-Service: miya`）で同じ内容にする。
>
> デモデータは実在の顧客データと誤認させないよう、**特定の地域名を名前・URL・scope 等に含めない**中立的な内容にすること。

## ファイル構成

| パス | 役割 |
|---|---|
| `index.html` | デッキ本体（全スライドのマークアップ・大型インライン SVG） |
| `src/main.ts` | エントリ。各デモを登録 → デッキ起動 |
| `src/deck/slides.ts` | スライドエンジン（ナビゲーション・背景同期・スケーリング） |
| `src/demos/dual.ts` | 標準API（NGSIv2 / NGSI-LD 二面取得）デモ |
| `src/demos/map.ts` | ジオクエリの地図デモ（Geolonia Maps + near 検索） |
| `src/demos/temporal.ts` | 時系列（Temporal API）デモ |
| `src/demos/survey.ts` | ライブアンケートの WebSocket デモ |
| `src/demos/feedback.ts` | NGSI-LD フィードバック（カスタムデータモデル + WS）デモ |
| `src/demos/aiNative.ts` | AI ネイティブ（スクリプト化アニメ・ライブ API なし） |
| `src/lib/client.ts` | GeonicDB SDK クライアントの生成を集約 |
| `src/lib/config.ts` | 型付き設定（非秘密値＋ env からのキー） |
| `src/lib/dom.ts` / `slidechange.ts` | 型安全な DOM ヘルパ・型付き slidechange イベント |
| `src/styles/styles.css` | テーマ・レイアウト・アニメーション |
| `public/` | `sw.js`・`manifest.webmanifest`・`assets/`（ロゴ・地図スタイル・スプライト・画像）。ビルドで `dist/` 直下へコピー |
| `vite.config.ts` / `tsconfig.json` / `.env.example` | ビルド・型・環境変数の設定 |
