/* ===================================================================
   ライブデッキ（index.html）を 1 スライド 1 ページの PDF に書き出す。
   前提: 事前に `npm run build` 済みで dist/ が存在すること
   （`vite preview` で dist/ を配信し、そのページを Playwright で撮る）。

   - ライブデモ（data-live="true"）は実データを焼き込まず、
     「オンライン版でお試しください」という静的カードに差し替える
     （origin 制限つき API キーのため、preview のオリジンでは
     どのみち接続できず、待ち時間とノイズが増えるだけになる）。
   - prefers-reduced-motion を有効にして、スクリプト化アニメーション
     （AI Native のチャット→アプリプレビュー等）やループアニメーションを
     サイト側の CSS/JS が定義する「最終状態」で止める。
   =================================================================== */
import { preview } from "vite";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_PATH = process.argv[2] || path.join(ROOT, "dist", "geonicdb-livedeck.pdf");
const W = 1280;
const H = 720;

const LIVE_DEMO_LABELS = {
  feedback: "ライブフィードバック（NGSI-LD リンクトデータ）",
  "geo-query": "Geo クエリー（AED マップ）",
  shelter: "避難所の混雑度（自治体ユースケース）",
  "collab-gis": "共同編集 GIS（民間ユースケース）",
  messaging: "リアルタイムメッセージング + Rules ログ（民間ユースケース）",
  "dual-protocol": "標準 API（NGSIv2 / NGSI-LD デュアルプロトコル）",
};

async function injectLiveOverlay(slide, label, url) {
  await slide.evaluate(
    (el, { label, url }) => {
      const overlay = document.createElement("div");
      overlay.setAttribute("data-pdf-overlay", "1");
      overlay.style.cssText =
        "position:absolute;inset:0;z-index:999;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;gap:18px;text-align:center;" +
        "background:rgba(23,23,29,.94);color:#fff;font-family:Inter,'Noto Sans JP',sans-serif;padding:60px;";
      overlay.innerHTML = `
        <div style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#fba40c;font-weight:700;">Live Demo</div>
        <div style="font-size:28px;font-weight:800;max-width:900px;">${label}</div>
        <div style="font-size:16px;color:rgba(255,255,255,.75);max-width:760px;">実際の動作は、オンライン版のデッキで GeonicDB（ステージング）へ接続してお試しいただけます。</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:15px;color:#fc6c00;">${url}</div>
      `;
      el.appendChild(overlay);
    },
    { label, url },
  );
}

async function removeLiveOverlay(slide) {
  await slide.evaluate((el) => {
    const overlay = el.querySelector('[data-pdf-overlay="1"]');
    if (overlay) overlay.remove();
  });
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html が見つかりません。先に `npm run build` を実行してください。");
  }

  let server;
  let browser;
  try {
    // dist/ の資産パスは build 時の base（vite.config.ts の env.BASE_URL）で焼き込まれている。
    // CI では BASE_URL=/<repo>/ でビルドするため、preview もこれに合わせないとルート直下との
    // ミスマッチでアセットが 404 になる。
    const base = process.env.BASE_URL || "/";
    server = await preview({ root: ROOT, base, preview: { port: 8745, strictPort: true } });
    const url = server.resolvedUrls?.local?.[0];
    if (!url) throw new Error("preview server の URL を取得できませんでした。");

    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: W, height: H },
      deviceScaleFactor: 2,
    });

    // ライブ接続系のネットワークコールを止める。preview のオリジン（http://localhost:8745）は
    // 実は API キーの許可オリジンに含まれる（README 参照）ため技術的には繋がってしまう。
    // ここで意図的に遮断しているのは、ステージングの実データ・WebSocket タイミング次第で
    // 見た目が揺れたり CI が不安定になったりするのを避けるため（README「PDF 版」参照）。
    // 接続先ドメインは src/lib/config.ts の baseUrl / contributionConnConfig.baseUrl と
    // 二重管理になっているので、接続先を変えたらここも合わせて直すこと。
    await page.route(/geonicdb\.geolonia\.com|cdn\.geolonia\.com/, (route) => route.abort());
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url, { waitUntil: "networkidle" });
    // ナビゲーション UI（矢印・カウンター・進捗バー・ヒント）は PDF では不要。
    await page.addStyleTag({ content: `.ui, .hint { display: none !important; }` });

    const total = await page.evaluate(() => document.querySelectorAll(".slide").length);
    console.log(`slides: ${total}`);

    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < total; i++) {
      if (i > 0) {
        await page.evaluate(() => document.getElementById("nextBtn")?.click());
      }
      await page.waitForTimeout(350);

      const slide = page.locator(".slide.is-active");
      const slug = await slide.getAttribute("data-slide");
      const isLive = (await slide.getAttribute("data-live")) === "true";

      if (slug === "ai-native") {
        // スクリプト化アニメーション。チャットが進み loadApp() でアプリプレビューの
        // ピンが打たれ終わるまで待つ（setTimeout ベースの実時間なので待たないと
        // 初期状態のまま撮れる。reduced motion 下では全ステップが遅延ゼロで進む）。
        await page.waitForFunction(
          () => (document.getElementById("ai-app-pins")?.childElementCount ?? 0) > 0,
          { timeout: 20000 },
        );
        await page.waitForTimeout(150);
      }

      if (isLive) {
        const demo = await slide.getAttribute("data-demo");
        const label = LIVE_DEMO_LABELS[demo] || demo || "Live Demo";
        await injectLiveOverlay(slide, label, `https://geolonia.github.io/geonicdb-livedeck/#${i + 1}`);
      }

      const buf = await slide.screenshot();

      if (isLive) {
        await removeLiveOverlay(slide);
      }

      const img = await pdfDoc.embedPng(buf);
      const pdfPage = pdfDoc.addPage([W, H]);
      pdfPage.drawImage(img, { x: 0, y: 0, width: W, height: H });

      console.log(`captured ${i + 1}/${total} (${slug}${isLive ? ", live->overlay" : ""})`);
    }

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, await pdfDoc.save());
    console.log(`saved: ${OUT_PATH}`);
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
