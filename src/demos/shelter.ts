/* ===================================================================
   避難所の混雑状況デモ（自治体ユースケース）。
   Geolonia Maps（MapLibre GL）＋ GeonicDB SDK（DPoP）で、高松市の指定避難所を
   地図に描画し、Temporal API から固定期間（1 日分）の受入状況を取得。
   タイムスライダーで時刻を動かすと、各避難所が混雑度で色分けされ、避難所を
   クリックするとその 24 時間の受入率グラフをポップアップ内に表示する。
   読み取り専用（readonly キー）。

   - 避難所の位置・収容人数: 高松市オープンデータ「指定緊急避難場所・指定避難所」(CC BY 4.0)
   - 混雑度（occupancy）: デモ用の合成データ（実際の受入実績ではない）

   地図まわりは map.ts（AED デモ）と同じ作り。CSS scale() 補正・スプライトの扱いも共通。
   =================================================================== */
import type GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "../lib/config";
import { createClient } from "../lib/client";
import { byId, whenIdle } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMap = any;
type LngLat = [number, number];

interface Shelter {
  id: string;
  name: string;
  address: string;
  coords: LngLat;
  capacity: number;
  /** 各時刻の受入人数（times と同じ並び） */
  occ: number[];
}

// 混雑度のしきい値と色（緑=空き / 橙=やや混雑 / 赤=満員間近）
const GREEN = "#2fbf71";
const AMBER = "#f5a524";
const RED = "#e5484d";
function levelOf(ratio: number): 0 | 1 | 2 {
  return ratio >= 0.75 ? 2 : ratio >= 0.4 ? 1 : 0;
}

