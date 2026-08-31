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
// 表紙の QR コードは実行時の window.location からデッキ URL を自己判定する
// （src/demos/titleQr.ts）ため、そのままでは PDF 撮影用の preview サーバー
// （http://localhost:8745）を指してしまう。撮影時だけ本番 URL に固定する。
const DECK_URL = "https://geolonia.github.io/geonicdb-livedeck/";
// PDF 版に収録するのは 1〜16 ページ目（タイトル〜信頼性）まで。17 ページ目以降
// （ライブデモ・全機能カタログ・競合比較・AI 連携仕様・管理機能・パスワードの保護・
// クエリパラメータ・用語集・クロージング）は Web 版専用とし、PDF には含めない
// （代わりに末尾へ Web 版への案内ページを追加する。下記 buildWebOutroSlide 参照）。
const PDF_SLIDE_LIMIT = 16;

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

/**
 * PDF 専用の最終ページ（Web 版への案内）を組み立てて #deck に追加する。
 * デッキ本体の "Closing" スライドと同じ CSS クラス（.slide--closing 等）を
 * そのまま流用するため、追加の CSS は不要。デッキの初期化スクリプト
 * （src/deck/slides.ts）はページ読み込み時点の `.slide` 要素だけを見て
 * ナビゲーションを組むため、ここで動的に足しても Web 版のスライド数・
 * ハッシュ番号・キーボード操作には一切影響しない。
 */
async function buildWebOutroSlide(page, deckUrl) {
  await page.evaluate((deckUrl) => {
    const deck = document.getElementById("deck");
    const section = document.createElement("section");
    section.className = "slide slide--closing is-active";
    section.setAttribute("data-bg", "title");
    section.innerHTML = `
      <div class="grid-bg" aria-hidden="true"></div>
      <div class="slide__inner closing__inner">
        <img class="brand-logo brand-logo--center" src="assets/geonic-logo-dark.svg" alt="GeonicDB" />
        <h2 class="closing__headline">この続きは<br /><span class="accent">Web 版</span>で</h2>
        <p class="closing__sub">ライブデモ・全機能カタログ・競合比較・AI 連携仕様・管理機能・パスワードの保護・クエリパラメータ・用語集は、この PDF には含まれていません。詳しくは Web 版をご覧ください。</p>
        <div class="closing__cta">
          <span class="chip chip--lg mono">${deckUrl}</span>
        </div>
        <p class="closing__sub" style="font-size:16px;margin-bottom:24px;">お問い合わせ・デモのご相談は <span class="mono">https://geolonia.com/</span> まで</p>
        <p class="closing__foot mono">Geolonia, Inc. · GeonicDB Context Broker</p>
      </div>
    `;
    deck.appendChild(section);
  }, deckUrl);
  return page.locator(".slide--closing.is-active");
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
    // 表紙 QR コードの URL 自己判定（src/demos/titleQr.ts の __DECK_URL_OVERRIDE__）を
    // 本番 URL に固定する。ページのスクリプトが読み込まれるより前に定義する必要がある。
    await page.addInitScript((url) => {
      window.__DECK_URL_OVERRIDE__ = url;
    }, DECK_URL);
    await page.goto(url, { waitUntil: "networkidle" });
    // ナビゲーション UI（矢印・カウンター・進捗バー・ヒント）と、
    // トップページの PDF ダウンロードボタン（PDF 内では押せないので無意味）は PDF では不要。
    await page.addStyleTag({ content: `.ui, .hint, .title__pdf-btn { display: none !important; }` });

    const total = await page.evaluate(() => document.querySelectorAll(".slide").length);
    if (total < PDF_SLIDE_LIMIT) {
      // スライドを減らす方向の変更で PDF_SLIDE_LIMIT を更新し忘れると、nextBtn が
      // 末尾で何度クリックしても同じスライドに留まる（src/deck/slides.ts の next() が
      // 範囲外を無視するため）ため、気づかないまま同一ページが重複した PDF ができてしまう。
      throw new Error(
        `スライド数 (${total}) が PDF_SLIDE_LIMIT (${PDF_SLIDE_LIMIT}) 未満です。scripts/build-pdf.mjs の PDF_SLIDE_LIMIT を見直してください。`,
      );
    }
    console.log(`slides: ${total} (PDF に収録するのは 1-${PDF_SLIDE_LIMIT}。${PDF_SLIDE_LIMIT + 1}-${total} は Web 版専用のため除外し、末尾に Web 版案内ページを追加する)`);

    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < PDF_SLIDE_LIMIT; i++) {
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
        await injectLiveOverlay(slide, label, `${DECK_URL}#${i + 1}`);
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

    const outroSlide = await buildWebOutroSlide(page, DECK_URL);
    const outroBuf = await outroSlide.screenshot();
    const outroImg = await pdfDoc.embedPng(outroBuf);
    const outroPage = pdfDoc.addPage([W, H]);
    outroPage.drawImage(outroImg, { x: 0, y: 0, width: W, height: H });
    console.log(`captured ${PDF_SLIDE_LIMIT + 1}/${PDF_SLIDE_LIMIT + 1} (pdf-outro, PDF専用)`);

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
