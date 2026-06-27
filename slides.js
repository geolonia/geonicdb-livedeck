/* ===================================================================
   GeonicDB Presentation — slide engine
   - 全画面プレゼン (Google スライド風)
   - キーボード: ← → / Space / PageUp PageDown / Home End / F / Esc
   - クリック: 左右ボタン・進捗バー
   =================================================================== */
(function () {
  "use strict";

  const deck = document.getElementById("deck");
  const slides = Array.from(deck.querySelectorAll(".slide"));
  const total = slides.length;

  const progressBar = document.getElementById("progressBar");
  const counter = document.getElementById("counter");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const fsBtn = document.getElementById("fsBtn");
  const hint = document.getElementById("hint");

  // Per-slide backgrounds, mirroring the .slide[data-bg=...] rules in styles.css.
  // Applied to <body> on each slide change so the outer area matches the slide.
  const SLIDE_BG = {
    title: "radial-gradient(120% 120% at 20% 10%, #2b2b36 0%, #17171d 60%)",
    dark: "linear-gradient(160deg, #20202a 0%, #17171d 100%)",
    accent: "linear-gradient(150deg, #322a26 0%, #1a1512 100%)",
    light: "linear-gradient(160deg, #fbf7f1 0%, #ece3d6 100%)",
    illus: "linear-gradient(180deg, #fffdf8 0%, #fbf4e7 100%)",
    "illus-dark": "linear-gradient(180deg, #0e1626 0%, #172138 70%, #0a0f1c 100%)",
  };

  let current = 0;

  /* ---- スライドのスケーリング (アスペクト比 16:9 を維持して画面にフィット) ---- */
  const BASE_W = 1280;
  const BASE_H = 720;
  function fit() {
    const scale = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    document.documentElement.style.setProperty("--scale", scale.toFixed(4));
  }

  /* ---- 表示更新 ---- */
  function render() {
    slides.forEach((s, i) => {
      s.classList.remove("is-active", "is-prev");
      if (i === current) s.classList.add("is-active");
      else if (i < current) s.classList.add("is-prev");
    });
    progressBar.style.width = ((current + 1) / total) * 100 + "%";
    counter.textContent = current + 1 + " / " + total;
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === total - 1;
    location.hash = "#" + (current + 1);
    // Match the outer (body) background to the active slide so the slide blends
    // seamlessly into the surrounding area instead of sitting on a black frame.
    var bg = slides[current].getAttribute("data-bg");
    document.body.style.background = SLIDE_BG[bg] || SLIDE_BG.dark;
    // Notify slide-local widgets (e.g. the live AED map) about the active slide
    document.dispatchEvent(
      new CustomEvent("slidechange", { detail: { index: current, total: total } }),
    );
  }

  function go(n) {
    current = Math.max(0, Math.min(total - 1, n));
    render();
  }
  function next() { if (current < total - 1) go(current + 1); }
  function prev() { if (current > 0) go(current - 1); }

  /* ---- キーボード ---- */
  // Don't hijack keys (Space, arrows, etc.) while the user is typing into a
  // form field — otherwise Space would advance the slide instead of inserting
  // a space. Let those events through to the input untouched.
  function inEditable(e) {
    var t = e.target;
    return !!t && (t.tagName === "INPUT" || t.tagName === "SELECT" ||
      t.tagName === "TEXTAREA" || t.isContentEditable);
  }
  document.addEventListener("keydown", (e) => {
    if (inEditable(e)) return;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        e.preventDefault(); next(); break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault(); prev(); break;
      case "Home":
        e.preventDefault(); go(0); break;
      case "End":
        e.preventDefault(); go(total - 1); break;
      case "f":
      case "F":
        e.preventDefault(); toggleFullscreen(); break;
    }
  });

  /* ---- クリック / タップ ---- */
  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);
  fsBtn.addEventListener("click", toggleFullscreen);

  // スライド本体のクリックでも進む (UI コントロール・リンク以外)
  deck.addEventListener("click", (e) => {
    if (e.target.closest("a, button, .code, table, .map-wrap, .geo-panel, .svy-body, .tmp-body, input, select, textarea, label")) return;
    // 左 1/4 をクリックしたら戻る、それ以外は進む
    if (e.clientX < window.innerWidth * 0.25) prev();
    else next();
  });

  /* ---- スワイプ ---- */
  let touchX = null;
  deck.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  deck.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    touchX = null;
  }, { passive: true });

  /* ---- 全画面 ---- */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else {
      (document.exitFullscreen || function () {}).call(document);
    }
  }

  /* ---- ヒント自動非表示 ---- */
  let hintTimer = setTimeout(() => hint.classList.add("is-hidden"), 4500);
  function flashHint() {
    hint.classList.remove("is-hidden");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add("is-hidden"), 3000);
  }
  document.addEventListener("keydown", flashHint);

  /* ---- リサイズ ---- */
  window.addEventListener("resize", fit);

  /* ---- 初期化 (URL ハッシュから開始位置を復元) ---- */
  const fromHash = parseInt((location.hash || "").replace("#", ""), 10);
  if (!isNaN(fromHash) && fromHash >= 1 && fromHash <= total) current = fromHash - 1;
  fit();
  render();
})();
