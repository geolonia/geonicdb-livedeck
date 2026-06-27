/* ===================================================================
   Slide 11 — Live poll demo
   GeonicDB SDK (DPoP / PoW token exchange) + WebSocket.
   Each vote (left) creates a PollVote entity; the aggregated bar chart
   (right) tallies every viewer's vote in real time via WS entityCreated.
   =================================================================== */
(function () {
  "use strict";

  var CONFIG = {
    baseUrl: "https://geonicdb.geolonia.com",
    tenant: "miya",
    // DPoP-required, origin-restricted key. Policy `presentation-survey`
    // permits GET + WS streaming + POST limited to PollVote in miya.
    apiKey: "gdb_a9d30ecf8ec3dfc402dd45549c5894588206150e72e6d83463763dc11b0903a8",
    type: "PollVote",
    poll: "features-2026", // poll id this slide aggregates
  };
  var SVY_SLIDE_INDEX = 11; // 0-based index of the survey slide (shifted +1 after the Temporal slide)

  // The options shown + their bar colors (must match the buttons in index.html).
  var OPTIONS = [
    { choice: "geoquery", label: "ジオクエリ", color: "#fc6c00" },
    { choice: "realtime", label: "リアルタイム通知", color: "#fba40c" },
    { choice: "reactivecore", label: "ReactiveCore Rules", color: "#39d6c6" },
    { choice: "standards", label: "標準準拠（NGSI-LD）", color: "#e8401e" },
  ];

  var db = null;
  var started = false;
  var seen = Object.create(null);         // vote id -> true (dedupe)
  var counts = Object.create(null);       // choice -> count
  OPTIONS.forEach(function (o) { counts[o.choice] = 0; });

  function $(id) { return document.getElementById(id); }
  function attrVal(a) { return a && typeof a === "object" && "value" in a ? a.value : a; }
  function field(e, name) { return e ? attrVal(e[name]) : undefined; }
  function total() { return OPTIONS.reduce(function (s, o) { return s + counts[o.choice]; }, 0); }

  // ---- connection indicator ----
  function setConn(state) {
    var dot = $("svy-dot"), conn = $("svy-conn");
    if (!dot || !conn) return;
    dot.className = "rsv-live__dot rsv-live__dot--" + state;
    conn.textContent =
      state === "on" ? "リアルタイム接続中" :
      state === "off" ? "切断 — 再接続中…" : "接続中…";
  }
  function setMsg(text, kind) {
    var el = $("svy-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "svy-msg" + (kind ? " svy-msg--" + kind : "");
  }

  // ---- build the chart rows once, then just update widths/labels ----
  function buildChart() {
    var chart = $("svy-chart");
    if (!chart || chart.childElementCount) return;
    chart.innerHTML = OPTIONS.map(function (o) {
      return (
        '<div class="svy-row" data-choice="' + o.choice + '">' +
          '<div class="svy-row__head">' +
            '<span class="svy-row__label">' + o.label + "</span>" +
            '<span class="svy-row__val"><span class="svy-row__n">0</span>' +
              '<span class="svy-row__pct">0%</span></span>' +
          "</div>" +
          '<div class="svy-bar"><div class="svy-bar__fill" style="background:' +
            o.color + '"></div></div>' +
        "</div>"
      );
    }).join("");
  }

  function render() {
    buildChart();
    var t = total();
    var tot = $("svy-total");
    if (tot) tot.textContent = t ? "（" + t + " 票）" : "";
    OPTIONS.forEach(function (o) {
      var row = document.querySelector('.svy-row[data-choice="' + o.choice + '"]');
      if (!row) return;
      var n = counts[o.choice];
      var pct = t > 0 ? Math.round((n / t) * 100) : 0;
      row.querySelector(".svy-row__n").textContent = n;
      row.querySelector(".svy-row__pct").textContent = pct + "%";
      row.querySelector(".svy-bar__fill").style.width = pct + "%";
    });
  }

  // ---- tally one vote (idempotent by id) ----
  function tally(e) {
    if (!e || !e.id || seen[e.id]) return false;
    if (field(e, "poll") !== CONFIG.poll) return false; // other polls' votes
    var c = field(e, "choice");
    if (!(c in counts)) return false;
    seen[e.id] = true;
    counts[c] += 1;
    return true;
  }

  function evtEntity(evt) {
    if (!evt) return null;
    if (evt.entity && evt.entity.id) return evt.entity;
    var e = {};
    if (evt.data) for (var k in evt.data) e[k] = evt.data[k];
    e.id = evt.entityId;
    e.type = evt.entityType || CONFIG.type;
    return e.id ? e : null;
  }

  function onCreated(evt) {
    var e = evtEntity(evt);
    if (tally(e)) {
      var row = document.querySelector('.svy-row[data-choice="' + field(e, "choice") + '"]');
      if (row) { row.classList.remove("is-bump"); void row.offsetWidth; row.classList.add("is-bump"); }
      render();
    }
  }

  // ---- initial load over REST ----
  function load() {
    return db.getEntities({ type: CONFIG.type, limit: 1000 }).then(function (res) {
      var list = Array.isArray(res) ? res : (res && res.entities) || [];
      list.forEach(tally);
      render();
    });
  }

  function connect() {
    db.on("entityCreated", onCreated);
    db.on("connected", function () { setConn("on"); });
    db.on("open", function () { setConn("on"); });
    db.on("disconnected", function () { setConn("off"); });
    db.on("close", function () { setConn("off"); });
    db.on("error", function (err) { console.warn("[survey] ws", err); });
    db.subscribe({ entityTypes: [CONFIG.type] });
    db.connect().catch(function (err) {
      console.warn("[survey] connect failed", err);
      setConn("off");
    });
  }

  function genId() {
    var r = "";
    for (var i = 0; i < 10; i++) r += Math.floor(Math.random() * 36).toString(36);
    return "urn:ngsi-ld:PollVote:" + Date.now().toString(36) + "-" + r;
  }

  // ---- cast a vote ----
  function vote(choice) {
    if (!db || !(choice in counts)) return;
    var entity = {
      id: genId(),
      type: CONFIG.type,
      poll: { type: "Property", value: CONFIG.poll },
      choice: { type: "Property", value: choice },
    };
    db.createEntity(entity).then(function () {
      // optimistic local tally; the WS echo (same id) is idempotent via `seen`.
      // The animated bar bump is the feedback — no confirmation message.
      onCreated({ entityId: entity.id, entityType: CONFIG.type, entity: entity });
    }).catch(function (err) {
      setMsg("失敗: " + (err && err.message ? err.message : err), "err");
    });
  }

  function onOptionsClick(ev) {
    var btn = ev.target.closest && ev.target.closest(".svy-opt");
    if (!btn) return;
    var choice = btn.getAttribute("data-choice");
    // briefly flash the chosen button
    var opts = $("svy-options");
    if (opts) Array.prototype.forEach.call(opts.querySelectorAll(".svy-opt"), function (b) {
      b.classList.toggle("is-chosen", b === btn);
    });
    vote(choice);
  }

  function start() {
    if (started) return;
    started = true;
    buildChart();
    render();
    if (typeof window.GeonicDB !== "function") {
      setMsg("GeonicDB SDK が読み込まれていません", "err");
      return;
    }
    db = new window.GeonicDB({ apiKey: CONFIG.apiKey, tenant: CONFIG.tenant, baseUrl: CONFIG.baseUrl });
    load().then(connect).catch(function (err) {
      console.error("[survey]", err);
      setMsg("読み込み失敗: " + (err && err.message ? err.message : err), "err");
      connect();
    });
    var opts = $("svy-options");
    if (opts) opts.addEventListener("click", onOptionsClick);
  }

  document.addEventListener("slidechange", function (e) {
    if (e.detail && e.detail.index === SVY_SLIDE_INDEX) start();
  });
})();
