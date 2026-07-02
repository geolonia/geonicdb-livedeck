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
| `VITE_GEONICDB_MAPEDIT_KEY` | 共同編集 GIS（geonicdb-livedeck-MapFeature POST + GET + WS） |
| `VITE_GEOLONIA_API_KEY` | Geolonia Maps（任意。未設定なら `YOUR-API-KEY`） |

非秘密の設定（接続先・テナント・各デモのエンティティ）は `src/lib/config.ts` に直書きしています。

本番デプロイ（GitHub Pages）ではキーを**リポジトリシークレット**からビルド時に注入します（`.github/workflows/deploy.yml`）。必要なシークレット:

| シークレット名 | 対応する env | 必須 |
|---|---|---|
| `GEONICDB_READONLY_KEY` | `VITE_GEONICDB_READONLY_KEY` | ✅（標準API/地図/時系列デモ） |
| `GEONICDB_SURVEY_KEY` | `VITE_GEONICDB_SURVEY_KEY` | ✅（ライブアンケート） |
| `GEONICDB_FEEDBACK_KEY` | `VITE_GEONICDB_FEEDBACK_KEY` | ✅（NGSI-LD フィードバック） |
| `GEONICDB_MAPEDIT_KEY` | `VITE_GEONICDB_MAPEDIT_KEY` | ✅（共同編集 GIS） |
| `VITE_GEOLONIA_API_KEY` | `VITE_GEOLONIA_API_KEY` | 任意（未設定なら `YOUR-API-KEY` にフォールバック。`*.github.io` で動作） |

> いずれかの GeonicDB キーが未設定だと、そのデモが `AuthenticationError`（空キー）で動かない。新しいライブデモを足したら deploy.yml の env とこの表も更新すること。

## 操作

- **→ / Space / PageDown**: 次へ　**← / PageUp**: 戻る　**Home / End**: 先頭・末尾
- **F**: 全画面　**Esc**: 解除
- ページ移動は**矢印ボタンとキーボードのみ**（スライド本体クリック・スワイプでは移動しません）

## 構成

本編（タイトル → Context Broker → 標準準拠 → AI Native → 競合比較 → 各ライブデモ → ユースケース）と、**Appendix**（全機能カタログ・管理機能・セキュリティ・信頼性・クエリパラメータ・用語集）＋クロージングで構成。スライド順序は `index.html` の `<section class="slide">` の並びで決まり、ライブデモは `.slide--dual` / `.slide--map` / `.slide--tmp` / `.slide--svy` / `.slide--fb` / `.slide--ai` / `.slide--shelter` / `.slide--collab` のクラスで識別する（番号がずれても各デモが自分のスライドを自動追従）。

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

### 避難所の混雑（`src/demos/shelter.ts`・自治体ユースケース）
- 高松市の指定避難所（`EvacuationArea`）を地図に表示し、**Temporal API** で固定期間（2026-06-26 の24時間）の受入状況を取得 → **混雑度で色分け**。タイムスライダー／再生で時間変化を再生、避難所クリックで受入率の推移をポップアップ表示。
- 認可: 読み取り専用のため **`geonicdb-livedeck-readonly`** を共用（`EvacuationArea` の GET / temporal GET を §1 のポリシーに含む）。
- データ: 位置・収容人数は高松市オープンデータ（CC BY 4.0）。混雑度は Temporal API のデモ用合成データ（実受入実績ではない旨を画面に明記）。詳細は「セットアップ §5」。
- カスタムデータモデル `Feedback`（`role`・`expectation`・`interestedIn`・`region`・`location`）でサーバ側バリデーション。

### 共同編集 GIS（`src/demos/collab.ts`・民間ユースケース）
- 地図に**ポイント／ライン／ポリゴン**を描くと、地物が NGSI-LD エンティティ（`type=geonicdb-livedeck-MapFeature`、`location` は GeoProperty）として作成され、**WebSocket で全クライアントの地図にリアルタイム反映**される（＝共同編集）。参加者ごとに色を割り当て。表示は**直近1週間**に作成された地物のみ。
- 認可: ポリシー／キー **`geonicdb-livedeck-mapedit`**（`geonicdb-livedeck-MapFeature` の GET|POST ＋ WS、DPoP 必須・origin 制限）。
- 地図の初期表示は広島県尾道市周辺（`src/lib/config.ts` の `demos.collab`）。

## セットアップ（`geonic` CLI）

