/* ===================================================================
   共同編集 GIS デモ（民間ユースケース）。
   Geolonia Maps（MapLibre GL）＋ GeonicDB SDK（DPoP）＋ WebSocket。

   地図上にポイント / ライン / ポリゴンを描くと、その地物が NGSI-LD エンティティ
   （type=geonicdb-livedeck-MapFeature、location は GeoProperty）として作成され、
   WebSocket で全クライアントの地図にリアルタイムで反映される（＝共同編集）。
   認可は専用キー geonicdb-livedeck-mapedit（VITE_GEONICDB_MAPEDIT_KEY）。
   MapFeature の GET|POST ＋ WS、origin 制限・DPoP 必須。

   地図まわり（スタイル/スプライト・CSS scale() 補正・ホイールズーム）は map.ts と同じ作り。
   =================================================================== */
import type GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "../lib/config";
import { createClient } from "../lib/client";
import { byId, escapeHtml, whenIdle } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMap = any;
type LngLat = [number, number];
type Kind = "point" | "line" | "polygon";

// WS / 楽観更新で共通に扱う、エンティティ風イベントの最小形。
interface FeatEvent {
  entityId?: string;
  entityType?: string;
  entity?: Record<string, any>;
  data?: Record<string, any>;
}

const CORE_CONTEXT = "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.7.jsonld";
// 参加者ごとの色（描いた人が視覚的に分かるよう、セッションごとにランダムで1色）。
const PALETTE = ["#fc6c00", "#39d6c6", "#fba40c", "#e8401e", "#7b6cff", "#2fbf71", "#ff5da2"];

