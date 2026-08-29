#!/usr/bin/env bash
# 公開済みのライブサイトが「今ビルドしたバンドル」を配信しているかを検証する。
#
# GitHub Pages は「デプロイ成功」と「実際に配信される中身」が別物で、過去に
# 反映されないまま古いバンドルが配信され続けた（geonicdb-livedeck#42）。
# デプロイ直後にここで実配信を突き合わせ、ズレていれば赤にする。
#
# 検証は**訪問者とまったく同じ条件**で行う。クエリなしの素の URL、かつ
# キャッシュ制御ヘッダも付けない。キャッシュバスタ付きの URL や再検証を強制した
# リクエストは誰も送らないので、それが新しくても「利用者に新しい版が届いている」
# ことの証明にならない。エッジに古い HTML が残っている間はリトライで待つ。
#
#   PAGE_URL  検証対象の URL（末尾スラッシュあり／なしどちらでも可）
#   EXPECTED  配信されているべきエントリ JS のパス（例 assets/index-Bo3msxiW.js）
#   ATTEMPTS  最大試行回数（既定 45）
#   INTERVAL  試行間隔の秒数（既定 15）
#
# 既定値は 45 x 15s ≒ 11 分。Pages の HTML は `cache-control: max-age=600` なので、
# エッジに古い HTML が残る最悪ケース（10 分）を吸収できる長さにしてある。
# 反映が正常なら通常 1〜2 回目で抜けるので、この時間を使い切るのは実際に
# 壊れているときだけ。
set -euo pipefail

: "${PAGE_URL:?PAGE_URL is required}"
: "${EXPECTED:?EXPECTED is required}"
attempts="${ATTEMPTS:-45}"
interval="${INTERVAL:-15}"
base="${PAGE_URL%/}"

# 通常アクセス。訪問者のブラウザと同じ条件（追加ヘッダなし）で叩く。
# `Cache-Control: no-cache` を付けるとキャッシュに再検証を強制してしまい、
# 訪問者が受け取る経路とは別の応答を検証することになる（RFC 9111）。
fetch() {
  curl -fsSL --max-time 30 "$1"
}

# 診断用。再検証を強制し、キャッシュを迂回してオリジンの中身を見る。
probe_origin() {
  curl -fsSL --max-time 30 -H 'Cache-Control: no-cache' "$1"
}

entry_of() {
  # 与えられた HTML が読み込んでいるエントリ JS 名（先頭 1 件）。
  printf '%s' "$1" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -n 1 || true
}

kind=""

echo "expecting ${EXPECTED} at ${base}/"

for attempt in $(seq 1 "$attempts"); do
  html=$(fetch "${base}/") || html=""

  # パイプ + `set -o pipefail` だと grep -q の早期終了で printf が SIGPIPE を受け、
  # 一致しているのに非ゼロになる。シェル内の文字列一致で判定する。
  matched=""
  case "$html" in
    *"$EXPECTED"*) matched=1 ;;
  esac

  if [ -n "$matched" ]; then
    # HTML だけ新しくてもエントリ JS が未反映（404）ならアプリは起動しない。
    # 実体を取得できるところまで確認して初めて成功とする。
    if fetch "${base}/${EXPECTED}" > /dev/null; then
      echo "OK: ライブは ${EXPECTED} を配信しています（試行 ${attempt} 回目）"
      exit 0
    fi
    kind="js_missing"
    reason="HTML は最新だがエントリ JS (${EXPECTED}) を取得できません"
  elif [ -z "$html" ]; then
    kind="unreachable"
    reason="HTML の取得に失敗"
  else
    kind="stale"
    reason="未反映（配信中: $(entry_of "$html")）"
  fi

  echo "試行 ${attempt}/${attempts}: ${reason}"
  if [ "$attempt" -lt "$attempts" ]; then sleep "$interval"; fi
done

# 落ちた原因を切り分けて出す。「公開そのものが未反映」が #42 の事故で、
# 「エッジに古い版が残っているだけ」なら待てば直る。
if [ "$kind" = "js_missing" ]; then
  echo "::error::${base}/ の HTML は ${EXPECTED} を指していますが、その JS 本体を取得できません。アップロードした成果物が不完全な可能性があります。"
  exit 1
fi

origin=$(probe_origin "${base}/?cachebust=${GITHUB_RUN_ID:-local}-final") || origin=""
origin_entry=$(entry_of "$origin")
case "$origin" in
  *"$EXPECTED"*)
    echo "::error::オリジンには ${EXPECTED} が反映済みですが、${base}/ ではまだ配信されていません（CDN のキャッシュが残っている可能性）。"
    ;;
  *)
    echo "::error::${base}/ が ${EXPECTED} を配信していません（オリジンの配信中: ${origin_entry:-取得失敗}）。GitHub Pages への公開自体が反映されていない可能性があります。"
    ;;
esac
exit 1
