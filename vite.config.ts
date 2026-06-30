import { defineConfig, loadEnv } from "vite";
import { ViteMinifyPlugin } from "vite-plugin-minify";

// Geolonia Maps と GeonicDB は CDN / 別管理のため、ベース URL とポートは pulse 準拠。
// origin 制限付きの API キーに合わせ、dev/preview とも 8745 固定。
export default defineConfig(({ mode }) => {
  // .env 系ファイルと process.env を両方読む（prefix "" で全件）。
  // これで CI（ワークフローの env）とローカル（.env）の双方で同じ値を参照できる。
  const env = loadEnv(mode, process.cwd(), "");

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
        // index.html の Geolonia CDN キー（%GEOLONIA_KEY%）を埋め込む。
        // VITE_GEOLONIA_API_KEY が未設定／空なら YOUR-API-KEY（localhost / *.github.io で
        // 動く公開デモキー）にフォールバック。order:'pre' で Vite の %VITE_*% 置換より先に走らせ、
        // 本番で空キーになる問題を防ぐ（自動置換対象外の %GEOLONIA_KEY% を使うのも同じ理由）。
        name: "html-env-defaults",
        transformIndexHtml: {
          order: "pre",
          handler(html: string) {
            const key = env.VITE_GEOLONIA_API_KEY || "YOUR-API-KEY";
            return html.replace(/%GEOLONIA_KEY%/g, key);
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