export function initCollab(): void {
  const CO = config.demos.collab;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--collab") as Element);

  let GL: GeoloniaNamespace | null = null;
  let map: AnyMap = null;
  let db: GeonicDB | null = null;
  let mapEl: HTMLElement | null = null;
  let started = false;

  // セッションの参加者アイデンティティ（色は描画の帰属表示に使う）。
  const myColor = PALETTE[Math.floor(Math.random() * PALETTE.length)]!;
  const myAuthor = "guest-" + Math.random().toString(36).slice(2, 8);

  const features: Record<string, any> = Object.create(null); // id -> GeoJSON Feature
  let tool: Kind | null = null; // 選択中の作図ツール
  let draft: LngLat[] = []; // 作図中の頂点（line / polygon）
  let hoverPt: LngLat | null = null; // ラバーバンド用のカーソル位置

  const attrVal = (a: any): any =>
    a && typeof a === "object" && "value" in a ? a.value : a;

  function setCount(): void {
    const el = byId("collab-count");
    if (el) el.textContent = String(Object.keys(features).length);
  }

  // ---- エンティティ ⇄ GeoJSON ------------------------------------
  function geomOf(e: Record<string, any>): any | null {
    const loc = e && e.location;
    const g = (loc && loc.value) || (loc && loc.type === "GeoProperty" ? loc.value : loc);
    return g && g.type && g.coordinates ? g : null;
  }
  function toFeature(e: Record<string, any>): any | null {
    const geom = geomOf(e);
    if (!geom) return null;
    return {
      type: "Feature",
      geometry: geom,
      properties: {
        id: e.id,
        kind: String(attrVal(e.kind) ?? ""),
        color: String(attrVal(e.color) ?? "#fc6c00"),
        author: String(attrVal(e.author) ?? ""),
      },
    };
  }
  // 表示対象は直近 1 週間に作成された地物のみ（drawnAt、無ければ id 埋め込みの時刻で判定）。
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  function featureTs(e: Record<string, any>): number {
    const d = attrVal(e.drawnAt);
    const t = d ? Date.parse(String(d)) : NaN;
    if (!isNaN(t)) return t;
    const local = String(e.id ?? "").split(":").pop() ?? "";
    const ts = parseInt((local.split("-")[0] ?? ""), 36);
    return isNaN(ts) ? 0 : ts;
  }
  function ingest(e: Record<string, any> | null): boolean {
    const id = e?.id as string | undefined;
    if (!e || !id || features[id]) return false;
    if (Date.now() - featureTs(e) > WEEK_MS) return false; // 直近1週間のみ表示
    const f = toFeature(e);
    if (!f) return false;
    features[id] = f;
    return true;
  }
  function fc(): any {
    return { type: "FeatureCollection", features: Object.keys(features).map((id) => features[id]) };
  }
  // WS 受信・描画のたびに全 FeatureCollection を再構築すると重いので、
  // 連続する更新は requestAnimationFrame で 1 フレーム 1 回の setData にまとめる。
  let applyScheduled = false;
  function applyToMap(): void {
    setCount();
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => {
      applyScheduled = false;
      const src = map && map.getSource("features");
      if (src) src.setData(fc());
    });
  }

  // ---- 作図の下書き（描画中プレビュー）----------------------------
  function draftData(): any {
    const feats: any[] = [];
    const pts = hoverPt && draft.length ? [...draft, hoverPt] : draft.slice();
    if (pts.length >= 2) {
      if (tool === "polygon" && pts.length >= 3) {
        feats.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] }, properties: {} });
      } else {
        feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} });
      }
    }
    draft.forEach((p) => feats.push({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { vertex: true } }));
    return { type: "FeatureCollection", features: feats };
  }
  function drawDraft(): void {
    const src = map && map.getSource("draft");
    if (src) src.setData(draftData());
  }
  function clearDraft(): void {
    draft = [];
    hoverPt = null;
    drawDraft();
  }

  // ---- 作図の確定 → エンティティ作成 -----------------------------
  function genId(): string {
    return "urn:ngsi-ld:" + CO.type + ":" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  function createFeature(kind: Kind, geometry: any): void {
    if (!db) return;
    const entity: Record<string, any> = {
      "@context": CORE_CONTEXT,
      id: genId(),
      type: CO.type,
      kind: { type: "Property", value: kind },
      color: { type: "Property", value: myColor },
      author: { type: "Property", value: myAuthor },
      drawnAt: { type: "Property", value: new Date().toISOString() },
      location: { type: "GeoProperty", value: geometry },
    };
    // 楽観描画（自分の地物は即反映）。WS エコー（同 id）は ingest 側で冪等。
    if (ingest(entity)) applyToMap();
    db.createEntity(entity).catch((err: unknown) => {
      console.warn("[collab] create failed", err);
      // 失敗時はロールバック
      delete features[entity.id as string];
      applyToMap();
    });
  }
  function finishDraft(): void {
    // ダブルクリックで確定すると click が二重発火して同座標の頂点が余分に入るため、
    // 連続する重複頂点を畳んでから geometry を組む。
    const pts = draft.filter(
      (p, i) => i === 0 || p[0] !== draft[i - 1]![0] || p[1] !== draft[i - 1]![1],
    );
    if (tool === "line" && pts.length >= 2) {
      createFeature("line", { type: "LineString", coordinates: pts });
    } else if (tool === "polygon" && pts.length >= 3) {
      createFeature("polygon", { type: "Polygon", coordinates: [[...pts, pts[0]]] });
    }
    clearDraft();
  }

  // ---- ツール選択 -------------------------------------------------
  function setTool(next: Kind | null): void {
    tool = next;
    clearDraft();
    ["point", "line", "polygon"].forEach((k) => {
      byId("collab-tool-" + k)?.classList.toggle("is-active", k === next);
    });
    const finish = byId("collab-finish");
    if (finish) finish.hidden = !(next === "line" || next === "polygon");
    if (mapEl) mapEl.style.cursor = next ? "crosshair" : "";
  }

  // ---- 地図 -------------------------------------------------------
  function addLayers(): void {
    map.addSource("features", { type: "geojson", data: fc() });
    map.addLayer({
      id: "co-poly-fill", type: "fill", source: "features",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.22 },
    });
    map.addLayer({
      id: "co-line", type: "line", source: "features",
      filter: ["!=", ["geometry-type"], "Point"],
      paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0.9 },
    });
    map.addLayer({
      id: "co-point", type: "circle", source: "features",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": ["get", "color"], "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-opacity": 0.95 },
    });

    // 下書き（描画中）レイヤ
    map.addSource("draft", { type: "geojson", data: draftData() });
    map.addLayer({
      id: "co-draft-fill", type: "fill", source: "draft",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": myColor, "fill-opacity": 0.15 },
    });
    map.addLayer({
      id: "co-draft-line", type: "line", source: "draft",
      filter: ["!=", ["geometry-type"], "Point"],
      paint: { "line-color": myColor, "line-width": 2, "line-dasharray": [2, 1] },
    });
    map.addLayer({
      id: "co-draft-vtx", type: "circle", source: "draft",
      filter: ["==", ["get", "vertex"], true],
      paint: { "circle-color": myColor, "circle-radius": 4, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 },
    });

    mapEl = byId("collab-map");
    function correctedPoint(ev: MouseEvent): [number, number] {
      const rect = mapEl!.getBoundingClientRect();
      const sx = mapEl!.offsetWidth / rect.width;
      const sy = mapEl!.offsetHeight / rect.height;
      return [(ev.clientX - rect.left) * sx, (ev.clientY - rect.top) * sy];
    }
    function lngLatAt(ev: MouseEvent): LngLat {
      const ll = map.unproject(correctedPoint(ev));
      return [ll.lng, ll.lat];
    }

    mapEl!.addEventListener("click", (ev) => {
      if (!tool) return;
      const ll = lngLatAt(ev);
      if (tool === "point") {
        createFeature("point", { type: "Point", coordinates: ll });
        return;
      }
      draft.push(ll); // line / polygon は頂点を追加
      drawDraft();
    });
    mapEl!.addEventListener("mousemove", (ev) => {
      if ((tool === "line" || tool === "polygon") && draft.length) {
        hoverPt = lngLatAt(ev);
        drawDraft();
      }
    });
    mapEl!.addEventListener("dblclick", (ev) => {
      if (tool === "line" || tool === "polygon") {
        ev.preventDefault();
        ev.stopPropagation();
        finishDraft();
      }
    });

    // CSS scale() 下ではズーム/ダブルクリックのアンカーがずれるため内蔵挙動を無効化し、
    // スケール補正した位置でホイールズームする（map.ts と同じ方式）。
    if (map.doubleClickZoom) map.doubleClickZoom.disable();
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
          if (!dz || !wheelPoint) return;
          const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + dz));
          map.easeTo({ zoom: z, around: map.unproject(wheelPoint), duration: 0 });
        });
      },
      { passive: false },
    );
  }

  // ---- データ取得 / WS -------------------------------------------
  function evtEntity(evt: FeatEvent | null): Record<string, any> | null {
    if (!evt) return null;
    if (evt.entity && evt.entity.id) return evt.entity;
    const e: Record<string, any> = {};
    if (evt.data) for (const k in evt.data) e[k] = evt.data[k];
    e.id = evt.entityId;
    e.type = evt.entityType || CO.type;
    return e.id ? e : null;
  }
  function onCreated(evt: FeatEvent): void {
    if (ingest(evtEntity(evt))) applyToMap();
  }
  function load(): Promise<void> {
    return db!.getEntities({ type: CO.type, limit: 1000 }).then((res) => {
      const list = Array.isArray(res) ? res : [];
      let added = false;
      list.forEach((e) => {
        if (ingest(e)) added = true;
      });
      if (added) applyToMap();
    });
  }
  function connect(): void {
    db!.on("entityCreated", (evt) => onCreated(evt as unknown as FeatEvent));
    db!.on("error", (err) => console.warn("[collab] ws", err));
    db!.subscribe({ entityTypes: [CO.type] });
    db!.connect().catch((err: unknown) => {
      console.warn("[collab] connect failed", err);
    });
  }

  // ---- 起動 -------------------------------------------------------
  function wireTools(): void {
    (["point", "line", "polygon"] as Kind[]).forEach((k) => {
      byId("collab-tool-" + k)?.addEventListener("click", () => setTool(tool === k ? null : k));
    });
    byId("collab-finish")?.addEventListener("click", finishDraft);
    const sw = byId("collab-mycolor");
    if (sw) sw.style.background = myColor;
    const who = byId("collab-me");
    if (who) who.textContent = escapeHtml(myAuthor);
  }

  function start(): void {
    if (started) return;
    started = true;
    wireTools();
    db = createClient("mapedit");
    // 先に購読・接続してから既存地物を取得（取得中に作られた地物を取りこぼさない）。
    // 取得分と WS 受信分は ingest 側で id 冪等にマージされる。
    connect();
    load().catch((err: unknown) => console.error("[collab]", err));

    GL = window.geolonia || window.maplibregl || null;
    if (!GL || typeof GL.Map !== "function") {
      console.error("[collab] 地図ライブラリ（Geolonia Maps）の読み込みに失敗しました");
      return;
    }
    const styleUrl = import.meta.env.BASE_URL + "assets/map-style.json";
    fetch(styleUrl)
      .then((r) => r.json())
      .then((style: any) => {
        style.sprite = location.origin + import.meta.env.BASE_URL + "assets/sprites/gsi";
        map = new GL!.Map({
          container: "collab-map",
          style,
          center: CO.center,
          zoom: CO.zoom,
          renderWorldCopies: false,
        });
        map.on("load", () => {
          addLayers();
          applyToMap();
        });
      })
      .catch((err: unknown) => console.error("[collab] map style", err));
  }

  onSlideChange(({ index }) => {
    if (index === SLIDE_INDEX - 1) {
      whenIdle(start); // 1 つ前で先読み（DPoP トークンを温める）
    } else if (index === SLIDE_INDEX) {
      start();
      if (map) setTimeout(() => map.resize(), 60);
    }
  });
}
