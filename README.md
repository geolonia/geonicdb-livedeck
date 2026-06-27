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

### スライド 9 — ジオクエリ（`aed-map.js`）
- Geolonia Maps（MapLibre GL）+ GeonicDB SDK。`AedLocation` を地図表示し、中心点＋半径で **NGSI-LD `georel=near` 検索**。
- ページネーション取得（`count` → `getEntities` を 100 件ずつ）。
- 認可: ポリシー `presentation-aed-readonly`（GET + WS のみ）／キー `presentation-aed-map`（DPoP 必須・origin 制限）。

### スライド 11 — ライブアンケート（`survey.js`）
- 投票で `PollVote` エンティティを作成 → **WebSocket で全クライアントのバーチャートにリアルタイム集計**。
- 認可: ポリシー `presentation-survey`（GET|WS + `PollVote` への POST のみ）／キー `presentation-survey`（DPoP 必須・origin 制限）。
- カスタムデータモデル `PollVote`（`poll` 必須・`choice` は enum 制約）でサーバ側バリデーション。

## ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | デッキ本体（全スライドのマークアップ） |
| `styles.css` | テーマ・レイアウト・アニメーション |
| `slides.js` | スライドエンジン（ナビゲーション・背景同期・スケーリング） |
| `aed-map.js` | スライド 9 ジオクエリの地図デモ |
| `survey.js` | スライド 11 ライブアンケートの WebSocket デモ |
| `assets/` | ロゴ・イラスト SVG・地図スタイル・GeonicDB SDK（IIFE） |

## メモ

- 埋め込みの API キーは **DPoP 必須・origin 制限**の設計で、クライアントバンドルに含めてよい前提です（他 origin からの流用はサーバ側 origin 検証で防止）。
- デモのキー／ポリシー／カスタムデータモデルは `geonic` CLI で発行・管理しています。
