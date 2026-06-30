/* ===================================================================
   GeonicDB Presentation — slide engine
   - 全画面プレゼン（Google スライド風）
   - 移動は矢印ボタンとキーボードのみ（クリック/スワイプでは移動しない）
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
    const scale = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    document.documentElement.style.setProperty("--scale", scale.toFixed(4));
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

  // ナビゲーションは矢印ボタンのみ（スライド本体クリック・スワイプでは移動しない）。
  nextBtn?.addEventListener("click", next);
  prevBtn?.addEventListener("click", prev);
  fsBtn?.addEventListener("click", toggleFullscreen);

  // ヒントの自動非表示。
  let hintTimer = window.setTimeout(() => hint?.classList.add("is-hidden"), 4500);
  document.addEventListener("keydown", () => {
    hint?.classList.remove("is-hidden");
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint?.classList.add("is-hidden"), 3000);
  });

  window.addEventListener("resize", fit);

  // URL ハッシュから開始位置を復元。
  const fromHash = parseInt((location.hash || "").replace("#", ""), 10);
  if (!isNaN(fromHash) && fromHash >= 1 && fromHash <= total) current = fromHash - 1;
  fit();
  render();
}
