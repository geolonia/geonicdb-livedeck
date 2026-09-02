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
`.slide--dual` / `.slide--map` / `.slide--fb` / `.slide--ai` / `.slide--shelter` / `.slide--collab` / `.slide--msg`
のクラスで自分のスライドを特定する（`slides.indexOf(...)`）。**スライドを挿入・並べ替えても番号は自動追従するので、ドキュメントでは極力ハードな番号参照を避ける。**

**目次（G キー / ☰ ボタン）は実行時に DOM から作る。** 各スライドの見出し（`h1` / `h2`）をそのまま項目名にし、章の区切りは `.slide--appendix` のスライドで決まるので、**スライドを足しても目次側の更新は不要**。ただし**見出し要素を持たないスライド**（図版だけ・用語リストだけのページ）は、`<section>` に `data-toc="目次に出す名前"` を付ける（無いとスラグがそのまま出る）。

**自動再生のループ範囲も `data-slide` で決まる。** `data-slide="appendix"` の区切りページの直前までを本編とみなし、自動再生はそこで先頭へ戻る（`src/deck/slides.ts` の `AUTOPLAY_STOP_SLUG`）。**Appendix の区切りページのスラグ `appendix` は変えない**こと。変えると Appendix まで自動再生で回るようになる。

### AI エージェント向けメタデータ（`data-slide` / JSON-LD / llms.txt）

URL の `#N`（先頭から N 番目のスライド）を、AI エージェントがソースを読まずに内容・エンティティ型へ解決できるよう、各 `<section class="slide">` に機械可読メタデータを持たせている。**スライドを追加・並べ替えたら、以下を同時に更新する**こと（番号ではなくスラグで対応づけているので、並べ替え自体はスラグを保てば壊れない）。

- 各 `<section>` に安定スラグ `data-slide="<slug>"`。ライブデモには `data-live="true"` / `data-demo="<key>"` / `data-entity-types="<型>[,<型>…]"` も付ける。
- `index.html` の `<head>` の JSON-LD（`PresentationDigitalDocument` の `hasPart`）に、`position`（＝DOM 順＝`#N`）・`identifier`（スラグ）・`name`（見出し）を 1 エントリ追加。ライブデモは `keywords` に `entityType:<型>`。`<head>` の `<link rel="alternate" title="llms.txt">` は発見用シグナル。
- `public/llms.txt` の「スライド（ページ）の内容」と、ライブデモなら「ライブデモの接続先・データモデル」（`### …` に `data-slide: <slug>` 併記）を更新。

## 作業の進め方

- 親リポジトリ `geonicdb` の `CLAUDE.md` のワークツリー運用・ラベル規約に従う。
- 変更後は `npm run build`（`tsc --noEmit` + `vite build`）が通ることを確認してから push する。
- ライブデモの動作確認は `npm run dev`（`http://localhost:8745`、origin 制限のためポート固定）。
- **`npm run dev` / `npm run preview` を実行する前に、必ず下記「ローカルサーバー起動時の環境変数」を確認する。** `VITE_GEONICDB_KEY` 未設定のまま起動すると、ライブデモは空文字キーで動き `AuthenticationError` になり見た目では気づきにくい。

## ローカルサーバー起動時の環境変数（必須）

`npm run dev` / `npm run preview` の**前に毎回**、`VITE_GEONICDB_KEY` 等が実際に読み込まれることを確認する。ワークツリー（`.worktrees/` 配下）で作業している場合も同様。

**`npm run preview` は `dist/` に焼き込み済みの静的ビルドを配信するだけ**なので、環境変数を後から設定・変更しても `preview` 自体には反映されない。`preview` する前に、環境変数を設定した状態で `npm run build` を実行し直すこと（順序: 環境変数を設定 → `npm run build` → `npm run preview`）。

### 1. まず確認する

```bash
direnv exec . env | grep VITE_GEONICDB_KEY
```

値（`gdb_...`）が出力されれば OK。何も出力されない場合は 2 または 3 に進む。

### 2. direnv が使える場合（推奨）

リポジトリルート（`geonicdb-livedeck/`）に `.envrc`（gitignore 済み、実キー入り）がある。`.worktrees/` 配下のワークツリーでも、direnv は親ディレクトリを自動的に辿ってこの `.envrc` を見つけるため、ワークツリー側に `.envrc` を新規作成する必要はない。

- 1. の確認で値が出ない場合、その `.envrc` がまだ `direnv allow` されていない可能性がある。リポジトリルートで:
  ```bash
  cd /path/to/geonicdb-livedeck   # ワークツリーではなく本体側
  direnv allow
  ```
- シェルの direnv フック（`eval "$(direnv hook bash)"` 等）が効いていない環境（非ログインシェル・CI・一部のターミナル）では、`npm run dev` を素で叩いても環境変数が乗らない。その場合は `direnv exec` で明示的に環境変数を注入してから起動する:
  ```bash
  direnv exec . npx vite            # dev サーバー
  direnv exec . npx vite preview    # ビルド成果物の確認サーバー
  ```

### 3. direnv が無い/使わない場合

```bash
cp .env.example .env
```
`.env` を開き、`VITE_GEONICDB_KEY`（および必要なら `VITE_GEONICDB_CONTRIBUTION_KEY` / `VITE_GEOLONIA_API_KEY`）に実キーを設定する。値はリポジトリルートの `.envrc` に書かれているものと同じでよい。Vite は `.env` を自動で読み込むため、以降は `npm run dev` をそのまま実行してよい。

### 4. 起動後の確認（値が実際に注入されたか）

`npm run dev`（開発サーバー）の場合:
```bash
curl -s http://localhost:8745/src/lib/config.ts | head -1
```
1 行目に `import.meta.env = {...}` として `VITE_GEONICDB_KEY` の実値が展開されていればライブデモは動く。`""`（空文字）のままなら 1〜3 をやり直す。

`npm run preview`（ビルド成果物）の場合は上記の動的トランスフォームが効かないため、ビルド後の静的バンドルに実キーが焼き込まれているかを直接確認する:
```bash
grep -o "gdb_[A-Za-z0-9]*" dist/assets/index-*.js
```
`.envrc` / `.env` に設定した実キー（`gdb_...`）と一致する文字列が出力に含まれていれば OK（プレースホルダ由来の別の断片が一緒に出ることがあるので、実キーと突き合わせて確認する）。含まれていなければ、環境変数が未設定のまま `npm run build` してしまっている。環境変数を設定し直して `npm run build` → `npm run preview` をやり直す。

## デモデータの原則

- **実在の顧客データと誤認させない**。エンティティの名前・id・URL・scope 等に**特定の地域名を含めない**（架空・中立的な内容にする）。
- NGSIv2 と NGSI-LD を対比する dual デモでは、**同じ内容のデータを両プロトコルで用意**し、差分が形式だけになるようにする（`env-sensor-001` ⇔ `urn:ngsi-ld:EnvironmentSensor:001`）。
