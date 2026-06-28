/* ===================================================================
   Slide 9a — Entity API, dual protocol
   GeonicDB SDK (DPoP). Fetches the SAME entity through both standard APIs
   — NGSI-LD (/ngsi-ld/v1/entities/{id}) and NGSIv2 (/v2/entities/{id}) —
   and shows the two raw responses side by side. Read-only (reuses the AED
   readonly key; its policy permits GET on both /ngsi-ld/** and /v2/**).
   =================================================================== */
(function () {
  "use strict";

  // values come from config.js (window.DECK_CONFIG). GeonicDB keeps NGSIv2 and
  // NGSI-LD entities in separate spaces, so this demo shows one real entity per
  // protocol (one broker serving both APIs).
  var CFG = window.DECK_CONFIG || {};
  var DD = (CFG.demos || {}).dual || {};
  var CONFIG = {
    baseUrl: CFG.baseUrl,
    tenant: CFG.tenant,
    apiKey: (CFG.keys || {}).readonly,
    ldId: DD.ldId,
    v2Id: DD.v2Id,
  };
  // 0-based index of this demo slide, derived from its class so slide reordering can't break it
  var DUAL_SLIDE_INDEX = Array.prototype.indexOf.call(document.querySelectorAll(".slide"), document.querySelector(".slide--dual"));

  var db = null, started = false, running = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  // Minimal JSON syntax highlight (keys / strings / numbers / literals).
  function hl(obj) {
    var json = esc(JSON.stringify(obj, null, 2));
    return json.replace(
      /("(\\.|[^"\\])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
      function (m) {
        var cls = "j-num";
        if (/^"/.test(m)) cls = /:$/.test(m) ? "j-key" : "j-str";
        else if (/true|false|null/.test(m)) cls = "j-lit";
        return '<span class="' + cls + '">' + m + "</span>";
      }
    );
  }

  function setReq() {
    if ($("dual-ld-req")) $("dual-ld-req").textContent = "GET /ngsi-ld/v1/entities/" + CONFIG.ldId;
    if ($("dual-v2-req")) $("dual-v2-req").textContent = "GET /v2/entities/" + CONFIG.v2Id;
  }

  function flash(el, html) {
    if (!el) return;
    el.innerHTML = html;
    el.classList.remove("is-fresh"); void el.offsetWidth; el.classList.add("is-fresh");
  }

  function run() {
    if (!db || running) return;
    running = true;
    var btn = $("dual-run");
    if (btn) { btn.disabled = true; btn.textContent = "取得中…"; }
    if ($("dual-ld-json")) $("dual-ld-json").textContent = "取得中…";
    if ($("dual-v2-json")) $("dual-v2-json").textContent = "取得中…";

    // NGSI-LD route decodes %xx, so encode the URN id. The NGSIv2 route does
    // not, so the v2 id deliberately has no characters needing encoding.
    var ld = db.request("GET", "/ngsi-ld/v1/entities/" + encodeURIComponent(CONFIG.ldId));
    var v2 = db.request("GET", "/v2/entities/" + CONFIG.v2Id);

    ld.then(function (r) { flash($("dual-ld-json"), hl(r)); })
      .catch(function (e) { if ($("dual-ld-json")) $("dual-ld-json").textContent = "エラー: " + (e && e.message ? e.message : e); });

    v2.then(function (r) { flash($("dual-v2-json"), hl(r)); })
      .catch(function (e) { if ($("dual-v2-json")) $("dual-v2-json").textContent = "エラー: " + (e && e.message ? e.message : e); });

    (window.Promise ? Promise.all([ld, v2]).catch(function () {}) : ld).then(function () {
      running = false;
      if (btn) { btn.disabled = false; btn.textContent = "↻ 再取得"; }
    });
  }

  function start() {
    if (started) return;
    started = true;
    setReq();
    if (typeof window.GeonicDB !== "function") {
      if ($("dual-entity")) $("dual-entity").textContent = "GeonicDB SDK が読み込まれていません";
      return;
    }
    db = new window.GeonicDB({ apiKey: CONFIG.apiKey, tenant: CONFIG.tenant, baseUrl: CONFIG.baseUrl });
    run(); // auto-fetch once on first open
    var btn = $("dual-run");
    if (btn) btn.addEventListener("click", run);
  }

  function whenIdle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 800 });
    else setTimeout(fn, 600);
  }

  document.addEventListener("slidechange", function (e) {
    if (!e.detail) return;
    var i = e.detail.index;
    if (i === DUAL_SLIDE_INDEX - 1) whenIdle(start); // prefetch one slide early
    else if (i === DUAL_SLIDE_INDEX) start();
  });
})();
