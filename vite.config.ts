import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { ViteMinifyPlugin } from "vite-plugin-minify";

/**
 * 表紙に出す GeonicDB のバージョン。
 * 本体と SDK は同一バージョンで公開されるため（geonicdb#1361 のリリース方針）、
 * 依存している SDK のバージョンをそのまま製品バージョンとして表示する。
 * インストール済みの実バージョン（node_modules）を優先し、取れなければ
 * package.json の依存レンジ（例 "^0.17.0"）から範囲指定子を落として使う。
 */
function geonicdbVersion(root: string): string {
  const read = (p: string): Record<string, unknown> =>
    JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  const SDK = "@geolonia/geonicdb-sdk";
  try {
    const installed = read(resolve(root, "node_modules", SDK, "package.json"));
    if (typeof installed.version === "string") return installed.version;
  } catch {
    // 未インストール（CI の型チェックのみ等）。依存レンジへフォールバック。
  }
  const deps = read(resolve(root, "package.json")).dependencies as Record<string, string> | undefined;
  const range = deps?.[SDK];
  if (!range) throw new Error(`${SDK} が package.json の dependencies に見つかりません`);
  // 先頭の範囲指定子だけを落として最初の x.y.z を取り出す。複合レンジ
  // （">=0.17.0 <0.18.0"）や "0.17.x" のように 1 つに定まらない書き方は
  // 拾わず throw する（表紙に "v0.17.0 <0.18.0" と出す方が事故なので fail-loud）。
  const match = /^\D*(\d+\.\d+\.\d+[\w.+-]*)$/.exec(range);
  if (!match) throw new Error(`${SDK} のバージョンを解決できません: ${range}`);
  return match[1];
}

// Geolonia Maps と GeonicDB は CDN / 別管理のため、ベース URL とポートは pulse 準拠。
// origin 制限付きの API キーに合わせ、dev/preview とも 8745 固定。
export default defineConfig(({ mode }) => {
  // .env 系ファイルと process.env を両方読む（prefix "" で全件）。
  // これで CI（ワークフローの env）とローカル（.env）の双方で同じ値を参照できる。
  const env = loadEnv(mode, process.cwd(), "");
  const version = geonicdbVersion(process.cwd());

  return {
    base: env.BASE_URL || "/",
    server: { port: 8745, strictPort: true },
    preview: { port: 8745, strictPort: true },
    build: {
      // Geolonia Maps は CDN グローバル（window.geolonia）として読み込むためバンドル対象外。
      rollupOptions: { external: ["geolonia"] },
    },
    plugins: [
      {
        // index.html の Geolonia CDN キー（%GEOLONIA_KEY%）と
        // 表紙の GeonicDB バージョン（%GEONICDB_VERSION%）を埋め込む。
        // VITE_GEOLONIA_API_KEY が未設定／空なら YOUR-API-KEY（localhost / *.github.io で
        // 動く公開デモキー）にフォールバック。order:'pre' で Vite の %VITE_*% 置換より先に走らせ、
        // 本番で空キーになる問題を防ぐ（自動置換対象外の %GEOLONIA_KEY% を使うのも同じ理由）。
        name: "html-env-defaults",
        transformIndexHtml: {
          order: "pre",
          handler(html: string) {
            const key = env.VITE_GEOLONIA_API_KEY || "YOUR-API-KEY";
            return html
              .replace(/%GEOLONIA_KEY%/g, key)
              .replace(/%GEONICDB_VERSION%/g, version);
          },
        },
      },
      ViteMinifyPlugin({
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
      }),
    ],
  };
});
