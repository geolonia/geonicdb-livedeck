/* ===================================================================
   GeonicDB Presentation — slide engine
   - 全画面プレゼン（Google スライド風）
   - 移動: 矢印ボタン / キーボード / 左右の余白クリック
     （余白＝スライド枠の空きスペース・レターボックス外周。
       テキスト・ボタン・デモ・地図などコンテンツ上では移動しない）
   - 自動再生: ▶/⏸ ボタン・P キー。一定秒ごとに次へ進み、本編の最終ページ
     （Appendix の直前）の次は先頭へ戻る。Appendix 以降は自動再生では回さない
   - キーボード: ← → / Space / PageUp PageDown / Home End / P / F / Esc
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

/** 自動再生の既定間隔（秒）。`?autoplay=<秒>` で上書きできる。 */
export const AUTOPLAY_DEFAULT_SEC = 8;
const AUTOPLAY_MIN_SEC = 1;
const AUTOPLAY_MAX_SEC = 600;

/** 自動再生のループ範囲の終端を決めるスライド（`data-slide`）。この直前までを回す。 */
const AUTOPLAY_STOP_SLUG = "appendix";

/**
 * 自動再生でループする範囲の最終スライド番号（0 起点）。
 *
 * Appendix の区切りページ（`data-slide="appendix"`）の直前までを本編とみなす。
 * 番号ではなくスラグで境界を決めるので、スライドを挿入・並べ替えても追従する。
 * 区切りが見つからないときは全スライドを対象にする。
 */
export function autoplayLastIndex(slugs: (string | null)[]): number {
  const stop = slugs.indexOf(AUTOPLAY_STOP_SLUG);
  const last = (stop >= 0 ? stop : slugs.length) - 1;
  return Math.max(0, last);
}

/**
 * 自動再生を開始した瞬間に表示すべきスライド番号。
 *
 * ループ範囲の外（Appendix 側）で再生を押した／`#<Appendix のページ>?autoplay` で開いた
 * ときは、1 周期待たずに即座に先頭へ戻す。範囲内なら現在位置のまま。
 */
export function autoplayStartIndex(current: number, lastIndex: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(lastIndex)) return 0;
  if (current > lastIndex) return 0;
  return Math.max(0, Math.floor(current));
}

/**
 * 自動再生で次に表示するスライド番号。
 * `lastIndex`（本編の最終ページ）に達していたら先頭（0）へ戻る。
 * Appendix 側に手動で移動した状態から再生した場合も先頭へ戻す。
 */
export function nextSlideIndex(current: number, lastIndex: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(lastIndex)) return 0;
  if (current < 0 || current >= lastIndex) return 0;
  return Math.floor(current) + 1;
}

/**
 * `?autoplay=<秒>` の解釈。
 * - 値なし（`?autoplay`）・非数値は既定秒
 * - 範囲外は 1〜600 秒にクランプ（0 や巨大値で暴走・停止しないように）
 * パラメータ自体が無いときは null（＝自動再生を開始しない）。
 */
export function parseAutoplaySeconds(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return AUTOPLAY_DEFAULT_SEC;
  return Math.min(AUTOPLAY_MAX_SEC, Math.max(AUTOPLAY_MIN_SEC, n));
}

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
  const playBtn = byId<HTMLButtonElement>("playBtn");
  const hint = byId("hint");

  let current = 0;

  // 自動再生でループする範囲（0 〜 autoplayLast）。Appendix 以降は含めない。
  const autoplayLast = autoplayLastIndex(slides.map((s) => s.getAttribute("data-slide")));

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
    deferAutoplay();
    if (current < total - 1) go(current + 1);
  }
  function prev(): void {
    deferAutoplay();
    if (current > 0) go(current - 1);
  }

  // ===== 自動再生 =====
  // 一定秒ごとに次のスライドへ。最終ページの次は先頭へ戻る（ループ再生）。
  // 手動で移動したときはタイマーを張り直し、直後に勝手に送られないようにする。
  let autoplaySec = AUTOPLAY_DEFAULT_SEC;
  let autoplayTimer: number | null = null;

  function renderPlayBtn(): void {
    if (!playBtn) return;
    const on = autoplayTimer !== null;
    playBtn.textContent = on ? "⏸" : "▶";
    playBtn.setAttribute("aria-pressed", String(on));
    const label = on ? "自動再生を停止" : `自動再生（${autoplaySec} 秒ごと）`;
    playBtn.setAttribute("aria-label", label);
    playBtn.title = label;
  }

  function armAutoplay(): void {
    if (autoplayTimer !== null) window.clearInterval(autoplayTimer);
    autoplayTimer = window.setInterval(
      () => go(nextSlideIndex(current, autoplayLast)),
      autoplaySec * 1000,
    );
  }
  function startAutoplay(): void {
    // Appendix 側から再生したときは、1 周期分そこに留まらず即座に先頭へ。
    const from = autoplayStartIndex(current, autoplayLast);
    if (from !== current) go(from);
    armAutoplay();
    renderPlayBtn();
  }
  function stopAutoplay(): void {
    if (autoplayTimer !== null) window.clearInterval(autoplayTimer);
    autoplayTimer = null;
    renderPlayBtn();
  }
  function toggleAutoplay(): void {
    if (autoplayTimer === null) startAutoplay();
    else stopAutoplay();
  }
  /** 手動操作でタイマーをリセット（再生中のときだけ）。 */
  function deferAutoplay(): void {
    if (autoplayTimer !== null) armAutoplay();
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
        deferAutoplay();
        go(0);
        break;
      case "End":
        e.preventDefault();
        deferAutoplay();
        go(total - 1);
        break;
      case "p":
      case "P":
        e.preventDefault();
        toggleAutoplay();
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
  playBtn?.addEventListener("click", toggleAutoplay);

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

  // `?autoplay` / `?autoplay=<秒>` が付いていれば、間隔を反映して自動再生を開始する
  // （展示・サイネージ用途）。無ければ既定秒のまま停止状態で待つ。
  const fromQuery = parseAutoplaySeconds(new URLSearchParams(location.search).get("autoplay"));
  if (fromQuery !== null) {
    autoplaySec = fromQuery;
    startAutoplay();
  } else {
    renderPlayBtn();
  }
}
