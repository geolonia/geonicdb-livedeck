/* ===================================================================
   Slide 5 — AI-native demo (scripted animation, no live API).
   A three-step story driven by natural-language chat requests:
     STEP 1  避難所のデータを作って            → entities are created
     STEP 2  アプリ用の API キーを発行して      → an (origin-restricted, DPoP) key
     STEP 3  避難所のアプリを作って             → a live app assembles itself
   The chat (left) and the build pipeline (right) advance in lock-step,
   then the whole thing resets and loops.
   =================================================================== */
(function () {
  "use strict";

  var AI_SLIDE_INDEX = 4; // 0-based index of the AI-native slide

  // app-preview shelter pin positions (viewBox 320x220)
  var APP_PINS = [[70, 72], [150, 56], [232, 82], [98, 142], [196, 150], [262, 128]];
  var APP_ITEMS = ["○○小学校", "△△公民館", "□□市民体育館"];
  var KEY_VALUE = "gdb_a9d3••••••••••••";

  var gen = 0;        // bumped to cancel an in-flight loop when leaving the slide
  var running = false;

  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function alive(my) { return my === gen; }
  function reduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function stageEl() { return document.querySelector(".slide--ai .ai-stage"); }

  // ---- chat helpers ----
  function clearLog() { var l = $("ai-log"); if (l) l.innerHTML = ""; }
  function addBubble(cls, html) {
    var l = $("ai-log");
    if (!l) return null;
    var b = document.createElement("div");
    b.className = "ai-bubble " + cls;
    b.innerHTML = html;
    l.appendChild(b);
    return b;
  }
  function setInput(text) { var el = $("ai-input"); if (el) el.textContent = text; }
  function fireSend() {
    var s = $("ai-send");
    if (!s) return;
    s.classList.add("is-fire");
    setTimeout(function () { s.classList.remove("is-fire"); }, 260);
  }
  async function typeInto(text, perChar, my) {
    for (var i = 1; i <= text.length; i++) {
      if (!alive(my)) return;
      setInput(text.slice(0, i));
      await sleep(perChar);
    }
  }
  // type request → send → push as a user bubble
  async function ask(text, my) {
    await typeInto(text, reduced() ? 0 : 50, my);
    if (!alive(my)) return;
    await sleep(reduced() ? 0 : 320);
    fireSend();
    addBubble("ai-bubble--user", text);
    setInput("");
    await sleep(reduced() ? 0 : 380);
  }
  // AI "thinking" dots → removed when done
  async function think(my, ms) {
    var t = addBubble("ai-bubble--ai ai-bubble--typing",
      '<span class="ai-typing"><span></span><span></span><span></span></span>');
    await sleep(reduced() ? 0 : ms);
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }
  function reply(html) { addBubble("ai-bubble--ai", html); }

  // ---- build-pipeline helpers ----
  function setStep(id, state) {
    var el = $(id);
    if (!el) return;
    el.classList.remove("is-pending", "is-active", "is-done");
    el.classList.add("is-" + state);
    var stat = el.querySelector(".ai-step__stat");
    if (stat) stat.textContent = state === "done" ? "✓" : "";
  }

  // STEP 1 — entities pop into the data row
  async function fillDots(n, my) {
    var g = $("ai-data-dots");
    if (!g) return;
    g.innerHTML = "";
    for (var i = 0; i < n; i++) {
      if (!alive(my)) return;
      var d = document.createElement("i");
      d.style.animationDelay = (i * 0.05).toFixed(2) + "s";
      g.appendChild(d);
    }
    await sleep(reduced() ? 0 : n * 50 + 250);
  }

  // STEP 2 — type the key, then reveal the security badges
  async function typeKey(my) {
    var el = $("ai-key-val");
    if (!el) return;
    el.textContent = "";
    for (var i = 1; i <= KEY_VALUE.length; i++) {
      if (!alive(my)) return;
      el.textContent = KEY_VALUE.slice(0, i);
      await sleep(reduced() ? 0 : 26);
    }
    var key = $("ai-key");
    if (key) key.classList.add("is-on");
    await sleep(reduced() ? 0 : 250);
  }

  // STEP 3 — the app frame assembles: pins drop, list slides in, realtime on
  async function buildApp(my) {
    var app = $("ai-app");
    if (app) app.classList.add("is-on");
    await sleep(reduced() ? 0 : 350);
    if (!alive(my)) return;

    var pins = $("ai-app-pins");
    if (pins) {
      var html = "";
      for (var i = 0; i < APP_PINS.length; i++) {
        var p = APP_PINS[i];
        // outer <g> holds the position (SVG attr); inner .ai-pin runs the CSS
        // drop animation — keep them separate so the CSS transform doesn't
        // clobber the positioning translate.
        html +=
          '<g transform="translate(' + p[0] + ',' + p[1] + ')">' +
            '<g class="ai-pin" style="--d:' + (i * 0.08).toFixed(2) + 's">' +
              '<path d="M0,0 C-7,-10 -7,-17 0,-17 C7,-17 7,-10 0,0 Z" fill="#39d6c6"></path>' +
              '<circle cx="0" cy="-11.5" r="3.4" fill="#0d0d14"></circle>' +
            '</g>' +
          '</g>';
      }
      pins.innerHTML = html;
    }
    await sleep(reduced() ? 0 : 350);
    if (!alive(my)) return;

    var side = $("ai-app-side");
    if (side) {
      side.innerHTML = "";
      for (var j = 0; j < APP_ITEMS.length; j++) {
        if (!alive(my)) return;
        var it = document.createElement("div");
        it.className = "ai-app__item";
        it.style.animationDelay = (j * 0.12).toFixed(2) + "s";
        it.innerHTML = '<span class="ai-app__bullet"></span>' + APP_ITEMS[j];
        side.appendChild(it);
      }
      var more = document.createElement("div");
      more.className = "ai-app__more";
      more.style.animationDelay = "0.4s";
      more.textContent = "ほか 7 件";
      side.appendChild(more);
      var live = document.createElement("div");
      live.className = "ai-app__live";
      live.innerHTML = '<span class="dot"></span>リアルタイム更新中';
      side.appendChild(live);
      await sleep(reduced() ? 0 : 500);
      live.classList.add("is-on");
    }
    await sleep(reduced() ? 0 : 350);
  }

  // ---- reset everything between loops ----
  function reset() {
    clearLog(); setInput("");
    var caret = $("ai-caret"); if (caret) caret.style.display = "";
    setStep("ai-step-data", "pending");
    setStep("ai-step-key", "pending");
    setStep("ai-step-app", "pending");
    var dots = $("ai-data-dots"); if (dots) dots.innerHTML = "";
    var tag = $("ai-data-tag"); if (tag) tag.textContent = "";
    var keyVal = $("ai-key-val"); if (keyVal) keyVal.textContent = "";
    var key = $("ai-key"); if (key) key.classList.remove("is-on");
    var app = $("ai-app"); if (app) app.classList.remove("is-on");
    var pins = $("ai-app-pins"); if (pins) pins.innerHTML = "";
    var side = $("ai-app-side"); if (side) side.innerHTML = "";
  }

  // ---- one full story ----
  async function runStory(my) {
    reset();
    var hold = reduced() ? 1200 : 3400;

    // STEP 1 — create data
    await ask("避難所のデータを作って", my); if (!alive(my)) return;
    setStep("ai-step-data", "active");
    await think(my, 800); if (!alive(my)) return;
    reply('<span class="ai-ok">✓</span>避難所を <strong>10 件</strong> 作成しました');
    await fillDots(10, my); if (!alive(my)) return;
    var tag = $("ai-data-tag"); if (tag) tag.textContent = "10 件";
    setStep("ai-step-data", "done");
    await sleep(reduced() ? 0 : 480); if (!alive(my)) return;

    // STEP 2 — issue API key
    await ask("アプリからアクセスするための API キーを発行して", my); if (!alive(my)) return;
    setStep("ai-step-key", "active");
    await think(my, 800); if (!alive(my)) return;
    reply('<span class="ai-ok">✓</span>API キーを発行しました <span class="ai-mini">DPoP必須・origin制限</span>');
    await typeKey(my); if (!alive(my)) return;
    setStep("ai-step-key", "done");
    await sleep(reduced() ? 0 : 480); if (!alive(my)) return;

    // STEP 3 — build the app
    await ask("避難所のアプリを作って", my); if (!alive(my)) return;
    setStep("ai-step-app", "active");
    await think(my, 900); if (!alive(my)) return;
    reply('<span class="ai-ok">✓</span>避難所マップアプリができました');
    await buildApp(my); if (!alive(my)) return;
    setStep("ai-step-app", "done");

    // hold, then fade out and reset for the next loop
    await sleep(hold); if (!alive(my)) return;
    var stage = stageEl();
    if (stage && !reduced()) { stage.style.opacity = "0"; await sleep(400); }
    if (!alive(my)) { if (stage) stage.style.opacity = ""; return; }
    reset();
    if (stage) stage.style.opacity = "";
  }

  async function loop() {
    var my = gen;
    while (alive(my)) await runStory(my);
  }

  function start() {
    if (running) return;
    running = true;
    gen++;
    var stage = stageEl(); if (stage) stage.style.opacity = "";
    reset();
    loop();
  }
  function stop() {
    if (!running) return;
    running = false;
    gen++; // cancels the in-flight loop at its next alive() check
    var stage = stageEl(); if (stage) stage.style.opacity = "";
    reset();
  }

  document.addEventListener("slidechange", function (e) {
    if (!e.detail) return;
    if (e.detail.index === AI_SLIDE_INDEX) start();
    else stop();
  });
})();
