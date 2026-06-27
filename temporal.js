/* ===================================================================
   Slide 10 — Temporal "time machine"
   GeonicDB SDK (DPoP) + Temporal API. Fetches the recorded history of a
   WeatherObserved entity and lets you scrub back through time: the chart
   plots the whole day, the slider picks an instant, and the snapshot card
   shows the state at that moment. Read-only (reuses the AED readonly key).
   =================================================================== */
(function () {
  "use strict";

  var CONFIG = {
    baseUrl: "https://geonicdb.geolonia.com",
    tenant: "miya",
    // readonly DPoP key (policy presentation-aed-readonly: GET on /ngsi-ld/**)
    apiKey: "gdb_fc49b6790379e8d28bddb21801b597dcbb8a721e498ce30c8a94b1bea0faa9d4",
    entityId: "urn:ngsi-ld:WeatherObserved:takamatsu-1",
    from: "2026-06-26T00:00:00Z",
    to: "2026-06-27T00:30:00Z",
  };
  var TMP_SLIDE_INDEX = 9; // 0-based index of slide 10 (this demo)

  var db = null, started = false;
  var series = [];     // [{iso, date, time, temp, hum}]
  var sel = 0;
  var playTimer = null;

  function $(id) { return document.getElementById(id); }
  function attrVal(a) { return a && typeof a === "object" && "value" in a ? a.value : a; }

  function setConn(state) {
    var dot = $("tmp-dot"), conn = $("tmp-conn");
    if (!dot || !conn) return;
    dot.className = "rsv-live__dot rsv-live__dot--" + state;
    conn.textContent = state === "on" ? "Temporal API 接続" : state === "off" ? "取得失敗" : "接続中…";
  }

  // NGSI-LD temporal instances → sorted [{iso,date,time,value}]
  function instances(attr) {
    var arr = Array.isArray(attr) ? attr : (attr ? [attr] : []);
    return arr.map(function (i) {
      var iso = i.observedAt || (i.value && i.value.observedAt);
      return { iso: iso, v: Number(attrVal(i)) };
    }).filter(function (x) { return x.iso != null && !isNaN(x.v); })
      .sort(function (a, b) { return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0; });
  }

  function buildSeries(entity) {
    var temps = instances(entity.temperature);
    var hums = instances(entity.humidity);
    var humAt = Object.create(null);
    hums.forEach(function (h) { humAt[h.iso] = h.v; });
    series = temps.map(function (t) {
      return {
        iso: t.iso,
        date: t.iso.slice(5, 10).replace("-", "/"),
        time: t.iso.slice(11, 16),
        temp: t.v,
        hum: humAt[t.iso],
      };
    });
  }

  // ---- chart ----
  var VB_W = 760, VB_H = 360, PL = 46, PR = 16, PT = 18, PB = 30;
  function xAt(i) { return PL + (series.length < 2 ? 0 : (i / (series.length - 1)) * (VB_W - PL - PR)); }
  var tMin, tMax;
  function yAt(v) {
    var span = (tMax - tMin) || 1;
    return (VB_H - PB) - ((v - tMin) / span) * (VB_H - PT - PB);
  }

  function drawChart() {
    var svg = $("tmp-chart");
    if (!svg || !series.length) return;
    var temps = series.map(function (s) { return s.temp; });
    tMin = Math.floor(Math.min.apply(null, temps) - 1);
    tMax = Math.ceil(Math.max.apply(null, temps) + 1);

    var line = "", area = "";
    series.forEach(function (s, i) {
      var x = xAt(i).toFixed(1), y = yAt(s.temp).toFixed(1);
      line += (i ? " L" : "M") + x + "," + y;
    });
    area = line + " L" + xAt(series.length - 1).toFixed(1) + "," + (VB_H - PB) +
           " L" + xAt(0).toFixed(1) + "," + (VB_H - PB) + " Z";

    // y grid labels (min, mid, max)
    var yl = "";
    [tMin, Math.round((tMin + tMax) / 2), tMax].forEach(function (v) {
      var y = yAt(v).toFixed(1);
      yl += '<line x1="' + PL + '" y1="' + y + '" x2="' + (VB_W - PR) + '" y2="' + y +
            '" stroke="rgba(255,255,255,.08)" stroke-width="1"/>' +
            '<text x="' + (PL - 8) + '" y="' + (+y + 4) + '" text-anchor="end" fill="rgba(255,255,255,.45)" font-size="12" font-family="var(--font-mono)">' + v + '°</text>';
    });
    // x hour labels (every 6h)
    var xl = "";
    series.forEach(function (s, i) {
      var hh = +s.time.slice(0, 2);
      if (s.time.slice(3) === "00" && hh % 6 === 0) {
        xl += '<text x="' + xAt(i).toFixed(1) + '" y="' + (VB_H - 8) + '" text-anchor="middle" fill="rgba(255,255,255,.45)" font-size="12" font-family="var(--font-mono)">' + s.time + "</text>";
      }
    });

    svg.innerHTML =
      '<defs><linearGradient id="tmpFill" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fc6c00" stop-opacity="0.42"/>' +
        '<stop offset="1" stop-color="#fc6c00" stop-opacity="0"/></linearGradient></defs>' +
      yl + xl +
      '<path d="' + area + '" fill="url(#tmpFill)"/>' +
      '<path d="' + line + '" fill="none" stroke="#fc6c00" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<line id="tmp-marker" x1="0" y1="' + PT + '" x2="0" y2="' + (VB_H - PB) + '" stroke="#39d6c6" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<circle id="tmp-dot-pt" r="6" fill="#39d6c6" stroke="#0a0f1c" stroke-width="2"/>';
    moveMarker();
  }

  function moveMarker() {
    var mk = $("tmp-marker"), pt = $("tmp-dot-pt");
    if (!mk || !pt || !series[sel]) return;
    var x = xAt(sel), y = yAt(series[sel].temp);
    mk.setAttribute("x1", x); mk.setAttribute("x2", x);
    pt.setAttribute("cx", x); pt.setAttribute("cy", y);
  }

  function renderSnapshot() {
    var s = series[sel];
    if (!s) return;
    if ($("tmp-time")) $("tmp-time").textContent = s.date + " " + s.time;
    if ($("tmp-temp")) $("tmp-temp").textContent = s.temp.toFixed(1);
    if ($("tmp-hum")) $("tmp-hum").textContent = s.hum != null ? Math.round(s.hum) : "--";
    if ($("tmp-query")) {
      $("tmp-query").textContent =
        "GET /ngsi-ld/v1/temporal/entities/\n" +
        "  " + CONFIG.entityId.split(":").pop() + "\n" +
        "  ?timerel=before&timeAt=" + s.iso + "\n" +
        "  &attrs=temperature,humidity";
    }
    moveMarker();
  }

  function setSel(i) {
    sel = Math.max(0, Math.min(series.length - 1, i | 0));
    var sl = $("tmp-slider");
    if (sl && +sl.value !== sel) sl.value = sel;
    renderSnapshot();
  }

  function play() {
    var btn = $("tmp-play");
    if (playTimer) { stop(); return; }
    if (sel >= series.length - 1) setSel(0);
    if (btn) btn.textContent = "⏸ 停止";
    playTimer = setInterval(function () {
      if (sel >= series.length - 1) { stop(); return; }
      setSel(sel + 1);
    }, 160);
  }
  function stop() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    var btn = $("tmp-play");
    if (btn) btn.textContent = "▶ 再生";
  }

  function load() {
    var path = "/ngsi-ld/v1/temporal/entities/" + encodeURIComponent(CONFIG.entityId) +
      "?timerel=between&timeAt=" + encodeURIComponent(CONFIG.from) +
      "&endTimeAt=" + encodeURIComponent(CONFIG.to);
    return db.request("GET", path).then(function (res) {
      var ent = Array.isArray(res) ? res[0] : res;
      if (!ent) throw new Error("no temporal data");
      buildSeries(ent);
      if (!series.length) throw new Error("empty series");
      setConn("on");
      var sl = $("tmp-slider");
      if (sl) { sl.max = String(series.length - 1); sl.value = String(series.length - 1); }
      if ($("tmp-range")) $("tmp-range").textContent = "（" + series[0].time + "〜" + series[series.length - 1].time + " / " + series.length + "点）";
      drawChart();
      setSel(series.length - 1);
    });
  }

  function start() {
    if (started) return;
    started = true;
    if (typeof window.GeonicDB !== "function") { setConn("off"); return; }
    db = new window.GeonicDB({ apiKey: CONFIG.apiKey, tenant: CONFIG.tenant, baseUrl: CONFIG.baseUrl });
    load().catch(function (err) {
      console.error("[temporal]", err);
      setConn("off");
      if ($("tmp-query")) $("tmp-query").textContent = "取得に失敗しました: " + (err && err.message ? err.message : err);
    });
    var sl = $("tmp-slider");
    if (sl) sl.addEventListener("input", function () { stop(); setSel(+sl.value); });
    var btn = $("tmp-play");
    if (btn) btn.addEventListener("click", play);
  }

  document.addEventListener("slidechange", function (e) {
    if (!e.detail) return;
    var i = e.detail.index;
    // Prefetch + draw one slide early so arriving here is instant.
    if (i === TMP_SLIDE_INDEX - 1 || i === TMP_SLIDE_INDEX) start();
    else stop(); // pause playback when leaving the slide
  });
})();
