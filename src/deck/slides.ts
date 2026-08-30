/* ===================================================================
   GeonicDB Presentation — slide engine
   - 全画面プレゼン（Google スライド風）
   - 移動: 矢印ボタン / キーボード / 左右の余白クリック
     （余白＝スライド枠の空きスペース・レターボックス外周。
       テキスト・ボタン・デモ・地図などコンテンツ上では移動しない）
   - キーボード: ← → / Space / PageUp PageDown / Home End / F / Esc
   =================================================================== */
import { byId } from "../lib/dom";
import { emitSlideChange } from "../lib/slidechange";

// スライドごとの背景（styles.css の .slide[data-bg=...] と対応）。
// スライド切替時に <body> へ適用し、スライド外周の色をスライドと揃える。
const SLIDE_BG: Record<string, string> = {
  title: "radial-gradient(120% 120% at 20% 10%, #2b2b36 0%, #17171d 60%)",
  dark: "linear-gradient(160deg, #20202a 0%, #17171d 100%)",
  accent: "linear-gradient(150deg, #322a26 0%, #1a1512 100%)",
  light: "linear-gradient(160deg, #fbf7f1 0%, #ece3d6 100%)",
  illus: "linear-gradient(180deg, #fffdf8 0%, #fbf4e7 100%)",
  "illus-dark": "linear-gradient(180deg, #0e1626 0%, #172138 70%, #0a0f1c 100%)",
};

const BASE_W = 1280;
const BASE_H = 720;

/**
 * スライド（1280x720）を表示領域に 16:9 のまま収める倍率。
 */
export function computeScale(w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 1;
  return Math.min(w / BASE_W, h / BASE_H);
}

/**
 * フィット計算に使う表示領域のサイズ。
 *
 * `window.innerWidth/innerHeight` は**ビジュアルビューポート**を返すため、
 * ピンチズームや iOS の入力欄オートズームで縮み、その値でスケールを固定すると
 * スライドだけが小さいまま取り残される。回転直後の resize では旧サイズが
 * 返ることもある。そこで、レイアウトに追従する `.deck`（position:fixed; inset:0）
 * の実サイズを第一の情報源にし、取れないときだけ順に退避する。
 */
export function measureViewport(
  box: { clientWidth: number; clientHeight: number } | null,
  fallback: { clientWidth: number; clientHeight: number } | null,
  innerW: number,
  innerH: number,
): { w: number; h: number } {
  const w = box?.clientWidth || fallback?.clientWidth || innerW;
  const h = box?.clientHeight || fallback?.clientHeight || innerH;
  return { w, h };
}

