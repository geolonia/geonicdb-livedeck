/* ===================================================================
   ライブ AED マップデモ。
   Geolonia Maps（MapLibre GL）＋ GeonicDB SDK（DPoP / PoW トークン交換）。
   テナント `miya` の `AedLocation` をクラスタ件数付きで描画し、ジオクエリ（near）と
   ページング取得を行う（geonicdb-pulse と同じ作り）。読み取り専用（readonly キー）。

   MapLibre GL は CDN（Geolonia embed）で読み込むため、地図インスタンスやレイヤは
   型を最小限（any 寄り）に留め、SDK 呼び出し側の見通しを優先している。
   =================================================================== */
import type GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "../lib/config";
import { createClient } from "../lib/client";
import { whenIdle } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMap = any;
type Entity = Record<string, any>;
type LngLat = [number, number];

export function initMap(): void {
  const DM = config.demos.map;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const MAP_SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--map") as Element);
  const PAGE_SIZE = 100;

  let GL: GeoloniaNamespace | null = null;
  let map: AnyMap = null;
  let db: GeonicDB | null = null;
  const entities: Record<string, Entity> = Object.create(null); // id -> NGSI-LD entity
  let started = false; // 地図初期化済み
  let dataStarted = false; // エンティティ取得を開始済み（prefetch or 地図初期化）

  // geo-query（near）の状態
  let geoCenter: LngLat | null = null;
  let geoRadiusKm = 10;
  let pickMode = false;
  let geoActive = false;
  let geoCount: number | null = null;
  let geoTotal: number | null = null;
  let mapEl: HTMLElement | null = null;
  let total: number | null = null; // db.count による総数
  let loading = true;

  // pulse 風の件数 / 進捗インジケータ（地図下中央）
  let countEl: HTMLElement | null = null;
  let countBar: HTMLElement | null = null;
  let countText: HTMLElement | null = null;
  function countRefs(): void {
    if (countEl) return;
    countEl = document.getElementById("aed-count");
    countBar = document.getElementById("aed-count-bar");
    countText = document.getElementById("aed-count-text");
  }
  function setStatus(msg: string, isError?: boolean): void {
    countRefs();
    if (!countEl) return;
    countEl.classList.add("visible");
    countEl.classList.remove("done");
    countEl.classList.toggle("is-error", !!isError);
    if (countBar) countBar.style.width = "0%";
    if (countText) countText.textContent = msg;
  }
  function setCountStatus(): void {
    countRefs();
    if (!countEl || !countText) return;
    countEl.classList.add("visible");
    countEl.classList.remove("is-error");
    // near-query フィルタ中は範囲内のみ描画するので、その件数を報告（全件ではなく）。
    const inGeo = geoActive && geoCount != null;
    const n = inGeo ? (geoCount as number) : Object.keys(entities).length;
    const denom = inGeo ? geoTotal : total;
    if (denom != null) {
      countText.textContent = n + " / " + denom;
      if (countBar)
        countBar.style.width = (denom > 0 ? Math.min(100, (n / denom) * 100) : 100) + "%";
    } else {
      countText.textContent = n + " 件";
    }
    countEl.classList.toggle("done", !loading);
  }

  function esc(s: unknown): string {
    return String(s).replace(/[&<>"]/g, (c) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string;
    });
  }
  const attrVal = (a: any): any =>
    a && typeof a === "object" && "value" in a ? a.value : a;
  function coordsOf(e: Entity): LngLat | null {
    const loc = e && e.location;
    const c = (loc && loc.value && loc.value.coordinates) || (loc && loc.coordinates);
    return c && c.length >= 2 ? [Number(c[0]), Number(c[1])] : null;
  }

  const emptyFC = () => ({ type: "FeatureCollection", features: [] as any[] });

  function toFeature(e: Entity): any {
    const c = coordsOf(e);
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

  function toFC(list: Entity[]): any {
    const features: any[] = [];
    (list || []).forEach((e) => {
      const f = toFeature(e);
      if (f) features.push(f);
    });
    return { type: "FeatureCollection", features };
  }

  const buildGeoJSON = () => toFC(Object.keys(entities).map((id) => entities[id]!));

  // ---- geo-query (NGSI-LD near) ----
  function setGeoResult(html: string): void {
    const el = document.getElementById("geo-result");
    if (el) el.innerHTML = html;
  }

  // 現在の中心＋半径を反映した、near-query の実 NGSI-LD リクエストを表示。
  function updateQueryView(): void {
    const el = document.getElementById("geo-query");
    if (!el) return;
    const meters = Math.round(geoRadiusKm * 1000);
    const coords = geoCenter
      ? "[" + geoCenter[0].toFixed(5) + "," + geoCenter[1].toFixed(5) + "]"
      : "[地図で中心を指定]";
    el.textContent =
      "GET /ngsi-ld/v1/entities?type=" +
      DM.type +
      "&georel=near;maxDistance==" +
      meters +
      "&geometry=Point&coordinates=" +
      coords;
  }

  // 原点から測地距離・方位の点（大圏の目的地公式）。サーバの near;maxDistance（測地）と
  // 一致させるためこの点で円環を作る（Web Mercator では正しい等距円＝わずかな楕円に見える）。
  function destPoint(lng: number, lat: number, bearingDeg: number, distKm: number): LngLat {
    const R = 6371.0088;
    const br = (bearingDeg * Math.PI) / 180;
    const dr = distKm / R;
    const lat1 = (lat * Math.PI) / 180;
    const lng1 = (lng * Math.PI) / 180;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(br) * Math.sin(dr) * Math.cos(lat1),
        Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2),
      );
    return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
  }

  function circlePolygon(center: LngLat, radiusKm: number, pts = 96): any {
    const ring: LngLat[] = [];
    for (let i = 0; i <= pts; i++) {
      ring.push(destPoint(center[0], center[1], (i / pts) * 360, radiusKm));
    }
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} }],
    };
  }

  function drawGeo(): void {
    if (!map) return;
    const circ = map.getSource("geo-circle");
    const cen = map.getSource("geo-center");
    if (geoCenter) {
      if (circ) circ.setData(circlePolygon(geoCenter, geoRadiusKm));
      if (cen)
        cen.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "Point", coordinates: geoCenter }, properties: {} }],
        });
    } else {
      if (circ) circ.setData(emptyFC());
      if (cen) cen.setData(emptyFC());
    }
  }

  function fitToCircle(): void {
    if (!geoCenter || !GL) return;
    const b = new GL.LngLatBounds();
    circlePolygon(geoCenter, geoRadiusKm).features[0].geometry.coordinates[0].forEach((c: LngLat) =>
      b.extend(c),
    );
    map.fitBounds(b, { padding: 50, duration: 600 });
  }

  function setPick(on: boolean): void {
    pickMode = on;
    const pick = document.getElementById("geo-pick");
    if (pick) {
      pick.classList.toggle("is-active", on);
      pick.textContent = on ? "地図をクリックしてください…" : "📍 地図で中心を指定";
    }
    if (mapEl) mapEl.style.cursor = on ? "crosshair" : "";
  }

  function runGeoQuery(doFit: boolean): void {
    if (!geoCenter || !db) return;
    const meters = Math.round(geoRadiusKm * 1000);
    // count=true → サーバが NGSILD-Results-Count ヘッダ（near-query の総数＝分母）を返す。
    const path =
      "/ngsi-ld/v1/entities?type=" +
      encodeURIComponent(DM.type) +
      "&limit=1000&count=true" +
      "&georel=" +
      encodeURIComponent("near;maxDistance==" + meters) +
      "&geometry=Point&coordinates=" +
      encodeURIComponent("[" + geoCenter[0] + "," + geoCenter[1] + "]");
    setGeoResult("検索中…");
    db.requestRaw("GET", path)
      .then((res) => {
        const h = res.headers.get("NGSILD-Results-Count");
        const matching = h != null ? parseInt(h, 10) : NaN;
        return res.json().then((body: any) => ({ body, matching }));
      })
      .then((r) => {
        const list: Entity[] = Array.isArray(r.body) ? r.body : r.body?.entities || [];
        const fc = toFC(list);
        geoActive = true;
        geoCount = fc.features.length;
        geoTotal = !isNaN(r.matching) ? r.matching : geoCount;
        const src = map.getSource("aed");
        if (src) src.setData(fc);
        setGeoResult(
          "範囲内: <strong>" +
            geoCount +
            '</strong> 件<br><span style="opacity:.7">半径 ' +
            geoRadiusKm +
            " km の near クエリ</span>",
        );
        setCountStatus();
        if (doFit) fitToCircle();
      })
      .catch((e: unknown) => setGeoResult("エラー: " + (e instanceof Error ? e.message : String(e))));
  }

  function clearGeo(): void {
    geoActive = false;
    geoCount = null;
    geoTotal = null;
    geoCenter = null;
    setPick(false);
    drawGeo();
    const src = map && map.getSource("aed");
    if (src) src.setData(buildGeoJSON());
    setGeoResult("中心が未指定です");
    updateQueryView();
    setCountStatus();
    fitToData();
  }

  function wireGeoPanel(): void {
    const pick = document.getElementById("geo-pick");
    const radius = document.getElementById("geo-radius") as HTMLInputElement | null;
    const radiusVal = document.getElementById("geo-radius-val");
    const clear = document.getElementById("geo-clear");
    if (!pick || !radius || !clear) return;
    pick.addEventListener("click", () => setPick(!pickMode));
    let radiusTimer: number | null = null;
    radius.addEventListener("input", () => {
      geoRadiusKm = +radius.value;
      if (radiusVal) radiusVal.textContent = String(geoRadiusKm);
      updateQueryView();
      if (geoCenter) {
        drawGeo(); // 円を即座に拡縮
        if (radiusTimer) clearTimeout(radiusTimer);
        radiusTimer = window.setTimeout(() => {
          fitToCircle(); // まず円に合わせて移動…
          runGeoQuery(false); // …その後に取得（再フィットなし）
        }, 220);
      }
    });
    clear.addEventListener("click", clearGeo);
    updateQueryView();
  }

  function addLayers(): void {
    map.addSource("aed", {
      type: "geojson",
      data: buildGeoJSON(),
      cluster: true,
      clusterRadius: 46,
      clusterMaxZoom: 14,
    });

    map.addLayer({
      id: "aed-clusters",
      type: "circle",
      source: "aed",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#fc6c00",
        "circle-opacity": 0.82,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 50, 26, 200, 34],
      },
    });
    map.addLayer({
      id: "aed-cluster-count",
      type: "symbol",
      source: "aed",
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 13,
        "text-font": ["Noto Sans CJK JP Bold"],
      },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: "aed-point",
      type: "circle",
      source: "aed",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#fc6c00",
        "circle-radius": 7,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
        "circle-opacity": 0.95,
      },
    });
    map.addLayer({
      id: "aed-labels",
      type: "symbol",
      source: "aed",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-font": ["Noto Sans CJK JP Bold"],
        "text-offset": [0, -1.5],
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-max-width": 10,
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": 1.2,
      },
      paint: {
        "text-color": "rgba(224,247,250,0.9)",
        "text-halo-color": "rgba(6,10,23,0.85)",
        "text-halo-width": 1.5,
      },
    });

    // geo-query 可視化: 半径円（マーカーの下）＋中心ドット（上）
    map.addSource("geo-circle", { type: "geojson", data: emptyFC() });
    map.addLayer(
      {
        id: "geo-circle-fill",
        type: "fill",
        source: "geo-circle",
        paint: { "fill-color": "#39d6c6", "fill-opacity": 0.12 },
      },
      "aed-clusters",
    );
    map.addLayer(
      {
        id: "geo-circle-line",
        type: "line",
        source: "geo-circle",
        paint: { "line-color": "#39d6c6", "line-width": 2, "line-dasharray": [2, 1] },
      },
      "aed-clusters",
    );
    map.addSource("geo-center", { type: "geojson", data: emptyFC() });
    map.addLayer({
      id: "geo-center-dot",
      type: "circle",
      source: "geo-center",
      paint: { "circle-color": "#39d6c6", "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
    });

    function showPopup(f: any): void {
      const p = f.properties;
      const c = f.geometry.coordinates.slice();
      const html =
        "<strong>" +
        esc(p.name) +
        "</strong>" +
        (p.address ? "<br>" + esc(p.address) : "") +
        (p.info ? '<br><span style="color:#777">' + esc(p.info) + "</span>" : "");
      new GL!.Popup({ offset: 12, closeButton: false }).setLngLat(c).setHTML(html).addTo(map);
    }

    function expandCluster(f: any): void {
      const clusterId = f.properties.cluster_id;
      const coords = f.geometry.coordinates;
      function flyToZoom(zoom?: number): void {
        map.easeTo({ center: coords, zoom: zoom == null ? map.getZoom() + 2 : zoom, duration: 500 });
      }
      // getClusterExpansionZoom はバージョンで callback / Promise が異なる。
      const ret = map.getSource("aed").getClusterExpansionZoom(clusterId, (err: unknown, zoom: number) => {
        if (!err) flyToZoom(zoom);
      });
      if (ret && typeof ret.then === "function") ret.then(flyToZoom).catch(() => {});
    }

    // デッキは各スライドを transform: scale() で拡縮するが MapLibre はそれを考慮しない。
    // そのため map.on('click', layer) は誤ったピクセルを引いて外れる。コンテナの
    // レイアウト寸法と実寸からスケール補正したピクセルを自前で算出して query する。
    mapEl = document.getElementById("aed-map");
    function correctedPoint(ev: MouseEvent | WheelEvent): [number, number] {
      const rect = mapEl!.getBoundingClientRect();
      const sx = mapEl!.offsetWidth / rect.width;
      const sy = mapEl!.offsetHeight / rect.height;
      return [(ev.clientX - rect.left) * sx, (ev.clientY - rect.top) * sy];
    }
    mapEl!.addEventListener("click", (ev) => {
      const pt = correctedPoint(ev);
      // ピックモード: 次のクリックでポップアップではなく near-query の中心を設定。
      if (pickMode) {
        const ll = map.unproject(pt);
        geoCenter = [ll.lng, ll.lat];
        setPick(false);
        updateQueryView();
        drawGeo();
        runGeoQuery(true); // 初回ピックで円に合わせてフレーミング
        return;
      }
      const clusters = map.queryRenderedFeatures(pt, { layers: ["aed-clusters"] });
      if (clusters.length) {
        expandCluster(clusters[0]);
        return;
      }
      const points = map.queryRenderedFeatures(pt, { layers: ["aed-point"] });
      if (points.length) showPopup(points[0]);
    });
    mapEl!.addEventListener("mousemove", (ev) => {
      if (pickMode) return;
      const hit = map.queryRenderedFeatures(correctedPoint(ev), {
        layers: ["aed-clusters", "aed-point"],
      });
      map.getCanvas().style.cursor = hit.length ? "pointer" : "";
    });

    // CSS scale() は MapLibre 内蔵の scroll-zoom アンカーも壊す（中心がドリフトする）。
    // 無効化し、カーソル下のスケール補正点を中心にズーム。負荷軽減のため wheel デルタを
    // 貯めて 1 フレームに最大 1 回、瞬時（duration:0）ズームを適用する。
    map.scrollZoom.disable();
    let wheelAccum = 0;
    let wheelPoint: [number, number] | null = null;
    let wheelScheduled = false;
    mapEl!.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        wheelAccum += -ev.deltaY;
        wheelPoint = correctedPoint(ev);
        if (wheelScheduled) return;
        wheelScheduled = true;
        requestAnimationFrame(() => {
          wheelScheduled = false;
          const dz = Math.max(-1.2, Math.min(1.2, wheelAccum / 110));
          wheelAccum = 0;
          if (!dz) return;
          const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + dz));
          map.easeTo({ zoom: z, around: map.unproject(wheelPoint), duration: 0 });
        });
      },
      { passive: false },
    );

    wireGeoPanel();
    // 初期 fitToData() はしない — プリフェッチ完了時に視点が飛ばないよう既定の
    // center/zoom（CONFIG.center / CONFIG.zoom）を維持する。
  }

  // 全ロード済みエンティティに地図を合わせる。「全件表示に戻す」（ユーザー操作）でのみ使用。
  // 初期/自動ロードでは呼ばない（既定の center/zoom を維持）。
  function fitToData(): void {
    const ids = Object.keys(entities);
    if (!ids.length || !GL) return;
    const b = new GL.LngLatBounds();
    ids.forEach((id) => {
      const c = coordsOf(entities[id]!);
      if (c) b.extend(c);
    });
    if (!b.isEmpty()) map.fitBounds(b, { padding: 50, maxZoom: 14, duration: 0 });
  }

  // エンティティをページごとに取得（pulse と同様）。まず総数、次に PAGE_SIZE ずつ。
  // 地図が無くても動く（prefetch）。map.setData は地図生成後のみ反映。1 回だけ実行。
  function loadAllPages(): Promise<void> {
    if (dataStarted) return Promise.resolve();
    dataStarted = true;
    loading = true;
    function applyToMap(): void {
      const src = map && map.getSource("aed");
      if (src) src.setData(buildGeoJSON());
      // ダウンロード完了時に視点が飛ばないよう、ここでも fitToData() は呼ばない。
    }
    function loadPage(offset: number): Promise<void> {
      return db!.getEntities({ type: DM.type, limit: PAGE_SIZE, offset }).then((res) => {
        const list: Entity[] = Array.isArray(res) ? res : [];
        list.forEach((e) => {
          const id = e.id as string | undefined;
          if (id) entities[id] = e;
        });
        applyToMap(); // prefetch 中（地図未生成）は no-op
        setCountStatus();
        if (list.length < PAGE_SIZE) return; // 最終ページ
        return loadPage(offset + PAGE_SIZE);
      });
    }
    setStatus("件数を取得中…");
    return db!
      .count({ type: DM.type })
      .then(
        (c) => {
          total = c;
        },
        () => {
          total = null;
        },
      )
      .then(() => loadPage(0))
      .then(() => {
        loading = false;
        setCountStatus();
      })
      .catch((err: unknown) => {
        console.error("[aed-map]", err);
        setStatus("データ取得に失敗: " + (err instanceof Error ? err.message : String(err)), true);
      });
  }

  // SDK クライアントを 1 度だけ生成（生成は軽量。DPoP トークン交換は最初のリクエストで遅延実行）。
  function ensureDb(): GeonicDB | null {
    if (db) return db;
    db = createClient("readonly");
    return db;
  }

  // 地図なしでエンティティを先読み（＋DPoP トークンを温める）。デモの 1 つ前のスライドで呼ぶ。
  function prefetch(): void {
    if (!ensureDb()) return;
    void loadAllPages();
  }

  function loadAndRender(): void {
    if (!ensureDb()) {
      setStatus("GeonicDB SDK が読み込まれていません", true);
      return;
    }
    addLayers(); // ソースの初期データ = 既に entities にある分
    void loadAllPages(); // prefetch 済みなら no-op
  }

  function start(): void {
    if (started) return;
    started = true;
    GL = window.geolonia || window.maplibregl || null;
    if (!GL || typeof GL.Map !== "function") {
      setStatus("地図ライブラリ（Geolonia Maps）の読み込みに失敗しました", true);
      return;
    }
    // pulse と同じベース地図（"Dark Gray GSI"）。パース済みオブジェクトとして渡し、
    // Geolonia embed がホスト型スタイル名として解決しないようにする。
    const styleUrl = import.meta.env.BASE_URL + "assets/map-style.json";
    fetch(styleUrl)
      .then((r) => r.json())
      .then((style: any) => {
        // ローカル同梱の GSI スプライトを指す（pulse と同じ）。これが無いとベース地図の
        // シンボルレイヤが、どのスプライトにも無いアイコンを参照し
        // "Image '…' could not be loaded" 警告がコンソールに溢れる。
        style.sprite = location.origin + import.meta.env.BASE_URL + "assets/sprites/gsi";
        map = new GL!.Map({
          container: "aed-map",
          style,
          center: DM.center,
          zoom: DM.zoom,
          renderWorldCopies: false,
        });
        map.on("load", loadAndRender);
      })
      .catch((err: unknown) => {
        setStatus(
          "地図スタイルの読み込みに失敗: " + (err instanceof Error ? err.message : String(err)),
          true,
        );
      });
  }

  onSlideChange(({ index }) => {
    if (index === MAP_SLIDE_INDEX - 1) {
      whenIdle(prefetch); // 前スライドで DPoP トークンを温め＋エンティティ取得
    } else if (index === MAP_SLIDE_INDEX) {
      whenIdle(prefetch); // 直接来た場合もデータ取得を保証
      start();
      if (map) setTimeout(() => map.resize(), 60);
    }
  });
}
