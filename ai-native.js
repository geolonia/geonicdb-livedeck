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

  // app-preview shelter pin positions (viewBox 360x220), kept clear of the
  // search bar (top) and the count chip / FAB (bottom corners).
  var APP_PINS = [[70, 78], [160, 66], [250, 84], [320, 74], [110, 128], [205, 116], [292, 134], [150, 168]];
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

  // ---- browser-preview helpers ----

  // The final request loads the app inside the browser: a progress sweep, then
  // the map renders — pins drop in, the list slides in, realtime turns on.
  async function loadApp(my) {
    var prog = $("ai-progress");
    if (prog) prog.classList.add("is-on"); // sweep the loading bar
    await sleep(reduced() ? 0 : 700);
    if (!alive(my)) return;

    var ph = $("ai-ph"); if (ph) ph.classList.add("is-hidden");
    var app = $("ai-app");
    if (app) app.classList.add("is-on");
    if (prog) { prog.classList.remove("is-on"); prog.classList.add("is-done"); }
    await sleep(reduced() ? 0 : 320);
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
  }

  // ---- reset everything between loops ----
  function reset() {
    clearLog(); setInput("");
    var caret = $("ai-caret"); if (caret) caret.style.display = "";
    var ph = $("ai-ph"); if (ph) ph.classList.remove("is-hidden");
    var prog = $("ai-progress"); if (prog) prog.classList.remove("is-on", "is-done");
    var app = $("ai-app"); if (app) app.classList.remove("is-on");
    var pins = $("ai-app-pins"); if (pins) pins.innerHTML = "";
  }

  // ---- one full story ----
  async function runStory(my) {
    reset();
    var hold = reduced() ? 800 : 1500;

    // STEP 1 — create data
    await ask("避難所のデータを作って", my); if (!alive(my)) return;
    await think(my, 800); if (!alive(my)) return;
    reply('<span class="ai-ok">✓</span>避難所を <strong>10 件</strong> 作成しました');
    await sleep(reduced() ? 0 : 620); if (!alive(my)) return;

    // STEP 2 — issue API key (shown inline in the chat)
    await ask("アプリのためのAPIキーを発行して", my); if (!alive(my)) return;
    await think(my, 800); if (!alive(my)) return;
    reply('<span class="ai-ok">✓</span>API キーを発行しました<br><code class="ai-key">' + KEY_VALUE + '</code> <span class="ai-mini">DPoP必須・origin制限</span>');
    await sleep(reduced() ? 0 : 620); if (!alive(my)) return;

    // STEP 3 — build the app → it loads in the browser
    await ask("避難所のアプリを作って", my); if (!alive(my)) return;
    await think(my, 900); if (!alive(my)) return;
    reply('<span class="ai-ok">✓</span>避難所マップアプリができました');
    await loadApp(my); if (!alive(my)) return;

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