ライブデモが使う XACML ポリシー・API キー・デモ用データは [`geonic` CLI](https://github.com/geolonia/geonicdb-cli) で作成します。
前提: 対象テナント（例 `miya`）の `tenant_admin` として認証済み（`geonic auth login` → `geonic profile use <profile>`）。以下は `-s <tenant>` でテナントを明示する例です。

### 1. 読み取り専用ポリシー＋キー（標準API・ジオクエリ・時系列・避難所デモで共用）

```bash
# policy: GET 読み取りのみ。さらに必要なエンティティタイプだけに限定
#   - クエリ GET（?type=…）→ entityType で許可（AedLocation / EnvironmentSensor / WeatherObserved / EvacuationArea）
#   - ID 指定 GET は entityType が認可に乗らないため、パスで個別に許可
#   - 避難所デモは temporal を型指定で一括取得するため /ngsi-ld/v1/temporal/entities も許可
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
      "resources":[{"attributeId":"entityType","matchValue":"^(AedLocation|EnvironmentSensor|WeatherObserved|EvacuationArea)$","matchFunction":"string-regexp"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"allow-by-path","effect":"Permit","target":{
      "resources":[
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/entities/*AedLocation*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/entities/*EnvironmentSensor*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/entities/*EvacuationArea*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/temporal/entities","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/temporal/entities/*WeatherObserved*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/temporal/entities/*EvacuationArea*","matchFunction":"glob"},
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

### 5. 避難所の混雑デモ用データ（自治体ユースケース・`slide--shelter`）

避難所の**位置・収容人数**は高松市オープンデータ「指定緊急避難場所・指定避難所」
（<https://github.com/takamatsu-city/opendata> `data/evacuation_space`、CC BY 4.0）から
中心部の約 30 件を `EvacuationArea`（`municipalityCode: "372013"`）として投入。
**混雑度（`occupancy`）は Temporal API のデモ用合成データ**（固定期間 2026-06-26 の 24 時間・1 時間刻み。
相対期間だと古くなるため固定）で、実際の受入実績ではない。

```bash
# 通常エンティティ（位置・収容人数・出典/ライセンス）
geonic -s miya entities create @shelter-001.json
# 混雑度の時系列（occupancy を observedAt 付き配列で。固定期間 2026-06-26T00:00Z〜2026-06-27T00:00Z）
geonic -s miya temporal entities create @shelter-001-temporal.json
```

> このデモは既存の **readonly キー**を流用する。readonly ポリシー（`geonicdb-livedeck-readonly`）は
> §1 の JSON どおり `EvacuationArea` の GET と temporal GET（`/ngsi-ld/v1/temporal/entities` ほか）を含む。
> AED マップと同じ高松市域のオープンデータなので、**出典・ライセンスを明示すれば地域名の使用は可**
> （AED デモと同じ扱い）。

### 6. 共同編集 GIS のポリシー＋キー（`slide--collab`）

地図に描いた地物（ポイント／ライン／ポリゴン）を `geonicdb-livedeck-MapFeature` として作成し、WebSocket で全員に配信する。読み書き用の専用ポリシー＋キーを作る。

```bash
cat > mapedit-policy.json <<'JSON'
{
  "policyId": "geonicdb-livedeck-mapedit",
  "description": "geonicdb-livedeck: collaborative GIS — WS + geonicdb-livedeck-MapFeature read/write",
  "target": { "resources": [
    {"attributeId":"path","matchValue":"/ngsi-ld/**","matchFunction":"glob"},
    {"attributeId":"path","matchValue":"/v2/**","matchFunction":"glob"}
  ]},
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {"ruleId":"allow-stream","effect":"Permit","target":{"actions":[{"attributeId":"method","matchValue":"WS"}]}},
    {"ruleId":"allow-ws-handshake","effect":"Permit","target":{
      "resources":[{"attributeId":"path","matchValue":"/v2/entities","matchFunction":"glob"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"allow-read","effect":"Permit","target":{
      "resources":[{"attributeId":"entityType","matchValue":"geonicdb-livedeck-MapFeature"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"allow-write","effect":"Permit","target":{
      "resources":[{"attributeId":"entityType","matchValue":"geonicdb-livedeck-MapFeature"}],
      "actions":[{"attributeId":"method","matchValue":"POST"}]}},
    {"ruleId":"deny-others","effect":"Deny"}
  ]
}
JSON
geonic -s miya me policies create @mapedit-policy.json

# key（出力された gdb_… を .env の VITE_GEONICDB_MAPEDIT_KEY へ）
geonic -s miya me api-keys create \
  --name geonicdb-livedeck-mapedit \
  --policy geonicdb-livedeck-mapedit \
  --origins "http://localhost:8745,https://geolonia.github.io" \
  --dpop-required
```

> 地物は自由形状（GeoProperty に Point / LineString / Polygon）なのでカスタムデータモデルは使わない。
> 表示は**直近1週間**に作成された地物のみ（クライアント側で `drawnAt`／id 埋め込み時刻でフィルタ）。

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
| `src/demos/shelter.ts` | 避難所の混雑（地図 + Temporal API・自治体ユースケース）デモ |
| `src/demos/collab.ts` | 共同編集 GIS（作図 + WebSocket・民間ユースケース）デモ |
| `src/demos/survey.ts` | ライブアンケートの WebSocket デモ |
| `src/demos/feedback.ts` | NGSI-LD フィードバック（カスタムデータモデル + WS）デモ |
| `src/demos/aiNative.ts` | AI ネイティブ（スクリプト化アニメ・ライブ API なし） |
| `src/lib/client.ts` | GeonicDB SDK クライアントの生成を集約 |
| `src/lib/config.ts` | 型付き設定（非秘密値＋ env からのキー） |
| `src/lib/dom.ts` / `slidechange.ts` | 型安全な DOM ヘルパ・型付き slidechange イベント |
| `src/styles/styles.css` | テーマ・レイアウト・アニメーション |
| `public/` | `sw.js`・`manifest.webmanifest`・`assets/`（ロゴ・地図スタイル・スプライト・画像）。ビルドで `dist/` 直下へコピー |
| `vite.config.ts` / `tsconfig.json` / `.env.example` | ビルド・型・環境変数の設定 |
