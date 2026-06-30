/* ===================================================================
   Temporal「タイムマシン」デモ。
   GeonicDB SDK（DPoP）＋ Temporal API で WeatherObserved の履歴を取得し、
   時間を遡ってスクラブできる。チャートが 1 日分を描画、スライダーで瞬間を選び、
   スナップショットカードがその時刻の状態を表示。読み取り専用（readonly キー）。
   =================================================================== */
import type GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "../lib/config";
import { createClient } from "../lib/client";
import { byId, whenIdle } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";

interface SeriesPoint {
  iso: string;
  date: string;
  time: string;
  temp: number;
  hum?: number;
}

export function initTemporal(): void {
  const DT = config.demos.temporal;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const TMP_SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--tmp") as Element);

  let db: GeonicDB | null = null;
  let started = false;
  let series: SeriesPoint[] = [];
  let sel = 0;
  let playTimer: number | null = null;

  const attrVal = (a: unknown): unknown =>
    a && typeof a === "object" && "value" in a ? (a as { value: unknown }).value : a;

  function setConn(state: "on" | "off" | "wait"): void {
    const dot = byId("tmp-dot");
    const conn = byId("tmp-conn");
    if (!dot || !conn) return;
    dot.className = "rsv-live__dot rsv-live__dot--" + state;
    conn.textContent =
      state === "on" ? "Temporal API 接続" : state === "off" ? "取得失敗" : "接続中…";
  }

  // NGSI-LD の temporal インスタンス → ソート済み [{iso, v}]
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

  function buildSeries(entity: Record<string, unknown>): void {
    const temps = instances(entity.temperature);
    const hums = instances(entity.humidity);
    const humAt: Record<string, number> = Object.create(null);
    hums.forEach((h) => (humAt[h.iso] = h.v));
    series = temps.map((t) => ({
      iso: t.iso,
      date: t.iso.slice(5, 10).replace("-", "/"),
      time: t.iso.slice(11, 16),
      temp: t.v,
      hum: humAt[t.iso],
    }));
  }

  // ---- chart ----
  const VB_W = 760,
    VB_H = 360,
    PL = 46,
    PR = 16,
    PT = 18,
    PB = 30;
  const xAt = (i: number) =>
    PL + (series.length < 2 ? 0 : (i / (series.length - 1)) * (VB_W - PL - PR));
  let tMin = 0,
    tMax = 1;
  function yAt(v: number): number {
    const span = tMax - tMin || 1;
    return VB_H - PB - ((v - tMin) / span) * (VB_H - PT - PB);
  }

  function drawChart(): void {
    const svg = byId("tmp-chart");
    if (!svg || !series.length) return;
    const temps = series.map((s) => s.temp);
    tMin = Math.floor(Math.min(...temps) - 1);
    tMax = Math.ceil(Math.max(...temps) + 1);

    let line = "";
    series.forEach((s, i) => {
      const x = xAt(i).toFixed(1),
        y = yAt(s.temp).toFixed(1);
      line += (i ? " L" : "M") + x + "," + y;
    });
    const area =
      line +
      " L" +
      xAt(series.length - 1).toFixed(1) +
      "," +
      (VB_H - PB) +
      " L" +
      xAt(0).toFixed(1) +
      "," +
      (VB_H - PB) +
      " Z";

    let yl = "";
    [tMin, Math.round((tMin + tMax) / 2), tMax].forEach((v) => {
      const y = yAt(v).toFixed(1);
      yl +=
        '<line x1="' +
        PL +
        '" y1="' +
        y +
        '" x2="' +
        (VB_W - PR) +
        '" y2="' +
        y +
        '" stroke="rgba(255,255,255,.08)" stroke-width="1"/>' +
        '<text x="' +
        (PL - 8) +
        '" y="' +
        (+y + 4) +
        '" text-anchor="end" fill="rgba(255,255,255,.45)" font-size="12" font-family="var(--font-mono)">' +
        v +
        "°</text>";
    });
    let xl = "";
    series.forEach((s, i) => {
      const hh = +s.time.slice(0, 2);
      if (s.time.slice(3) === "00" && hh % 6 === 0) {
        xl +=
          '<text x="' +
          xAt(i).toFixed(1) +
          '" y="' +
          (VB_H - 8) +
          '" text-anchor="middle" fill="rgba(255,255,255,.45)" font-size="12" font-family="var(--font-mono)">' +
          s.time +
          "</text>";
      }
    });

    svg.innerHTML =
      '<defs><linearGradient id="tmpFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#fc6c00" stop-opacity="0.42"/>' +
      '<stop offset="1" stop-color="#fc6c00" stop-opacity="0"/></linearGradient></defs>' +
      yl +
      xl +
      '<path d="' +
      area +
      '" fill="url(#tmpFill)"/>' +
      '<path d="' +
      line +
      '" fill="none" stroke="#fc6c00" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<line id="tmp-marker" x1="0" y1="' +
      PT +
      '" x2="0" y2="' +
      (VB_H - PB) +
      '" stroke="#39d6c6" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<circle id="tmp-dot-pt" r="6" fill="#39d6c6" stroke="#0a0f1c" stroke-width="2"/>';
    moveMarker();
  }

  function moveMarker(): void {
    const mk = byId("tmp-marker");
    const pt = byId("tmp-dot-pt");
    const p = series[sel];
    if (!mk || !pt || !p) return;
    const x = String(xAt(sel)),
      y = String(yAt(p.temp));
    mk.setAttribute("x1", x);
    mk.setAttribute("x2", x);
    pt.setAttribute("cx", x);
    pt.setAttribute("cy", y);
  }

  function renderSnapshot(): void {
    const s = series[sel];
    if (!s) return;
    const time = byId("tmp-time");
    if (time) time.textContent = s.date + " " + s.time;
    const temp = byId("tmp-temp");
    if (temp) temp.textContent = s.temp.toFixed(1);
    const hum = byId("tmp-hum");
    if (hum) hum.textContent = s.hum != null ? String(Math.round(s.hum)) : "--";
    const query = byId("tmp-query");
    if (query) {
      query.textContent =
        "GET /ngsi-ld/v1/temporal/entities/\n" +
        "  " +
        (DT.entityId.split(":").pop() ?? "") +
        "\n" +
        "  ?timerel=before&timeAt=" +
        s.iso +
        "\n" +
        "  &attrs=temperature,humidity";
    }
    moveMarker();
  }

  function setSel(i: number): void {
    sel = Math.max(0, Math.min(series.length - 1, i | 0));
    const sl = byId<HTMLInputElement>("tmp-slider");
    if (sl && +sl.value !== sel) sl.value = String(sel);
    renderSnapshot();
  }

  function play(): void {
    const btn = byId("tmp-play");
    if (playTimer) {
      stop();
      return;
    }
    if (sel >= series.length - 1) setSel(0);
    if (btn) btn.textContent = "⏸ 停止";
    playTimer = window.setInterval(() => {
      if (sel >= series.length - 1) {
        stop();
        return;
      }
      setSel(sel + 1);
    }, 160);
  }
  function stop(): void {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    const btn = byId("tmp-play");
    if (btn) btn.textContent = "▶ 再生";
  }

  function load(): Promise<void> {
    const path =
      "/ngsi-ld/v1/temporal/entities/" +
      encodeURIComponent(DT.entityId) +
      "?timerel=between&timeAt=" +
      encodeURIComponent(DT.from) +
      "&endTimeAt=" +
      encodeURIComponent(DT.to);
    return db!.request("GET", path).then((res) => {
      const ent = (Array.isArray(res) ? res[0] : res) as Record<string, unknown> | undefined;
      if (!ent) throw new Error("no temporal data");
      buildSeries(ent);
      if (!series.length) throw new Error("empty series");
      setConn("on");
      const sl = byId<HTMLInputElement>("tmp-slider");
      if (sl) {
        sl.max = String(series.length - 1);
        sl.value = String(series.length - 1);
      }
      const range = byId("tmp-range");
      if (range)
        range.textContent =
          "（" +
          series[0]!.time +
          "〜" +
          series[series.length - 1]!.time +
          " / " +
          series.length +
          "点）";
      drawChart();
      setSel(series.length - 1);
    });
  }

  function start(): void {
    if (started) return;
    started = true;
    db = createClient("readonly");
    load().catch((err: unknown) => {
      console.error("[temporal]", err);
      setConn("off");
      const query = byId("tmp-query");
      if (query) query.textContent = "取得に失敗しました: " + (err instanceof Error ? err.message : String(err));
    });
    const sl = byId<HTMLInputElement>("tmp-slider");
    if (sl)
      sl.addEventListener("input", () => {
        stop();
        setSel(+sl.value);
      });
    byId("tmp-play")?.addEventListener("click", play);
  }

  onSlideChange(({ index }) => {
    // 1 つ前で先読み＋描画して到達時に即表示。重い DPoP/トークン処理はアイドルへ。
    if (index === TMP_SLIDE_INDEX - 1) whenIdle(start);
    else if (index === TMP_SLIDE_INDEX) start();
    else stop(); // スライドを離れたら再生を止める
  });
}
