/* ===================================================================
   Slide 5 — AI-native demo (scripted animation, no live API).
   The user types a natural-language request in the chat; the AI agent
   "replies" and the requested data drops onto the map as markers.
   Loops through a few disaster-prevention scenarios.
   =================================================================== */
(function () {
  "use strict";

  var AI_SLIDE_INDEX = 4; // 0-based index of the AI-native slide

  // Marker tip positions on the stylized map (viewBox 620x460), spread so the
  // first N of each scenario scatter nicely near the roads.
  var POINTS = [
    [120, 120], [260, 95], [400, 135], [520, 105],
    [95, 255], [215, 235], [360, 250], [500, 235],
    [150, 360], [300, 345], [440, 365], [560, 330]
  ];

  // Three request patterns (disaster-prevention theme). verb matches the prompt.
  var PATTERNS = [
    { prompt: "避難所を地図に登録して", verb: "登録", noun: "避難所", icon: "🏠", color: "#39d6c6", n: 10 },
    { prompt: "冠水センサーを配置して", verb: "配置", noun: "冠水センサー", icon: "💧", color: "#3aa0ff", n: 8 },
    { prompt: "AED設置場所を公開して", verb: "公開", noun: "AED設置場所", icon: "✚", color: "#fc6c00", n: 9 }
  ];

  var gen = 0;        // bumped to cancel an in-flight loop when leaving the slide
  var running = false;

  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function reduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

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
  function addTyping() {
    return addBubble("ai-bubble--ai ai-bubble--typing",
      '<span class="ai-typing"><span></span><span></span><span></span></span>');
  }

  function setInput(text) { var el = $("ai-input"); if (el) el.textContent = text; }
  function setCaret(on) { var c = $("ai-caret"); if (c) c.style.display = on ? "" : "none"; }

  async function typeInto(text, perChar, my) {
    for (var i = 1; i <= text.length; i++) {
      if (my !== gen) return;
      setInput(text.slice(0, i));
      await sleep(perChar);
    }
  }

  // ---- map helpers ----
  function clearMarkers() {
    var g = $("ai-markers");
    if (g) { g.style.opacity = ""; g.innerHTML = ""; }
  }
  function markerSVG(pt, p, i) {
    return (
      '<g class="ai-mk" transform="translate(' + pt[0] + ',' + pt[1] + ')">' +
        '<g class="ai-mk__drop" style="--d:' + (i * 0.1).toFixed(2) + 's">' +
          '<ellipse class="ai-mk__shadow" cx="0" cy="1.5" rx="8" ry="3"></ellipse>' +
          '<path class="ai-mk__pin" d="M0,0 C-12,-17 -12,-30 0,-30 C12,-30 12,-17 0,0 Z" fill="' + p.color + '"></path>' +
          '<circle class="ai-mk__head" cx="0" cy="-20" r="9.5" fill="#fff"></circle>' +
          '<text class="ai-mk__icon" x="0" y="-20" text-anchor="middle" dominant-baseline="central" font-size="12">' + p.icon + '</text>' +
        '</g>' +
      '</g>'
    );
  }
  function dropMarkers(p) {
    var g = $("ai-markers");
    if (!g) return;
    var html = "";
    for (var i = 0; i < p.n && i < POINTS.length; i++) html += markerSVG(POINTS[i], p, i);
    g.innerHTML = html;
  }
  function setBadge(p) {
    var el = $("ai-badge");
    if (!el) return;
    if (!p) { el.classList.remove("is-on"); el.innerHTML = ""; return; }
    el.innerHTML = p.noun + ' <span class="ai-map__n">' + p.n + " 件</span>";
    el.classList.add("is-on");
  }

  function fireSend() {
    var s = $("ai-send");
    if (!s) return;
    s.classList.add("is-fire");
    setTimeout(function () { s.classList.remove("is-fire"); }, 260);
  }

  function resetVisuals() {
    clearLog(); clearMarkers(); setBadge(null); setInput(""); setCaret(true);
    var s = $("ai-send"); if (s) s.classList.remove("is-fire");
  }

  // ---- one scenario ----
  async function runPattern(p, my) {
    if (my !== gen) return;
    clearLog(); clearMarkers(); setBadge(null);

    var fast = reduced();

    // 1. type the request into the input bar
    setCaret(true);
    await typeInto(p.prompt, fast ? 0 : 55, my);
    if (my !== gen) return;
    await sleep(fast ? 0 : 340);

    // 2. "send" — the request becomes a user bubble, input clears
    fireSend();
    addBubble("ai-bubble--user", p.prompt);
    setInput("");
    await sleep(fast ? 0 : 430);
    if (my !== gen) return;

    // 3. AI typing indicator
    var typing = addTyping();
    await sleep(fast ? 0 : 850);
    if (my !== gen) return;
    if (typing && typing.parentNode) typing.parentNode.removeChild(typing);

    // 4. AI reply + markers drop onto the map
    addBubble("ai-bubble--ai",
      '<span class="ai-ok">✓</span>' + p.noun + "を <strong>" + p.n + " 件</strong>、地図に" + p.verb + "しました");
    dropMarkers(p);
    await sleep(fast ? 0 : 300 + p.n * 100 + 350);
    if (my !== gen) return;
    setBadge(p);

    // 5. hold, then fade the markers out before the next scenario
    await sleep(fast ? 1200 : 2600);
    if (my !== gen) return;
    var g = $("ai-markers");
    if (g && !fast) { g.style.opacity = "0"; await sleep(400); }
    if (my !== gen) return;
    clearMarkers(); setBadge(null);
  }

  async function loop() {
    var my = gen;
    var k = 0;
    while (my === gen) {
      await runPattern(PATTERNS[k % PATTERNS.length], my);
      k++;
    }
  }

  function start() {
    if (running) return;
    running = true;
    gen++;
    resetVisuals();
    loop();
  }
  function stop() {
    if (!running) return;
    running = false;
    gen++; // cancels the in-flight loop at its next await check
    resetVisuals();
  }

  document.addEventListener("slidechange", function (e) {
    if (!e.detail) return;
    if (e.detail.index === AI_SLIDE_INDEX) start();
    else stop();
  });
})();
