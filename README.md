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
| `npm run build:pdf` | `dist/` を 1 スライド 1 ページの PDF（`dist/geonicdb-livedeck.pdf`）に書き出す。事前に `npm run build` が必要 |

> ライブデモ用の API キーは **origin 制限**付きのため、`http://localhost:8745` または `https://geolonia.github.io` から開く必要があります（ポート 8745 固定）。

### PDF 版

デッキ右下の「⇩」ボタン、またはトップページ（1 ページ目）の QR コード下の「⇩ PDFをダウンロード」ボタンから、全スライドを 1 枚 16:9 の PDF としてダウンロードできる。CI（`.github/workflows/deploy.yml`）が
`npm run build:pdf`（[Playwright](https://playwright.dev/) で各スライドをキャプチャし [pdf-lib](https://pdf-lib.js.org/) で結合）を
`npm run build` の直後に実行し、`dist/geonicdb-livedeck.pdf` として一緒にデプロイする。手動生成する場合はローカルでも
初回のみ `npx playwright install chromium` が要る。

ライブデモ（`data-live="true"` の 6 スライド）は、実データを焼き込まず「オンライン版でお試しください」という静的カードに
差し替えて出力する（WS 接続やデータのタイミング次第で見た目が揺れる・ビルドが不安定になるのを避けるための意図的な仕様）。
新しいライブデモを追加したら `scripts/build-pdf.mjs` の `LIVE_DEMO_LABELS` にもラベルを足すこと。

### 環境変数（`.env`）

デッキ全体で **1 つの統合 API キー**（統合ポリシー `geonicdb-livedeck-deck`）を共用します。

| 変数 | 用途 |
|---|---|
| `VITE_GEONICDB_KEY` | 全デモ共通の統合キー（統合ポリシー `geonicdb-livedeck-deck`。GET/POST/WS を型別に許可・origin 制限＋DPoP） |
| `VITE_GEONICDB_CONTRIBUTION_KEY` | 会場投稿(Contribution)専用キー。テナント `foss4g_2026`(ENTERPRISE契約)向け。上記の全デモ共通キーとは別物・別テナント |
| `VITE_GEOLONIA_API_KEY` | Geolonia Maps（任意。未設定なら `YOUR-API-KEY`） |

非秘密の設定（接続先・テナント・各デモのエンティティ）は `src/lib/config.ts` に直書きしています。

> [direnv](https://direnv.net/) 利用者は `.env` の代わりに `.envrc` に `export VITE_GEONICDB_KEY=…` を書いてもよい。
> `.worktrees/` 配下のワークツリーで作業する場合は、`source_env ../..` だけの `.envrc` を置けば親の環境変数を継承できる（いずれも gitignore 済み）。

本番デプロイ（GitHub Pages）ではキーを**リポジトリシークレット**からビルド時に注入します（`.github/workflows/deploy.yml`）。必要なシークレット:

| シークレット名 | 対応する env | 必須 |
|---|---|---|
| `GEONICDB_KEY` | `VITE_GEONICDB_KEY` | ✅（全デモ共通の統合キー） |
| `GEONICDB_CONTRIBUTION_KEY` | `VITE_GEONICDB_CONTRIBUTION_KEY` | ✅（会場投稿デモに必須。未設定でも全体ビルドは失敗しないが、Contribution だけ `AuthenticationError` で動かない） |
| `VITE_GEOLONIA_API_KEY` | `VITE_GEOLONIA_API_KEY` | 任意（未設定なら `YOUR-API-KEY` にフォールバック。`*.github.io` で動作） |

> いずれかの GeonicDB キーが未設定だと、そのデモが `AuthenticationError`（空キー）で動かない。新しいライブデモを足したら deploy.yml の env とこの表も更新すること。

### デプロイの仕組み

`main` への push（と `workflow_dispatch`）で `.github/workflows/deploy.yml` が
**ビルドから公開までを 1 本のワークフローで**行う（Pages のソース設定は **"GitHub Actions"**）。

1. `build` — Vite ビルド → `npm run build:pdf` で PDF 版を `dist/` に追加 → `actions/upload-pages-artifact` で `dist/` をアップロード
2. `deploy` — `actions/deploy-pages` で公開 → `.github/scripts/verify-pages-deploy.sh` で
   **ライブが今ビルドしたバンドル（`assets/index-<hash>.js`）を配信しているか**を検証

検証は**訪問者がそのまま叩く URL**（クエリなし）に対して行い、HTML だけでなく
**エントリ JS の実体まで取得**して初めて成功とする。エッジに古い HTML が残っている間は
リトライで待つ（既定 45 回 x 15 秒 ≒ 11 分。Pages の HTML は `max-age=600` のため）。
反映が正常なら 1〜2 回目で抜ける。

> かつては peaceiris で `gh-pages` ブランチへ push し、GitHub 標準の
> 「pages build and deployment」が別途公開する二重構成だった。公開側だけが失敗しても
> `deploy.yml` は緑のままで、**ライブが古いバンドルのまま固まる事故**が起きた（#42）。
> 現構成では公開の成否がこのワークフロー 1 本に集約され、反映のズレもステップ 2 で赤になる。

検証スクリプトはローカルでも実行できる:

```bash
PAGE_URL=https://geolonia.github.io/geonicdb-livedeck/ \
EXPECTED='assets/index-<hash>.js' ATTEMPTS=1 \
  ./.github/scripts/verify-pages-deploy.sh
```

> `EXPECTED` の値はクォートすること。`<hash>` を裸で書くと Bash がリダイレクトとして解釈する。

#### Pages の公開ソース設定（一度だけ必要）

この構成は Pages の Source が **"GitHub Actions"** であることが前提。旧 `gh-pages`
運用から移行する場合は一度だけ切り替えが要る（`actions/configure-pages` の
`enablement` は**サイトが未作成のときに作るだけ**で、既存サイトのソースは変えない）。

```bash
gh api -X PUT repos/geolonia/geonicdb-livedeck/pages -f build_type=workflow
```

切り替え忘れは `deploy.yml` の "Assert Pages source" ステップが理由付きで落とす。

## 操作

- **→ / Space / PageDown**: 次へ　**← / PageUp**: 戻る　**Home / End**: 先頭・末尾
- **F**: 全画面　**Esc**: 解除
- ページ移動は**矢印ボタンとキーボードのみ**（スライド本体クリック・スワイプでは移動しません）

## 構成

本編（タイトル → 会社紹介 → Context Broker → BaaS → エコシステム → NGSI-LD → ETSI 適合度 → コスト構造 → AI Native → マルチテナンシー → 各ライブデモ）と、**Appendix**（全機能カタログ・FIWARE Orion との比較・AI 連携・管理機能・信頼性・認証認可・セキュリティ・クエリパラメータ・用語集）＋クロージングで構成。スライド順序は `index.html` の `<section class="slide">` の並びで決まり、ライブデモは `.slide--dual` / `.slide--map` / `.slide--fb` / `.slide--ai` / `.slide--shelter` / `.slide--collab` / `.slide--msg` のクラスで識別する（番号がずれても各デモが自分のスライドを自動追従）。

## ライブデモ

いずれも `https://geonicdb.geolonia.com`（テナント `miya`）へ DPoP 認証で接続します。

### 標準API（`src/demos/dual.ts`） / ジオクエリ（`src/demos/map.ts`）
- いずれも読み取りのみ。`AedLocation` の地図表示＋ **NGSI-LD `georel=near` 検索**、**同じ内容の環境センサーを NGSIv2 と NGSI-LD の両形式で取得**（`env-sensor-001` / `urn:ngsi-ld:EnvironmentSensor:001`）してプロトコル差を対比。デモデータは特定地域を想起させない中立的な内容にしている。
- 認可: 統合キー **`geonicdb-livedeck-deck`**（GET + WS。origin 制限・DPoP 必須）。

### NGSI-LD フィードバック（`src/demos/feedback.ts`）
- フォーム送信でカスタムデータモデル `Feedback` の NGSI-LD エンティティを作成 → **WebSocket で受信し件数を集計**。送信前はデフォルトで最新の回答エンティティを表示。
- 右はタブ切替: 「NGSI-LD エンティティ」（注釈付き JSON）、「カスタムデータモデル」（`GET /custom-data-models/Feedback` の実データ）、「集計結果」（関心・所属・地域の 3 つの円グラフ。WebSocket でリアルタイム更新）。
- 各項目を NGSI-LD の構文要素にマッピング: 所属/期待度 → **Property**（`observedAt` メタデータ）、関心/地域 → **Relationship**（`urn:ngsi-ld:UseCase:*` / `urn:ngsi-ld:AdministrativeArea:*`）、会場位置 → **GeoProperty**。
- 認可: 統合キー **`geonicdb-livedeck-deck`**（GET|WS + `Feedback` への POST、`/custom-data-models/Feedback` の GET）。

### 避難所の混雑（`src/demos/shelter.ts`・自治体ユースケース）
- 高松市の指定避難所（`EvacuationArea`）を地図に表示し、**Temporal API** で固定期間（2026-06-26 の24時間）の受入状況を取得 → **混雑度で色分け**。タイムスライダー／再生で時間変化を再生、避難所クリックで受入率の推移をポップアップ表示。
- 認可: 統合キー **`geonicdb-livedeck-deck`**（`EvacuationArea` の GET / temporal GET）。
- データ: 位置・収容人数は高松市オープンデータ（CC BY 4.0）。混雑度は Temporal API のデモ用合成データ（実受入実績ではない旨を画面に明記）。詳細は「セットアップ §4」。
- カスタムデータモデル `Feedback`（`role`・`expectation`・`interestedIn`・`region`・`location`）でサーバ側バリデーション。

### 共同編集 GIS（`src/demos/collab.ts`・民間ユースケース）
- 地図に**ポイント／ライン／ポリゴン**を描くと、地物が NGSI-LD エンティティ（`type=geonicdb-livedeck-MapFeature`、`location` は GeoProperty）として作成され、**WebSocket で全クライアントの地図にリアルタイム反映**される（＝共同編集）。参加者ごとに色を割り当て。表示は**直近 24 時間**に作成された地物のみ。
- 認可: 統合キー **`geonicdb-livedeck-deck`**（`geonicdb-livedeck-MapFeature` の GET|POST ＋ WS）。
- 地図の初期表示は広島県尾道市周辺（`src/lib/config.ts` の `demos.collab`）。

### メッセージング + Rules ログ（`src/demos/messaging.ts`・民間ユースケース）
- 「ランダム投稿」で 名前＋メッセージ（100字まで）を NGSI-LD エンティティ（`type=geonicdb-livedeck-Message`）として作成 → **WebSocket で全員に配信**。登壇中のキーボード入力を避けるため、名前・本文はダミーから無作為に選ぶ。
- サーバ側の **ReactiveCore Rules**（`geonicdb-livedeck-message-log`）が作成を検知して **ログ（`type=geonicdb-livedeck-MessageLog`）を自動生成**。メッセージ / ログをタブで切替。
- 認可: 統合キー **`geonicdb-livedeck-deck`**（Message の GET|POST、MessageLog の GET、WS を統合ポリシーに含む）。

## セットアップ（`geonic` CLI）

ライブデモが使う XACML ポリシー・API キー・デモ用データは [`geonic` CLI](https://github.com/geolonia/geonicdb-cli) で作成します。
前提: 対象テナント（例 `miya`）の `tenant_admin` として認証済み（`geonic auth login` → `geonic profile use <profile>`）。以下は `-s <tenant>` でテナントを明示する例です。

### 0. 統合 API キー ＋ ポリシー（全デモ共通・最初に作る）

デッキ全体で **1 つのキー `geonicdb-livedeck-deck`** を使う（テナントの API キー上限対策）。ポリシー `geonicdb-livedeck-deck` に、各デモが必要とする型別 GET/POST・WS・パスをまとめて許可する。**新デモを足すときは新キーを作らず、この 1 ポリシーに権限を追記**する（`geonic me policies update geonicdb-livedeck-deck @patch.json`）。**デモを削除するときも同様に、このファイル（README）の該当箇所とあわせて、使わなくなった型・パスの許可をこのポリシーから外す**（`rules` は部分更新ではなく配列ごと差し替わるため、`@patch.json` には残す `rules` 全体を書く）。

このキーは公開バンドルに埋め込まれるため、**最小権限**を保つ（破壊系 `PUT`/`PATCH`/`DELETE` は一切許可しない・append-only）。読み取りも実使用分だけに絞る:
- `allow-read-types`（型別 GET）は**型別クエリで読む型のみ**列挙する。`EnvironmentSensor`（dual: by-id 取得）は型別 GET しないため含めず、`allow-get-paths` の個別パスだけで許可する。
- `allow-get-paths` の `/custom-data-models/**` は実際に読む `/custom-data-models/Feedback` に限定する。

```bash
# 統合ポリシー（全デモの型別 GET/POST + WS + 必要パスを 1 つに）
cat > deck-policy.json <<'JSON'
{
  "policyId": "geonicdb-livedeck-deck",
  "description": "geonicdb-livedeck: 全デモ統合キー用ポリシー（WS + 各デモの型別 GET/POST + 必要パス）",
  "target": { "resources": [
    {"attributeId":"path","matchValue":"/ngsi-ld/**","matchFunction":"glob"},
    {"attributeId":"path","matchValue":"/v2/**","matchFunction":"glob"},
    {"attributeId":"path","matchValue":"/custom-data-models/**","matchFunction":"glob"}
  ]},
  "ruleCombiningAlgorithm": "first-applicable",
  "rules": [
    {"ruleId":"allow-stream","effect":"Permit","target":{"actions":[{"attributeId":"method","matchValue":"WS"}]}},
    {"ruleId":"allow-read-types","effect":"Permit","target":{
      "resources":[{"attributeId":"entityType","matchValue":"^(AedLocation|EvacuationArea|Feedback|geonicdb-livedeck-MapFeature|geonicdb-livedeck-Message|geonicdb-livedeck-MessageLog)$","matchFunction":"string-regexp"}],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"allow-write-types","effect":"Permit","target":{
      "resources":[{"attributeId":"entityType","matchValue":"^(Feedback|geonicdb-livedeck-MapFeature|geonicdb-livedeck-Message)$","matchFunction":"string-regexp"}],
      "actions":[{"attributeId":"method","matchValue":"POST"}]}},
    {"ruleId":"allow-get-paths","effect":"Permit","target":{
      "resources":[
        {"attributeId":"path","matchValue":"/v2/entities","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/v2/entities/env-sensor-001","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/entities/*AedLocation*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/entities/*EnvironmentSensor*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/entities/*EvacuationArea*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/temporal/entities","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/ngsi-ld/v1/temporal/entities/*EvacuationArea*","matchFunction":"glob"},
        {"attributeId":"path","matchValue":"/custom-data-models/Feedback","matchFunction":"glob"}
      ],
      "actions":[{"attributeId":"method","matchValue":"GET"}]}},
    {"ruleId":"deny-others","effect":"Deny"}
  ]
}
JSON
geonic -s miya me policies create @deck-policy.json

# key（出力された gdb_… を .env の VITE_GEONICDB_KEY / CI シークレット GEONICDB_KEY へ）
geonic -s miya me api-keys create \
  --name geonicdb-livedeck-deck \
  --policy geonicdb-livedeck-deck \
  --origins "http://localhost:8745,https://geolonia.github.io" \
  --dpop-required
```

> 以下 §1〜§6 は各デモが必要とする **権限の内訳**（統合ポリシーに含める型・アクション）とデモ用データの作成手順。
> かつては per-demo にキーを分けていたが、API キー上限のため 1 キーに統合した（#37）。

### 1. 読み取り系の権限（標準API・ジオクエリ・避難所）

読み取り系デモに個別のポリシー・キーは作らない。§0 の統合ポリシーの以下のルールでカバーする:

- `allow-read-types` — 型別クエリ GET（`?type=…`）: `AedLocation` / `EvacuationArea`
- `allow-get-paths` — ID 指定・temporal・NGSIv2 の個別パス GET:
  - `/ngsi-ld/v1/entities/*EnvironmentSensor*`（標準API デモの by-id 取得）
  - `/ngsi-ld/v1/temporal/entities`（避難所デモの型指定一括取得）・`*EvacuationArea*`
  - `/v2/entities`・`/v2/entities/env-sensor-001`（NGSIv2 側）

> ID 指定 GET は entityType が認可に乗らないためパスで許可する。`EnvironmentSensor` は
> 型別クエリ GET をしないので `allow-read-types` には含めない（§0 の最小権限の方針）。

### 2. フィードバックの権限＋データモデル（NGSI-LD デモ）

権限は §0 の統合ポリシーでカバーする: WS（`allow-stream`）＋ `Feedback` の GET/POST（`allow-read-types` / `allow-write-types`）＋
「カスタムデータモデル」タブが読む `/custom-data-models/Feedback` の GET（`allow-get-paths`）。

```bash
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

### 3. デモ用データ

```bash
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
```

### 4. 避難所の混雑デモ用データ（自治体ユースケース・`slide--shelter`）

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

> このデモも統合キー（§0）で動く。必要な権限（`EvacuationArea` の GET と temporal GET）は
> 統合ポリシーの `allow-read-types` / `allow-get-paths` に含まれている（§1 参照）。
> AED マップと同じ高松市域のオープンデータなので、**出典・ライセンスを明示すれば地域名の使用は可**
> （AED デモと同じ扱い）。

### 5. 共同編集 GIS の権限（`slide--collab`）

地図に描いた地物（ポイント／ライン／ポリゴン）を `geonicdb-livedeck-MapFeature` として作成し、WebSocket で全員に配信する。
権限（WS ＋ `geonicdb-livedeck-MapFeature` の GET/POST）は §0 の統合ポリシーの
`allow-stream` / `allow-read-types` / `allow-write-types` に含まれている。個別ポリシー・キーは作らない。

> 地物は自由形状（GeoProperty に Point / LineString / Polygon）なのでカスタムデータモデルは使わない。
> 表示は**直近 24 時間**に作成された地物のみ（クライアント側で `drawnAt`／id 埋め込み時刻でフィルタ）。

### 6. メッセージング + Rules ログ（`slide--msg`）

`geonicdb-livedeck-Message` の作成を **ReactiveCore Rules** で検知し、`createEntity` アクションで
`geonicdb-livedeck-MessageLog` を自動生成する。

```bash
geonic -s miya rules create '{
  "ruleId": "geonicdb-livedeck-message-log",
  "name": "geonicdb-livedeck: メッセージ作成時にログを生成",
  "conditions": [
    {"type":"eventType","eventTypes":["create"]},
    {"type":"entityType","entityTypes":["geonicdb-livedeck-Message"]}
  ],
  "actions": [{
    "type":"createEntity",
    "entityId":"urn:ngsi-ld:geonicdb-livedeck-MessageLog:${entity.id}",
    "entityType":"geonicdb-livedeck-MessageLog",
    "attributes":{"action":"message.created","author":"${attribute.name.value}",
      "target":"${entity.id}","summary":"${attribute.name.value} さんがメッセージを投稿しました"}
  }]
}'
```

> 権限（`geonicdb-livedeck-Message` の GET|POST、`geonicdb-livedeck-MessageLog` の GET、WS）は
> §0 の統合ポリシー `geonicdb-livedeck-deck` に含める。クライアントは共通の `createClient()`（統合キー）で接続。
> メッセージ本文は 100 字まで（クライアント側で制限。登壇時はダミーからランダム投稿）。

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
| `src/demos/shelter.ts` | 避難所の混雑（地図 + Temporal API・自治体ユースケース）デモ |
| `src/demos/collab.ts` | 共同編集 GIS（作図 + WebSocket・民間ユースケース）デモ |
| `src/demos/messaging.ts` | メッセージング + ReactiveCore Rules ログ（民間ユースケース）デモ |
| `src/demos/feedback.ts` | NGSI-LD フィードバック（カスタムデータモデル + WS）デモ |
| `src/demos/aiNative.ts` | AI ネイティブ（スクリプト化アニメ・ライブ API なし） |
| `src/lib/client.ts` | GeonicDB SDK クライアントの生成を集約 |
| `src/lib/config.ts` | 型付き設定（非秘密値＋ env からのキー） |
| `src/lib/dom.ts` / `slidechange.ts` | 型安全な DOM ヘルパ・型付き slidechange イベント |
| `src/styles/styles.css` | テーマ・レイアウト・アニメーション |
| `public/` | `sw.js`・`manifest.webmanifest`・`assets/`（ロゴ・地図スタイル・スプライト・画像）。ビルドで `dist/` 直下へコピー |
| `vite.config.ts` / `tsconfig.json` / `.env.example` | ビルド・型・環境変数の設定 |
