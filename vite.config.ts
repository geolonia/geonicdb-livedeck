import { defineConfig } from "vite";
import { ViteMinifyPlugin } from "vite-plugin-minify";

// Geolonia Maps と GeonicDB は CDN / 別管理のため、ベース URL とポートは pulse 準拠。
// origin 制限付きの API キーに合わせ、dev/preview とも 8745 固定。
export default defineConfig({
  base: process.env.BASE_URL || "/",
  server: { port: 8745, strictPort: true },
  preview: { port: 8745, strictPort: true },
  build: {
    // Geolonia Maps は CDN グローバル（window.geolonia）として読み込むためバンドル対象外。
    rollupOptions: { external: ["geolonia"] },
  },
  plugins: [
    {
      // index.html の Geolonia CDN キーを .env の値に置換（pulse と同じ手法）。
      name: "html-env-defaults",
      transformIndexHtml(html) {
        return html.replace(
          /%VITE_GEOLONIA_API_KEY%/g,
          process.env.VITE_GEOLONIA_API_KEY || "YOUR-API-KEY",
        );
      },
    },
    ViteMinifyPlugin({
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true,
    }),
  ],
});
