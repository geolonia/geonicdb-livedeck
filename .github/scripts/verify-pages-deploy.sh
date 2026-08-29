#!/usr/bin/env bash
# 公開済みのライブサイトが「今ビルドしたバンドル」を配信しているかを検証する。
#
# GitHub Pages は「デプロイ成功」と「CDN への反映」が別物で、過去に
# 反映されないまま古いバンドルが配信され続けた（geonicdb-livedeck#42）。
# デプロイ直後にここで実際の配信内容を突き合わせ、ズレていれば赤にする。
#
#   PAGE_URL  検証対象の URL（末尾スラッシュあり／なしどちらでも可）
#   EXPECTED  配信されているべきエントリ JS のパス（例 assets/index-Bo3msxiW.js）
#   ATTEMPTS  最大試行回数（既定 10）
#   INTERVAL  試行間隔の秒数（既定 15）
set -euo pipefail

: "${PAGE_URL:?PAGE_URL is required}"
: "${EXPECTED:?EXPECTED is required}"
attempts="${ATTEMPTS:-10}"
interval="${INTERVAL:-15}"

echo "expecting ${EXPECTED} at ${PAGE_URL}"

for attempt in $(seq 1 "$attempts"); do
  # CDN のキャッシュ済みレスポンスを掴まないようクエリでバスターを付ける。
  html=$(curl -fsSL --max-time 30 -H 'Cache-Control: no-cache' \
    "${PAGE_URL%/}/?cachebust=${GITHUB_RUN_ID:-local}-${attempt}") || html=""

  # パイプ + `set -o pipefail` だと grep -q の早期終了で printf が SIGPIPE を受け、
  # 一致しているのに非ゼロになる。シェル内の文字列一致で判定する。
  case "$html" in
    *"$EXPECTED"*)
      echo "OK: ライブは ${EXPECTED} を配信しています（試行 ${attempt} 回目）"
      exit 0
      ;;
  esac

  served=$(printf '%s' "$html" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -n 1 || true)
  echo "試行 ${attempt}/${attempts}: 未反映（配信中: ${served:-取得失敗}）"
  if [ "$attempt" -lt "$attempts" ]; then sleep "$interval"; fi
done

echo "::error::ライブサイト ${PAGE_URL} が ${EXPECTED} を配信していません。GitHub Pages への公開が反映されていない可能性があります。"
exit 1
