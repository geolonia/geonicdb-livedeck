/* ===================================================================
   FOSS4G Hiroshima 2026 keynote — slide engine.
   Adapted (vanilla JS, no build step) from src/deck/slides.ts of the
   geonicdb-livedeck product deck: same fit-to-viewport scaling, same
   keyboard/margin-click paging, same URL-hash bookmarking. Kept as a
   plain script (not a Vite module) to match the public/talk/ pattern
   of standalone pages that don't go through the app build.
   =================================================================== */
(function () {
  "use strict";

  var BASE_W = 1280;
  var BASE_H = 720;

  function boot() {
    var deck = document.getElementById("deck");
    if (!deck) return;
    var slides = Array.prototype.slice.call(deck.querySelectorAll(".slide"));
    var total = slides.length;

    var progressBar = document.getElementById("progressBar");
    var counter = document.getElementById("counter");
    var prevBtn = document.getElementById("prevBtn");
    var nextBtn = document.getElementById("nextBtn");
    var fsBtn = document.getElementById("fsBtn");
    var hint = document.getElementById("hint");

    var current = 0;

    function fit() {
      var scale = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
      document.documentElement.style.setProperty("--scale", scale.toFixed(4));
    }

    function render() {
      slides.forEach(function (s, i) {
        s.classList.remove("is-active", "is-prev");
        if (i === current) s.classList.add("is-active");
        else if (i < current) s.classList.add("is-prev");
      });
      if (progressBar) progressBar.style.width = ((current + 1) / total) * 100 + "%";
      if (counter) counter.textContent = current + 1 + " / " + total;
      if (prevBtn) prevBtn.disabled = current === 0;
      if (nextBtn) nextBtn.disabled = current === total - 1;
      location.hash = "#" + (current + 1);
    }

    function go(n) {
      current = Math.max(0, Math.min(total - 1, n));
      render();
    }
    function next() { if (current < total - 1) go(current + 1); }
    function prev() { if (current > 0) go(current - 1); }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
      } else {
        (document.exitFullscreen || function () {}).call(document);
      }
    }

    function inEditable(e) {
      var t = e.target;
      return !!t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    }

    document.addEventListener("keydown", function (e) {
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

    if (nextBtn) nextBtn.addEventListener("click", next);
    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (fsBtn) fsBtn.addEventListener("click", toggleFullscreen);

    // Left/right margin click-to-page (edge band only; content is untouched).
    var EDGE_RATIO = 0.2;
    function isBlankArea(el) {
      return el === deck || (!!el && (el.classList.contains("slide") || el.classList.contains("slide__inner")));
    }
    deck.addEventListener("click", function (e) {
      var el = e.target;
      if (!isBlankArea(el)) return;
      var sel = window.getSelection ? window.getSelection() : null;
      if (sel && sel.type === "Range" && sel.toString().length > 0) return;
      var rect = slides[current] ? slides[current].getBoundingClientRect() : null;
      if (!rect) return;
      var band = rect.width * EDGE_RATIO;
      if (e.clientX < rect.left + band) prev();
      else if (e.clientX > rect.right - band) next();
    });

    var hintTimer = window.setTimeout(function () { if (hint) hint.classList.add("is-hidden"); }, 4500);
    document.addEventListener("keydown", function () {
      if (hint) hint.classList.remove("is-hidden");
      clearTimeout(hintTimer);
      hintTimer = window.setTimeout(function () { if (hint) hint.classList.add("is-hidden"); }, 3000);
    });

    window.addEventListener("resize", fit);

    var fromHash = parseInt((location.hash || "").replace("#", ""), 10);
    if (!isNaN(fromHash) && fromHash >= 1 && fromHash <= total) current = fromHash - 1;
    fit();
    render();

    // ===== Close variant toggle (3Q / 2Q) — rehearsal aid only =====
    var toggle = document.getElementById("variantToggle");
    if (toggle) {
      var is2q = deck.classList.contains("is-2q");
      var isJa = document.documentElement.lang === "ja";
      function paint() {
        if (isJa) {
          toggle.textContent = is2q ? "締め: 2問版(クリックで3問版)" : "締め: 3問版(クリックで2問版)";
        } else {
          toggle.textContent = is2q ? "Close: 2Q (click for 3Q)" : "Close: 3Q (click for 2Q)";
        }
      }
      toggle.addEventListener("click", function () {
        is2q = !is2q;
        deck.classList.toggle("is-2q", is2q);
        paint();
      });
      paint();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