/** デッキを初期化し、ナビゲーション（矢印ボタン・キーボード）を有効化する。 */
export function initDeck(): void {
  const deck = byId("deck");
  if (!deck) return;
  const slides = Array.from(deck.querySelectorAll<HTMLElement>(".slide"));
  const total = slides.length;

  const progressBar = byId("progressBar");
  const counter = byId("counter");
  const prevBtn = byId<HTMLButtonElement>("prevBtn");
  const nextBtn = byId<HTMLButtonElement>("nextBtn");
  const fsBtn = byId<HTMLButtonElement>("fsBtn");
  const hint = byId("hint");

  let current = 0;

  // アスペクト比 16:9 を維持して画面にフィットさせる倍率を CSS 変数へ。
  function fit(): void {
    const { w, h } = measureViewport(
      deck,
      document.documentElement,
      window.innerWidth,
      window.innerHeight,
    );
    document.documentElement.style.setProperty("--scale", computeScale(w, h).toFixed(4));
  }

  function render(): void {
    slides.forEach((s, i) => {
      s.classList.remove("is-active", "is-prev");
      if (i === current) s.classList.add("is-active");
      else if (i < current) s.classList.add("is-prev");
    });
    if (progressBar) progressBar.style.width = ((current + 1) / total) * 100 + "%";
    if (counter) counter.textContent = current + 1 + " / " + total;
    if (prevBtn) prevBtn.disabled = current === 0;
    if (nextBtn) nextBtn.disabled = current === total - 1;
    location.hash = "#" + (current + 1);
    const bg = slides[current]?.getAttribute("data-bg") ?? "dark";
    document.body.style.background = SLIDE_BG[bg] || SLIDE_BG.dark;
    // スライド内のライブウィジェット（地図など）へ現在のスライドを通知。
    emitSlideChange({ index: current, total });
  }

  function go(n: number): void {
    current = Math.max(0, Math.min(total - 1, n));
    render();
  }
  function next(): void {
    if (current < total - 1) go(current + 1);
  }
  function prev(): void {
    if (current > 0) go(current - 1);
  }

  function toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }

  // フォーム入力中はキー（Space・矢印等）を奪わない。
  function inEditable(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return (
      !!t &&
      (t.tagName === "INPUT" ||
        t.tagName === "SELECT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable)
    );
  }

  document.addEventListener("keydown", (e) => {
    if (inEditable(e)) return;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        e.preventDefault();
        next();
        break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault();
        prev();
        break;
      case "Home":
        e.preventDefault();
        go(0);
        break;
      case "End":
        e.preventDefault();
        go(total - 1);
        break;
      case "f":
      case "F":
        e.preventDefault();
        toggleFullscreen();
        break;
    }
  });

  nextBtn?.addEventListener("click", next);
  prevBtn?.addEventListener("click", prev);
  fsBtn?.addEventListener("click", toggleFullscreen);

  // 左右端の余白クリックでのページ送り。
  // 送りの対象は「空きスペース（デッキ外周・スライド枠・.slide__inner の余白）」の
  // うち、さらに左右端の帯（EDGE_RATIO）に入るクリックのみ。
  // テキスト・ボタン・デモ・地図などコンテンツ要素は e.target が別要素になるため対象外。
  // 中央・下部の広い空きスペースをクリックしても送らない＝意図しない遷移を防ぐ。
  const EDGE_RATIO = 0.2; // 左右それぞれ 20% の帯だけを送りゾーンにする
  function isBlankArea(el: HTMLElement | null): boolean {
    return (
      el === deck ||
      (!!el && (el.classList.contains("slide") || el.classList.contains("slide__inner")))
    );
  }
  deck.addEventListener("click", (e) => {
    const el = e.target as HTMLElement | null;
    if (!isBlankArea(el)) return;
    // テキストをドラッグ選択した直後のクリックでは移動しない。
    const sel = window.getSelection?.();
    if (sel && sel.type === "Range" && sel.toString().length > 0) return;
    // 現在スライド枠を基準に、左端の帯なら前へ・右端の帯なら次へ。中央は送らない。
    const rect = slides[current]?.getBoundingClientRect();
    if (!rect) return;
    const band = rect.width * EDGE_RATIO;
    if (e.clientX < rect.left + band) prev();
    else if (e.clientX > rect.right - band) next();
  });

  // ヒントの自動非表示。
  let hintTimer = window.setTimeout(() => hint?.classList.add("is-hidden"), 4500);
  document.addEventListener("keydown", () => {
    hint?.classList.remove("is-hidden");
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint?.classList.add("is-hidden"), 3000);
  });

  // 表示領域の変化を取りこぼさない。resize だけだと、端末回転直後に旧サイズで
  // 発火した値のままスライドが小さく固定される（スマホ・タブレットで発生）。
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", () => {
    fit();
    // 回転直後は resize/orientationchange の時点でまだ旧レイアウトのことがある。
    requestAnimationFrame(fit);
    window.setTimeout(fit, 300);
  });
  window.visualViewport?.addEventListener("resize", fit);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(deck);

  // URL ハッシュから開始位置を復元。
  const fromHash = parseInt((location.hash || "").replace("#", ""), 10);
  if (!isNaN(fromHash) && fromHash >= 1 && fromHash <= total) current = fromHash - 1;
  fit();
  render();
}