export function initShelter(): void {
  const SH = config.demos.shelter;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--shelter") as Element);

  let GL: GeoloniaNamespace | null = null;
  let map: AnyMap = null;
  let db: GeonicDB | null = null;
  let mapEl: HTMLElement | null = null;
  let started = false; // 地図初期化済み
  let dataStarted = false; // データ取得開始済み
  let ready = false; // データ・地図とも準備完了

  let shelters: Shelter[] = [];
  let times: string[] = []; // ISO 時刻の配列（昇順）
  let sel = 0; // 選択中の時刻 index
  let selectedId: string | null = null; // クリックで選択中の避難所
  let popup: AnyMap = null; // 現在表示中のポップアップ（受入率グラフ入り）
  let playTimer: number | null = null;

  const attrVal = (a: unknown): any =>
    a && typeof a === "object" && "value" in a ? (a as { value: unknown }).value : a;

  function esc(s: unknown): string {
    return String(s).replace(/[&<>"]/g, (c) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string;
    });
  }


  // ---- データ取得 -------------------------------------------------
  // NGSI-LD temporal インスタンス配列 → { iso, v } の昇順リスト
  function instances(attr: unknown): { iso: string; v: number }[] {
    const arr = Array.isArray(attr) ? attr : attr ? [attr] : [];
    return arr
      .map((i: Record<string, unknown>) => {
        const valObj = i.value as { observedAt?: string } | undefined;
        const iso = (i.observedAt as string | undefined) ?? valObj?.observedAt;
        return { iso, v: Number(attrVal(i)) };
      })
      .filter((x): x is { iso: string; v: number } => x.iso != null && !isNaN(x.v))
      .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  }

  function coordsOf(e: Record<string, any>): LngLat | null {
    const loc = e && e.location;
    const c = (loc && loc.value && loc.value.coordinates) || (loc && loc.coordinates);
    return c && c.length >= 2 ? [Number(c[0]), Number(c[1])] : null;
  }

  async function loadData(): Promise<void> {
    if (dataStarted) return;
    dataStarted = true;

    // 1) 避難所の位置・収容人数（通常エンティティ）。高松市（municipalityCode）だけに絞る。
    const list = (await db!.getEntities({ type: SH.type, limit: 1000 })) as Record<string, any>[];
    const base: Record<string, Shelter> = Object.create(null);
    (Array.isArray(list) ? list : []).forEach((e) => {
      if (String(attrVal(e.municipalityCode)) !== SH.municipalityCode) return;
      const coords = coordsOf(e);
      const cap = Number(attrVal(e.capacity));
      if (!coords || !cap) return;
      base[e.id] = {
        id: e.id,
        name: String(attrVal(e.name) ?? "(名称未設定)"),
        address: String(attrVal(e.address) ?? ""),
        coords,
        capacity: cap,
        occ: [],
      };
    });

    // 2) 混雑度（occupancy）の時系列を Temporal API で一括取得（型指定・固定期間）。
    const path =
      "/ngsi-ld/v1/temporal/entities?type=" +
      encodeURIComponent(SH.type) +
      "&timerel=between&timeAt=" +
      encodeURIComponent(SH.from) +
      "&endTimeAt=" +
      encodeURIComponent(SH.to) +
      "&attrs=occupancy&limit=1000";
    const tempRes = (await db!.request("GET", path)) as Record<string, any>[];
    const tempList = Array.isArray(tempRes) ? tempRes : [];

    tempList.forEach((e) => {
      const s = base[e.id];
      if (!s) return;
      const pts = instances(e.occupancy);
      if (!pts.length) return;
      if (!times.length) times = pts.map((p) => p.iso); // 全避難所で同一の時間軸
      const byIso: Record<string, number> = Object.create(null);
      pts.forEach((p) => (byIso[p.iso] = p.v));
      s.occ = times.map((iso) => byIso[iso] ?? 0);
    });

    // 位置と時系列の両方がそろった避難所だけを対象にする。
    shelters = Object.values(base).filter((s) => s.occ.length === times.length && times.length > 0);
    if (!shelters.length || !times.length) throw new Error("避難所データが取得できませんでした");
    // 開幕で混雑の山が見えるよう、既定は「最も混雑する時刻」を表示。
    let best = 0;
    let bestSum = -1;
    for (let t = 0; t < times.length; t++) {
      let sum = 0;
      for (const s of shelters) sum += ratioAt(s, t);
      if (sum > bestSum) {
        bestSum = sum;
        best = t;
      }
    }
    sel = best;
    ready = true;
    wireControls();
    renderAll();
    if (map) {
      applyToMap();
      fitToData();
    }
  }

  // ---- 混雑度の計算 -----------------------------------------------
  function ratioAt(s: Shelter, t: number): number {
    const o = s.occ[t] ?? 0;
    return Math.max(0, Math.min(1, s.capacity ? o / s.capacity : 0));
  }

  // ---- 地図 -------------------------------------------------------
  function toFeature(s: Shelter): any {
    const r = ratioAt(s, sel);
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: s.coords },
      properties: {
        id: s.id,
        name: s.name,
        cap: s.capacity,
        occ: s.occ[sel] ?? 0,
        ratio: r,
        level: levelOf(r),
        // 収容人数で半径（sqrt スケール）
        rad: 7 + 13 * Math.sqrt(Math.min(1, s.capacity / 2400)),
      },
    };
  }
  function buildFC(): any {
    return { type: "FeatureCollection", features: shelters.map(toFeature) };
  }
  function applyToMap(): void {
    // レイヤ追加（地図スタイル読込完了）前に呼ばれても落ちないようガード。
    if (!map || !map.getSource || !map.getSource("shelters")) return;
    map.getSource("shelters").setData(buildFC());
    if (map.getLayer("shelter-sel"))
      map.setFilter("shelter-sel", ["==", ["get", "id"], selectedId ?? "__none__"]);
  }

  // 全避難所が収まるよう地図をフィット（固定 center/zoom より確実に全件を枠内に収める）。
  function fitToData(): void {
    if (!map || !GL || !shelters.length) return;
    const b = new GL.LngLatBounds();
    shelters.forEach((s) => b.extend(s.coords));
    if (!b.isEmpty()) map.fitBounds(b, { padding: 48, maxZoom: 15, duration: 0 });
  }

  function addLayers(): void {
    map.addSource("shelters", { type: "geojson", data: buildFC() });
    const colorExpr = ["match", ["get", "level"], 0, GREEN, 1, AMBER, 2, RED, "#888"];
    // 選択中の避難所を強調するリング（下に敷く）
    map.addLayer({
      id: "shelter-sel",
      type: "circle",
      source: "shelters",
      filter: ["==", ["get", "id"], "__none__"],
      paint: {
        "circle-radius": ["+", ["get", "rad"], 7],
        "circle-color": "rgba(255,255,255,0)",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3,
      },
    });
    map.addLayer({
      id: "shelter-point",
      type: "circle",
      source: "shelters",
      paint: {
        "circle-radius": ["get", "rad"],
        "circle-color": colorExpr as any,
        "circle-opacity": 0.9,
        "circle-stroke-color": "#0a0f1c",
        "circle-stroke-width": 1.5,
      },
    });

    mapEl = byId("shelter-map");
    function correctedPoint(ev: MouseEvent): [number, number] {
      const rect = mapEl!.getBoundingClientRect();
      const sx = mapEl!.offsetWidth / rect.width;
      const sy = mapEl!.offsetHeight / rect.height;
      return [(ev.clientX - rect.left) * sx, (ev.clientY - rect.top) * sy];
    }
    mapEl!.addEventListener("click", (ev) => {
      const pt = correctedPoint(ev);
      const hit = map.queryRenderedFeatures(pt, { layers: ["shelter-point"] });
      if (hit.length) {
        selectShelter(hit[0].properties.id, hit[0].geometry.coordinates.slice());
      } else {
        selectShelter(null);
      }
    });
    mapEl!.addEventListener("mousemove", (ev) => {
      const hit = map.queryRenderedFeatures(correctedPoint(ev), { layers: ["shelter-point"] });
      map.getCanvas().style.cursor = hit.length ? "pointer" : "";
    });
    // CSS scale() 下では MapLibre 内蔵ズームのアンカーがずれるため無効化し、
    // スケール補正した位置を中心にホイールズームする（AED マップと同じ方式）。
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

  // ---- 受入率スパークライン（ポップアップ内・コンパクト） ---------
  const VB_W = 220,
    VB_H = 56,
    PAD = 5;
  function xAt(i: number): number {
    return PAD + (times.length < 2 ? 0 : (i / (times.length - 1)) * (VB_W - 2 * PAD));
  }
  function yAt(pct: number): number {
    return VB_H - PAD - (pct / 100) * (VB_H - 2 * PAD);
  }
  function chartSvg(s: Shelter): string {
    const pcts = s.occ.map((o) => Math.min(100, (o / s.capacity) * 100));
    let line = "";
    pcts.forEach((p, i) => {
      line += (i ? " L" : "M") + xAt(i).toFixed(1) + "," + yAt(p).toFixed(1);
    });
    const area =
      line +
      " L" + xAt(pcts.length - 1).toFixed(1) + "," + (VB_H - PAD) +
      " L" + xAt(0).toFixed(1) + "," + (VB_H - PAD) + " Z";
    const curPct = pcts[sel] ?? 0;
    const col = levelOf(curPct / 100) === 2 ? RED : levelOf(curPct / 100) === 1 ? AMBER : GREEN;
    return (
      '<svg class="shelter-pop-svg" viewBox="0 0 ' + VB_W + " " + VB_H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="shFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#fc6c00" stop-opacity="0.35"/>' +
      '<stop offset="1" stop-color="#fc6c00" stop-opacity="0.02"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#shFill)"/>' +
      '<path d="' + line + '" fill="none" stroke="#fc6c00" stroke-width="2" stroke-linejoin="round"/>' +
      '<line x1="' + xAt(sel).toFixed(1) + '" y1="0" x2="' + xAt(sel).toFixed(1) + '" y2="' + VB_H +
      '" stroke="#12a594" stroke-width="1.2" stroke-dasharray="3 3"/>' +
      '<circle cx="' + xAt(sel).toFixed(1) + '" cy="' + yAt(curPct).toFixed(1) +
      '" r="4" fill="' + col + '" stroke="#fff" stroke-width="1.5"/>' +
      "</svg>"
    );
  }

  // 避難所クリック時のポップアップ内容（名称＋受入状況＋受入率スパークライン）。
  function popupHtml(s: Shelter): string {
    const r = ratioAt(s, sel);
    const lv = levelOf(r);
    const badge = lv === 2 ? "満員間近" : lv === 1 ? "やや混雑" : "空きあり";
    const col = lv === 2 ? RED : lv === 1 ? AMBER : GREEN;
    return (
      '<div class="shelter-pop">' +
      '<div class="shelter-pop__name">' + esc(s.name) + "</div>" +
      (s.address ? '<div class="shelter-pop__addr">' + esc(s.address) + "</div>" : "") +
      '<div class="shelter-pop__stat">' +
      '<span class="shelter-pop__badge" style="background:' + col + '">' + badge + "</span>" +
      (s.occ[sel] ?? 0) + " / " + s.capacity + "人（" + Math.round(r * 100) + "%）" +
      "</div>" +
      '<div class="shelter-pop__chart-t">受入率の推移（24時間）</div>' +
      chartSvg(s) +
      "</div>"
    );
  }

  function selectShelter(id: string | null, popupAt?: LngLat): void {
    if (popup) {
      popup.remove();
      popup = null;
    }
    selectedId = id;
    if (map) map.setFilter("shelter-sel", ["==", ["get", "id"], id ?? "__none__"]);
    if (id && popupAt && GL) {
      const s = shelters.find((x) => x.id === id);
      if (s) {
        // ポップアップが地図外にはみ出さないよう、クリック位置に応じて中央側へ開く。
        const p = map.project(popupAt);
        const w = mapEl?.offsetWidth ?? 0;
        const h = mapEl?.offsetHeight ?? 0;
        const v = p.y > h * 0.55 ? "bottom" : p.y < h * 0.45 ? "top" : "";
        const hz = p.x > w * 0.6 ? "right" : p.x < w * 0.4 ? "left" : "";
        const anchor = [v, hz].filter(Boolean).join("-") || "bottom";
        popup = new GL.Popup({ offset: 12, closeButton: true, maxWidth: "230px", anchor, className: "shelter-popup" })
          .setLngLat(popupAt)
          .setHTML(popupHtml(s))
          .addTo(map);
        popup.on("close", () => {
          popup = null;
          if (selectedId === id) {
            selectedId = null;
            if (map) map.setFilter("shelter-sel", ["==", ["get", "id"], "__none__"]);
          }
        });
      }
    }
  }

  // スライダーで時刻が変わったら、開いているポップアップのグラフ/数値も更新。
  function refreshPopup(): void {
    if (!popup || !selectedId) return;
    const s = shelters.find((x) => x.id === selectedId);
    if (s) popup.setHTML(popupHtml(s));
  }

  // ---- パネル（時刻ラベル・凡例） ---------------------------------
  function timeLabel(iso: string): string {
    return iso.slice(5, 10).replace("-", "/") + " " + iso.slice(11, 16);
  }

  function renderAll(): void {
    renderClock();
    renderLegend();
  }
  function renderClock(): void {
    const el = byId("shelter-time");
    if (el && times[sel]) el.textContent = timeLabel(times[sel]);
  }
  function renderLegend(): void {
    let g = 0,
      a = 0,
      r = 0;
    shelters.forEach((s) => {
      const lv = levelOf(ratioAt(s, sel));
      if (lv === 2) r++;
      else if (lv === 1) a++;
      else g++;
    });
    const set = (id: string, n: number) => {
      const el = byId(id);
      if (el) el.textContent = String(n);
    };
    set("shelter-n-green", g);
    set("shelter-n-amber", a);
    set("shelter-n-red", r);
  }
  // 実際に投げている Temporal API リクエストをパネルに表示（固定期間の一括取得）。
  function renderQuery(): void {
    const el = byId("shelter-query");
    if (!el) return;
    el.textContent =
      "GET /ngsi-ld/v1/temporal/entities\n" +
      "  ?type=" + SH.type + "\n" +
      "  &timerel=between\n" +
      "  &timeAt=" + SH.from + "\n" +
      "  &endTimeAt=" + SH.to + "\n" +
      "  &attrs=occupancy";
  }

  // ---- スライダー / 再生 ------------------------------------------
  function setSel(i: number): void {
    sel = Math.max(0, Math.min(times.length - 1, i | 0));
    const sl = byId<HTMLInputElement>("shelter-slider");
    if (sl && +sl.value !== sel) sl.value = String(sel);
    renderClock();
    renderLegend();
    applyToMap();
    refreshPopup();
  }
  function play(): void {
    const btn = byId("shelter-play");
    if (playTimer) return stop();
    if (sel >= times.length - 1) setSel(0);
    if (btn) btn.textContent = "⏸ 停止";
    playTimer = window.setInterval(() => {
      if (sel >= times.length - 1) return stop();
      setSel(sel + 1);
    }, 220);
  }
  function stop(): void {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    const btn = byId("shelter-play");
    if (btn) btn.textContent = "▶ 再生";
  }
  let wired = false;
  function wireControls(): void {
    if (wired) return;
    wired = true;
    const sl = byId<HTMLInputElement>("shelter-slider");
    if (sl) {
      sl.max = String(times.length - 1);
      sl.value = String(sel);
      sl.addEventListener("input", () => {
        stop();
        setSel(+sl.value);
      });
    }
    byId("shelter-play")?.addEventListener("click", play);
    renderQuery();
  }

  // ---- 起動 -------------------------------------------------------
  function ensureDb(): GeonicDB {
    if (!db) db = createClient();
    return db;
  }
  function prefetch(): void {
    ensureDb();
    loadData().catch((err: unknown) => {
      console.error("[shelter]", err);
    });
  }
  function start(): void {
    if (started) return;
    started = true;
    ensureDb();
    void loadData().catch((err: unknown) => {
      console.error("[shelter]", err);
    });
    GL = window.geolonia || window.maplibregl || null;
    if (!GL || typeof GL.Map !== "function") {
      console.error("[shelter] 地図ライブラリ（Geolonia Maps）の読み込みに失敗しました");
      return;
    }
    const styleUrl = import.meta.env.BASE_URL + "assets/map-style.json";
    fetch(styleUrl)
      .then((r) => r.json())
      .then((style: any) => {
        style.sprite = location.origin + import.meta.env.BASE_URL + "assets/sprites/gsi";
        map = new GL!.Map({
          container: "shelter-map",
          style,
          center: SH.center,
          zoom: SH.zoom,
          renderWorldCopies: false,
        });
        map.on("load", () => {
          addLayers();
          if (ready) {
            applyToMap();
            fitToData();
          }
        });
      })
      .catch((err: unknown) => {
        console.error("[shelter] map style", err);
      });
  }

  onSlideChange(({ index }) => {
    if (index === SLIDE_INDEX - 1) {
      whenIdle(prefetch); // 1 つ前で DPoP トークンを温め＋データ先読み
    } else if (index === SLIDE_INDEX) {
      whenIdle(prefetch);
      start();
      if (map)
        setTimeout(() => {
          map.resize();
          fitToData();
        }, 60);
    } else {
      stop(); // スライドを離れたら再生を止める
    }
  });
}
