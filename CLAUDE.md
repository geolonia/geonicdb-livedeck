# CLAUDE.md — geonicdb-livedeck

GeonicDB の製品紹介ライブデッキ（Vite + TypeScript）。`https://geonicdb.geolonia.com`（テナント `miya`、ステージング）へ DPoP 認証で接続するライブデモを含む。

## GeonicDB サーバー側リソースの命名規約（必須）

このデッキ用に GeonicDB に作成するリソースは、**すべて `geonicdb-livedeck-` プレフィックス**を付ける。他用途のリソースと明確に分離するため。API キー・XACML ポリシー等が対象。

| リソース種別 | 命名規約 | 既存例 |
|---|---|---|
| API キー名 (`--name`) | **デッキ全体で 1 つ**に統合 | `geonicdb-livedeck-deck` |
| XACML ポリシー (`policyId`) | **1 つ**に統合（全デモの権限をまとめる） | `geonicdb-livedeck-deck` |
| カスタムデータモデル | NGSI-LD のエンティティ型名（`Feedback` 等）。**型名はエンティティ本体に出るのでプレフィックスを付けず**、デッキ用と分かる型名にする | `Feedback` |
| デッキ専用の自由形状エンティティ型（例外） | カスタムデータモデルを持たず、共有テナントで他用途と明確に分離したい型は `geonicdb-livedeck-<Type>` を付けてよい | `geonicdb-livedeck-MapFeature`（共同編集 GIS） |

- **API キーはデッキ全体で 1 つに統合**（キー名／ポリシー `geonicdb-livedeck-deck`）。テナントの API キー上限対策。
  新しいライブデモを追加するときは**新キーを作らず**、必要な型・アクション（GET/POST/WS）を
  `geonicdb-livedeck-deck` ポリシーに追記する（`geonic me policies update`）。
- キーは **origin 制限**（`http://localhost:8745,https://geolonia.github.io`）＋ **DPoP 必須**。
- 発行手順（`geonic` CLI）は README.md「セットアップ」を参照。新デモを足したら README の権限追記手順も更新する。
- 環境変数は単一の `VITE_GEONICDB_KEY`（`.env` / CI シークレット `GEONICDB_KEY`）。非秘密値は `src/lib/config.ts`。

## デモの識別

スライド順序は `index.html` の `<section class="slide">` の並びで決まる。各ライブデモは
`.slide--dual` / `.slide--map` / `.slide--tmp` / `.slide--fb` / `.slide--ai` / `.slide--shelter` / `.slide--collab` / `.slide--msg`
のクラスで自分のスライドを特定する（`slides.indexOf(...)`）。**スライドを挿入・並べ替えても番号は自動追従するので、ドキュメントでは極力ハードな番号参照を避ける。**

## 作業の進め方

- 親リポジトリ `geonicdb` の `CLAUDE.md` のワークツリー運用・ラベル規約に従う。
- 変更後は `npm run build`（`tsc --noEmit` + `vite build`）が通ることを確認してから push する。
- ライブデモの動作確認は `npm run dev`（`http://localhost:8745`、origin 制限のためポート固定）。

## デモデータの原則

- **実在の顧客データと誤認させない**。エンティティの名前・id・URL・scope 等に**特定の地域名を含めない**（架空・中立的な内容にする）。
- NGSIv2 と NGSI-LD を対比する dual デモでは、**同じ内容のデータを両プロトコルで用意**し、差分が形式だけになるようにする（`env-sensor-001` ⇔ `urn:ngsi-ld:EnvironmentSensor:001`）。
