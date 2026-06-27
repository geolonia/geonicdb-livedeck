/* ===================================================================
   Slide 5 — Live AED map
   Geolonia Maps (MapLibre GL) + GeonicDB SDK (DPoP / PoW token exchange)
   Renders the `AedLocation` entity type from the `miya` tenant, with
   clustered counts and live WebSocket updates (mirrors geonicdb-pulse).
   =================================================================== */
(function () {
  "use strict";

  var CONFIG = {
    baseUrl: "https://geonicdb.geolonia.com",
    tenant: "miya",
    // DPoP-required, readonly (presentation-aed-readonly policy), origin-restricted key.
    apiKey: "gdb_fc49b6790379e8d28bddb21801b597dcbb8a721e498ce30c8a94b1bea0faa9d4",
    type: "AedLocation",
    limit: 1000,
    center: [134.0475, 34.34], // 高松市あたり。fitToData() が実データに合わせて調整
    zoom: 11,
  };
  var MAP_SLIDE_INDEX = 8; // 0-based index of slide 9 (the live demo slide)

  var GL = null;
  var map = null;
  var db = null;
  var byId = Object.create(null); // entity id -> NGSI-LD entity
  var started = false;     // map initialized
  var dataStarted = false; // entity fetch kicked off (prefetch or on map init)
  // geo-query (near) state
  var geoCenter = null;           // [lng, lat] or null
  var geoRadiusKm = 10;
  var pickMode = false;
  var geoActive = false;          // a near-query filter is currently applied
  var geoCount = null;            // # entities rendered for the active near-query
  var geoTotal = null;            // # entities matching the near-query (NGSILD-Results-Count)
  var mapEl = null;
  var total = null;     // total entity count (from db.count)
  var loading = true;   // true while paginating

  // pulse-style count / progress indicator (bottom-center of the map)
  var countEl = null, countBar = null, countText = null;
  function countRefs() {
    if (countEl) return;
    countEl = document.getElementById("aed-count");
    countBar = document.getElementById("aed-count-bar");
    countText = document.getElementById("aed-count-text");
  }
  function setStatus(msg, isError) {
    countRefs();
    if (!countEl) return;
    countEl.classList.add("visible");
    countEl.classList.remove("done");
    countEl.classList.toggle("is-error", !!isError);
    if (countBar) countBar.style.width = "0%";
    if (countText) countText.textContent = msg;
  }
  function setCountStatus() {
    countRefs();
    if (!countEl) return;
    countEl.classList.add("visible");
    countEl.classList.remove("is-error");
    // While a near-query filter is active, the map only shows the in-radius
    // subset — so report that count (not the full loaded set) to match what's
    // actually drawn.
    var inGeo = geoActive && geoCount != null;
    var n = inGeo ? geoCount : Object.keys(byId).length;
    // denominator: the near-query's matching total while filtering, else the
    // full entity count.
    var denom = inGeo ? geoTotal : total;
    if (denom != null) {
      countText.textContent = (inGeo ? "範囲内 " : "") + n + " / " + denom;
      countBar.style.width = (denom > 0 ? Math.min(100, (n / denom) * 100) : 100) + "%";
    } else {
      countText.textContent = (inGeo ? "範囲内 " : "") + n + " 件";
    }
    countEl.classList.toggle("done", !loading);
    // keep the progress bar visible (as a 範囲内/全件 gauge) while filtering;
    // it otherwise fades out once initial loading is done.
    countEl.classList.toggle("is-geo", inGeo);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function attrVal(a) {
    return a && typeof a === "object" && "value" in a ? a.value : a;
  }
  function coordsOf(e) {
    var loc = e && e.location;
    var c = (loc && loc.value && loc.value.coordinates) || (loc && loc.coordinates);
    return c && c.length >= 2 ? [Number(c[0]), Number(c[1])] : null;
  }

  function emptyFC() { return { type: "FeatureCollection", features: [] }; }

  function toFeature(e) {
    var c = coordsOf(e);
    if (!c) return null;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: c },
      properties: {
        name: attrVal(e.name) || "(名称未設定)",
        address: attrVal(e.address) || "",
        info: attrVal(e.installationPosition) || "",
      },
    };
  }

  function toFC(entities) {
    var features = [];
    (entities || []).forEach(function (e) { var f = toFeature(e); if (f) features.push(f); });
    return { type: "FeatureCollection", features: features };
  }

  function buildGeoJSON() {
    return toFC(Object.keys(byId).map(function (id) { return byId[id]; }));
  }

  // ---- geo-query (NGSI-LD near) ----
  function setGeoResult(html) {
    var el = document.getElementById("geo-result");
    if (el) el.innerHTML = html;
  }

  // Show the actual NGSI-LD request that the near-query issues, reflecting the
  // current center + radius (updates live as they change).
  function updateQueryView() {
    var el = document.getElementById("geo-query");
    if (!el) return;
    var meters = Math.round(geoRadiusKm * 1000);
    var coords = geoCenter
      ? "[" + geoCenter[0].toFixed(5) + "," + geoCenter[1].toFixed(5) + "]"
      : "[地図で中心を指定]";
    el.textContent =
      "GET /ngsi-ld/v1/entities?type=" + CONFIG.type +
      "&georel=near;maxDistance==" + meters +
      "&geometry=Point&coordinates=" + coords;
  }

  // Point at a true geodesic distance/bearing from an origin (great-circle
  // destination formula). Building the ring from these points makes the drawn
  // boundary match the server's `near;maxDistance` (geodesic) exactly — in Web
  // Mercator it renders as a slight ellipse, which is the accurate equidistant shape.
  function destPoint(lng, lat, bearingDeg, distKm) {
    var R = 6371.0088; // mean Earth radius (km)
    var br = (bearingDeg * Math.PI) / 180;
    var dr = distKm / R;
    var lat1 = (lat * Math.PI) / 180;
    var lng1 = (lng * Math.PI) / 180;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
    var lng2 = lng1 + Math.atan2(
      Math.sin(br) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
    );
    return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
  }

  function circlePolygon(center, radiusKm, pts) {
    pts = pts || 96;
    var ring = [];
    for (var i = 0; i <= pts; i++) {
      ring.push(destPoint(center[0], center[1], (i / pts) * 360, radiusKm));
    }
    return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} }] };
  }

  function drawGeo() {
    if (!map) return;
    var circ = map.getSource("geo-circle");
    var cen = map.getSource("geo-center");
    if (geoCenter) {
      if (circ) circ.setData(circlePolygon(geoCenter, geoRadiusKm));
      if (cen) cen.setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: geoCenter }, properties: {} }] });
    } else {
      if (circ) circ.setData(emptyFC());
      if (cen) cen.setData(emptyFC());
    }
  }

  function fitToCircle() {
    if (!geoCenter || !GL) return;
    var b = new GL.LngLatBounds();
    circlePolygon(geoCenter, geoRadiusKm).features[0].geometry.coordinates[0].forEach(function (c) { b.extend(c); });
    map.fitBounds(b, { padding: 50, duration: 600 });
  }

  function setPick(on) {
    pickMode = on;
    var pick = document.getElementById("geo-pick");
    if (pick) {
      pick.classList.toggle("is-active", on);
      pick.textContent = on ? "地図をクリックしてください…" : "📍 地図で中心を指定";
    }
    if (mapEl) mapEl.style.cursor = on ? "crosshair" : "";
  }

  function runGeoQuery(doFit) {
    if (!geoCenter || !db) return;
    var meters = Math.round(geoRadiusKm * 1000);
    // count=true → server returns the NGSILD-Results-Count header = the total
    // number of entities matching THIS near-query (our denominator).
    var path = "/ngsi-ld/v1/entities?type=" + encodeURIComponent(CONFIG.type) + "&limit=1000&count=true" +
      "&georel=" + encodeURIComponent("near;maxDistance==" + meters) +
      "&geometry=Point&coordinates=" + encodeURIComponent("[" + geoCenter[0] + "," + geoCenter[1] + "]");
    setGeoResult("検索中…");
    db.requestRaw("GET", path)
      .then(function (res) {
        var h = res.headers.get("NGSILD-Results-Count");
        var matching = h != null ? parseInt(h, 10) : NaN;
        return res.json().then(function (body) { return { body: body, matching: matching }; });
      })
      .then(function (r) {
        var list = Array.isArray(r.body) ? r.body : (r.body && r.body.entities) || [];
        var fc = toFC(list);
        geoActive = true;
        geoCount = fc.features.length;
        geoTotal = !isNaN(r.matching) ? r.matching : geoCount; // query-result denominator
        var src = map.getSource("aed");
        if (src) src.setData(fc);
        setGeoResult("範囲内: <strong>" + geoCount + "</strong> 件<br><span style=\"opacity:.7\">半径 " + geoRadiusKm + " km の near クエリ</span>");
        setCountStatus(); // bottom bar: 範囲内 N / 該当総数
        if (doFit) fitToCircle();
      })
      .catch(function (e) { setGeoResult("エラー: " + (e && e.message ? e.message : e)); });
  }

  function clearGeo() {
    geoActive = false;
    geoCount = null;
    geoTotal = null;
    geoCenter = null;
    setPick(false);
    drawGeo();
    var src = map && map.getSource("aed");
    if (src) src.setData(buildGeoJSON());
    setGeoResult("中心が未指定です");
    updateQueryView();
    setCountStatus();
    fitToData();
  }

  function wireGeoPanel() {
    var pick = document.getElementById("geo-pick");
    var radius = document.getElementById("geo-radius");
    var radiusVal = document.getElementById("geo-radius-val");
    var clear = document.getElementById("geo-clear");
    if (!pick || !radius || !clear) return;
    pick.addEventListener("click", function () { setPick(!pickMode); });
    var radiusTimer = null;
    radius.addEventListener("input", function () {
      geoRadiusKm = +radius.value;
      radiusVal.textContent = geoRadiusKm;
      updateQueryView();
      if (geoCenter) {
        drawGeo(); // grow/shrink the circle immediately
        // re-run the near-query (debounced) so the markers + count track the slider
        clearTimeout(radiusTimer);
        radiusTimer = setTimeout(function () { runGeoQuery(false); }, 220);
      }
    });
    clear.addEventListener("click", clearGeo);
    updateQueryView();
  }

  function addLayers() {
    map.addSource("aed", {
      type: "geojson", data: buildGeoJSON(),
      cluster: true, clusterRadius: 46, clusterMaxZoom: 14,
    });

    map.addLayer({
      id: "aed-clusters", type: "circle", source: "aed", filter: ["has", "point_count"],
      paint: {
        "circle-color": "#fc6c00", "circle-opacity": 0.82,
        "circle-stroke-color": "#fff", "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 50, 26, 200, 34],
      },
    });
    map.addLayer({
      id: "aed-cluster-count", type: "symbol", source: "aed", filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 13,
        "text-font": ["Noto Sans CJK JP Bold"],
      },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: "aed-point", type: "circle", source: "aed", filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#fc6c00", "circle-radius": 7,
        "circle-stroke-width": 2, "circle-stroke-color": "#fff", "circle-opacity": 0.95,
      },
    });

    // geo-query visualization: radius circle (under markers) + center dot (on top)
    map.addSource("geo-circle", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "geo-circle-fill", type: "fill", source: "geo-circle",
      paint: { "fill-color": "#39d6c6", "fill-opacity": 0.12 } }, "aed-clusters");
    map.addLayer({ id: "geo-circle-line", type: "line", source: "geo-circle",
      paint: { "line-color": "#39d6c6", "line-width": 2, "line-dasharray": [2, 1] } }, "aed-clusters");
    map.addSource("geo-center", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "geo-center-dot", type: "circle", source: "geo-center",
      paint: { "circle-color": "#39d6c6", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });

    function showPopup(f) {
      var p = f.properties;
      var c = f.geometry.coordinates.slice();
      var html =
        "<strong>" + esc(p.name) + "</strong>" +
        (p.address ? "<br>" + esc(p.address) : "") +
        (p.info ? '<br><span style="color:#777">' + esc(p.info) + "</span>" : "");
      new GL.Popup({ offset: 12, closeButton: false }).setLngLat(c).setHTML(html).addTo(map);
    }

    function expandCluster(f) {
      var clusterId = f.properties.cluster_id;
      var coords = f.geometry.coordinates;
      function flyToZoom(zoom) {
        map.easeTo({ center: coords, zoom: zoom == null ? map.getZoom() + 2 : zoom, duration: 500 });
      }
      // getClusterExpansionZoom changed from callback- to Promise-based across versions.
      var ret = map.getSource("aed").getClusterExpansionZoom(clusterId, function (err, zoom) {
        if (!err) flyToZoom(zoom);
      });
      if (ret && typeof ret.then === "function") ret.then(flyToZoom).catch(function () {});
    }

    // The deck CSS-scales each slide via transform: scale(), which MapLibre does
    // NOT account for in its pointer math — so map.on('click', layer) queries the
    // wrong pixel and misses. We compute the scale-corrected canvas pixel ourselves
    // from the container's layout-vs-rendered size and query features at that point.
    mapEl = document.getElementById("aed-map");
    function correctedPoint(ev) {
      var rect = mapEl.getBoundingClientRect();
      var sx = mapEl.offsetWidth / rect.width;
      var sy = mapEl.offsetHeight / rect.height;
      return [(ev.clientX - rect.left) * sx, (ev.clientY - rect.top) * sy];
    }
    mapEl.addEventListener("click", function (ev) {
      var pt = correctedPoint(ev);
      // Pick mode: the next click sets the near-query center instead of opening a popup.
      if (pickMode) {
        var ll = map.unproject(pt);
        geoCenter = [ll.lng, ll.lat];
        setPick(false);
        updateQueryView();
        drawGeo();
        runGeoQuery(true); // frame the map to the circle on the initial pick
        return;
      }
      var clusters = map.queryRenderedFeatures(pt, { layers: ["aed-clusters"] });
      if (clusters.length) { expandCluster(clusters[0]); return; }
      var points = map.queryRenderedFeatures(pt, { layers: ["aed-point"] });
      if (points.length) showPopup(points[0]);
    });
    mapEl.addEventListener("mousemove", function (ev) {
      if (pickMode) return; // keep the crosshair while picking a center
      var hit = map.queryRenderedFeatures(correctedPoint(ev), { layers: ["aed-clusters", "aed-point"] });
      map.getCanvas().style.cursor = hit.length ? "pointer" : "";
    });

    // The CSS scale() on slides breaks MapLibre's built-in scroll-zoom anchor
    // (it zooms toward a mis-computed cursor point, so the center drifts). Disable it
    // and zoom around the scale-corrected point under the cursor. To stay light,
    // accumulate wheel deltas and apply at most once per animation frame with an
    // instant (duration: 0) zoom — no stacked easeTo animations.
    map.scrollZoom.disable();
    var wheelAccum = 0;
    var wheelPoint = null;
    var wheelScheduled = false;
    mapEl.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      wheelAccum += -ev.deltaY;
      wheelPoint = correctedPoint(ev);
      if (wheelScheduled) return;
      wheelScheduled = true;
      requestAnimationFrame(function () {
        wheelScheduled = false;
        var dz = Math.max(-1.2, Math.min(1.2, wheelAccum / 110));
        wheelAccum = 0;
        if (!dz) return;
        var z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + dz));
        map.easeTo({ zoom: z, around: map.unproject(wheelPoint), duration: 0 });
      });
    }, { passive: false });

    wireGeoPanel();
    fitToData();
  }

  function fitToData() {
    var ids = Object.keys(byId);
    if (!ids.length) return;
    var b = new GL.LngLatBounds();
    ids.forEach(function (id) { var c = coordsOf(byId[id]); if (c) b.extend(c); });
    if (!b.isEmpty()) map.fitBounds(b, { padding: 50, maxZoom: 14, duration: 0 });
  }


  var PAGE_SIZE = 100;

  // Load entities page-by-page (like geonicdb-pulse): first fetch the total count,
  // then pull pages of PAGE_SIZE sequentially, updating the map + a "loaded / total"
  // progress readout as each page arrives.
  // Fetch all entities into byId. Map-independent: it can run on the PREVIOUS
  // slide (prefetch) — the map.setData / fitToData calls are guarded so they
  // only fire once the map exists. Runs at most once (prefetch or map-init).
  function loadAllPages() {
    if (dataStarted) return; // already prefetched / loading
    dataStarted = true;
    loading = true;
    function applyToMap(firstFit) {
      var src = map && map.getSource("aed");
      if (src) src.setData(buildGeoJSON());
      if (firstFit && map) fitToData();
    }
    function loadPage(offset, firstFit) {
      return db.getEntities({ type: CONFIG.type, limit: PAGE_SIZE, offset: offset }).then(function (res) {
        var list = Array.isArray(res) ? res : res && Array.isArray(res.entities) ? res.entities : [];
        list.forEach(function (e) { if (e && e.id) byId[e.id] = e; });
        applyToMap(firstFit);   // no-op while prefetching (map not built yet)
        setCountStatus();
        if (list.length < PAGE_SIZE) return; // last page reached
        return loadPage(offset + PAGE_SIZE, false);
      });
    }
    setStatus("件数を取得中…");
    return db.count({ type: CONFIG.type })
      .then(function (c) { total = c; }, function () { total = null; })
      .then(function () { return loadPage(0, true); })
      .then(function () { loading = false; setCountStatus(); })
      .catch(function (err) {
        console.error("[aed-map]", err);
        setStatus("データ取得に失敗: " + (err && err.message ? err.message : err), "is-error");
      });
  }

  // Create the SDK client once (creating it is cheap; the DPoP token exchange
  // happens lazily on the first request inside loadAllPages).
  function ensureDb() {
    if (db) return db;
    if (typeof window.GeonicDB !== "function") return null;
    db = new window.GeonicDB({ apiKey: CONFIG.apiKey, tenant: CONFIG.tenant, baseUrl: CONFIG.baseUrl });
    return db;
  }

  // Prefetch entities (+ warm the DPoP token) without the map — call this on
  // the slide BEFORE the demo so arriving on slide 9 renders instantly.
  function prefetch() {
    if (!ensureDb()) return;
    loadAllPages();
  }

  function loadAndRender() {
    if (!ensureDb()) {
      setStatus("GeonicDB SDK が読み込まれていません", "is-error");
      return;
    }
    addLayers();        // source initial data = whatever byId already holds
    loadAllPages();     // no-op if prefetch already started it
  }

  function start() {
    if (started) return;
    started = true;
    GL = window.geolonia || window.maplibregl;
    if (!GL || typeof GL.Map !== "function") {
      setStatus("地図ライブラリ（Geolonia Maps）の読み込みに失敗しました", "is-error");
      return;
    }
    // Same basemap style as geonicdb-pulse ("Dark Gray GSI"). Passed as a parsed
    // object so the Geolonia embed does not resolve it as a hosted style name.
    fetch("assets/map-style.json")
      .then(function (r) { return r.json(); })
      .then(function (style) {
        map = new GL.Map({
          // Controls are configured via the container's data-* attributes
          // (data-navigation-control="off"), the same way geonicdb-pulse does it.
          container: "aed-map", style: style,
          center: CONFIG.center, zoom: CONFIG.zoom,
          renderWorldCopies: false,
        });
        map.on("load", loadAndRender);
      })
      .catch(function (err) {
        setStatus("地図スタイルの読み込みに失敗: " + (err && err.message ? err.message : err), "is-error");
      });
  }

  document.addEventListener("slidechange", function (e) {
    if (!e.detail) return;
    var i = e.detail.index;
    if (i === MAP_SLIDE_INDEX - 1) {
      prefetch(); // warm DPoP token + load entities on the prior slide
    } else if (i === MAP_SLIDE_INDEX) {
      prefetch(); // ensure data is loading even if the user jumped straight here
      start();
      if (map) setTimeout(function () { map.resize(); }, 60);
    }
  });
})();
