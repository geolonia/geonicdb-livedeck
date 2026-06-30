# CLAUDE.md — geonicdb-livedeck

GeonicDB の製品紹介ライブデッキ（Vite + TypeScript）。`https://geonicdb.geolonia.com`（テナント `miya`、ステージング）へ DPoP 認証で接続するライブデモを含む。

## GeonicDB サーバー側リソースの命名規約（必須）

このデッキ用に GeonicDB に作成するリソースは、**すべて `geonicdb-livedeck-` プレフィックス**を付ける。他用途のリソースと明確に分離するため。API キー・XACML ポリシー等が対象。

| リソース種別 | 命名規約 | 既存例 |
|---|---|---|
| API キー名 (`--name`) | `geonicdb-livedeck-<demo>` | `geonicdb-livedeck-readonly` / `geonicdb-livedeck-survey` / `geonicdb-livedeck-feedback` |
| XACML ポリシー (`policyId`) | `geonicdb-livedeck-<demo>`（対応するキーと同名） | 同上 |
| カスタムデータモデル | NGSI-LD のエンティティ型名（`PollVote` / `Feedback` 等）。**型名はエンティティ本体に出るのでプレフィックスを付けず**、デッキ用と分かる型名にする | `PollVote` / `Feedback` |

- 新しいライブデモを追加するときも、必要な キー / ポリシー は必ず `geonicdb-livedeck-<demo>` で作る。
- キーはすべて **origin 制限**（`http://localhost:8745,https://geolonia.github.io`）＋ **DPoP 必須**。
- 発行手順（`geonic` CLI）は README.md「セットアップ」を参照。新デモを足したら README の発行手順も更新する。
- 環境変数は `VITE_GEONICDB_<DEMO>_KEY`（`.env` / CI シークレット）。非秘密値は `src/lib/config.ts`。

## デモの識別

スライド順序は `index.html` の `<section class="slide">` の並びで決まる。各ライブデモは
`.slide--dual` / `.slide--map` / `.slide--tmp` / `.slide--svy` / `.slide--fb` / `.slide--ai`
のクラスで自分のスライドを特定する（`slides.indexOf(...)`）。**スライドを挿入・並べ替えても番号は自動追従するので、ドキュメントでは極力ハードな番号参照を避ける。**

## 作業の進め方

- 親リポジトリ `geonicdb` の `CLAUDE.md` のワークツリー運用・ラベル規約に従う。
- 変更後は `npm run build`（`tsc --noEmit` + `vite build`）が通ることを確認してから push する。
- ライブデモの動作確認は `npm run dev`（`http://localhost:8745`、origin 制限のためポート固定）。
