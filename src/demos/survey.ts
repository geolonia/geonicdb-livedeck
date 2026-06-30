/* ===================================================================
   ライブアンケートデモ。
   GeonicDB SDK（DPoP / PoW トークン交換）＋ WebSocket。
   投票（左）が PollVote エンティティを作成し、集計バー（右）が WS の entityCreated を
   通じて全視聴者の票をリアルタイム集計する。
   =================================================================== */
import type GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "../lib/config";
import { createClient } from "../lib/client";
import { byId, whenIdle } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";

interface Option {
  choice: string;
  label: string;
  color: string;
}

/** WS / 楽観更新で共通に扱う、エンティティ風イベントの最小形。 */
interface VoteEvent {
  entityId?: string;
  entityType?: string;
  entity?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export function initSurvey(): void {
  const DS = config.demos.survey;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const SVY_SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--svy") as Element);

  // 表示する選択肢とバー色（index.html のボタンと一致させる）。
  const OPTIONS: Option[] = [
    { choice: "geoquery", label: "ジオクエリ", color: "#fc6c00" },
    { choice: "realtime", label: "リアルタイム通知", color: "#fba40c" },
    { choice: "reactivecore", label: "ReactiveCore Rules", color: "#39d6c6" },
    { choice: "standards", label: "標準準拠（NGSI-LD）", color: "#e8401e" },
  ];

  let db: GeonicDB | null = null;
  let started = false;
  const seen: Record<string, true> = Object.create(null); // vote id -> true（重複排除）
  const counts: Record<string, number> = Object.create(null); // choice -> 票数
  OPTIONS.forEach((o) => (counts[o.choice] = 0));

  const attrVal = (a: unknown): unknown =>
    a && typeof a === "object" && "value" in a ? (a as { value: unknown }).value : a;
  const field = (e: Record<string, unknown> | null, name: string): unknown =>
    e ? attrVal(e[name]) : undefined;
  const total = () => OPTIONS.reduce((s, o) => s + (counts[o.choice] ?? 0), 0);

  function setConn(state: "on" | "off" | "wait"): void {
    const dot = byId("svy-dot");
    const conn = byId("svy-conn");
    if (!dot || !conn) return;
    dot.className = "rsv-live__dot rsv-live__dot--" + state;
    conn.textContent =
      state === "on" ? "リアルタイム接続中" : state === "off" ? "切断 — 再接続中…" : "接続中…";
  }
  function setMsg(text: string, kind?: string): void {
    const el = byId("svy-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "svy-msg" + (kind ? " svy-msg--" + kind : "");
  }

  // チャートの行を一度だけ作り、以降は幅とラベルのみ更新する。
  function buildChart(): void {
    const chart = byId("svy-chart");
    if (!chart || chart.childElementCount) return;
    chart.innerHTML = OPTIONS.map(
      (o) =>
        '<div class="svy-row" data-choice="' +
        o.choice +
        '"><div class="svy-row__head"><span class="svy-row__label">' +
        o.label +
        '</span><span class="svy-row__val"><span class="svy-row__n">0</span>' +
        '<span class="svy-row__pct">0%</span></span></div>' +
        '<div class="svy-bar"><div class="svy-bar__fill" style="background:' +
        o.color +
        '"></div></div></div>',
    ).join("");
  }

  function render(): void {
    buildChart();
    const t = total();
    const tot = byId("svy-total");
    if (tot) tot.textContent = t ? "（" + t + " 票）" : "";
    OPTIONS.forEach((o) => {
      const row = document.querySelector<HTMLElement>('.svy-row[data-choice="' + o.choice + '"]');
      if (!row) return;
      const n = counts[o.choice] ?? 0;
      const pct = t > 0 ? Math.round((n / t) * 100) : 0;
      const nEl = row.querySelector<HTMLElement>(".svy-row__n");
      const pctEl = row.querySelector<HTMLElement>(".svy-row__pct");
      const fill = row.querySelector<HTMLElement>(".svy-bar__fill");
      if (nEl) nEl.textContent = String(n);
      if (pctEl) pctEl.textContent = pct + "%";
      if (fill) fill.style.width = pct + "%";
    });
  }

  // 1 票を集計（id で冪等）。
  function tally(e: Record<string, unknown> | null): boolean {
    const id = e?.id as string | undefined;
    if (!e || !id || seen[id]) return false;
    if (field(e, "poll") !== DS.poll) return false; // 他 poll の票は無視
    const c = field(e, "choice") as string;
    if (!(c in counts)) return false;
    seen[id] = true;
    counts[c] = (counts[c] ?? 0) + 1;
    return true;
  }

  function evtEntity(evt: VoteEvent | null): Record<string, unknown> | null {
    if (!evt) return null;
    if (evt.entity && evt.entity.id) return evt.entity;
    const e: Record<string, unknown> = {};
    if (evt.data) for (const k in evt.data) e[k] = evt.data[k];
    e.id = evt.entityId;
    e.type = evt.entityType || DS.type;
    return e.id ? e : null;
  }

  function onCreated(evt: VoteEvent): void {
    const e = evtEntity(evt);
    if (tally(e)) {
      const row = document.querySelector<HTMLElement>(
        '.svy-row[data-choice="' + field(e, "choice") + '"]',
      );
      if (row) {
        row.classList.remove("is-bump");
        void row.offsetWidth;
        row.classList.add("is-bump");
      }
      render();
    }
  }

  function load(): Promise<void> {
    return db!.getEntities({ type: DS.type, limit: 1000 }).then((res) => {
      const list = Array.isArray(res) ? res : [];
      list.forEach((e) => tally(e));
      render();
    });
  }

  function connect(): void {
    db!.on("entityCreated", (evt) => onCreated(evt as unknown as VoteEvent));
    db!.on("connected", () => setConn("on"));
    db!.on("open", () => setConn("on"));
    db!.on("disconnected", () => setConn("off"));
    db!.on("close", () => setConn("off"));
    db!.on("error", (err) => console.warn("[survey] ws", err));
    db!.subscribe({ entityTypes: [DS.type] });
    db!.connect().catch((err: unknown) => {
      console.warn("[survey] connect failed", err);
      setConn("off");
    });
  }

  function genId(): string {
    let r = "";
    for (let i = 0; i < 10; i++) r += Math.floor(Math.random() * 36).toString(36);
    return "urn:ngsi-ld:PollVote:" + Date.now().toString(36) + "-" + r;
  }

  function vote(choice: string): void {
    if (!db || !(choice in counts)) return;
    const entity = {
      id: genId(),
      type: DS.type,
      poll: { type: "Property", value: DS.poll },
      choice: { type: "Property", value: choice },
    };
    db.createEntity(entity)
      .then(() => {
        // 楽観的にローカル集計。WS エコー（同 id）は `seen` で冪等。
        // フィードバックはバーの bump アニメ（確認メッセージは出さない）。
        onCreated({ entityId: entity.id, entityType: DS.type, entity });
      })
      .catch((err: unknown) => {
        setMsg("失敗: " + (err instanceof Error ? err.message : String(err)), "err");
      });
  }

  function onOptionsClick(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null;
    const btn = target?.closest<HTMLElement>(".svy-opt");
    if (!btn) return;
    const choice = btn.getAttribute("data-choice");
    const opts = byId("svy-options");
    if (opts)
      opts.querySelectorAll<HTMLElement>(".svy-opt").forEach((b) => {
        b.classList.toggle("is-chosen", b === btn);
      });
    if (choice) vote(choice);
  }

  function start(): void {
    if (started) return;
    started = true;
    buildChart();
    render();
    db = createClient("survey");
    load()
      .then(connect)
      .catch((err: unknown) => {
        console.error("[survey]", err);
        setMsg("読み込み失敗: " + (err instanceof Error ? err.message : String(err)), "err");
        connect();
      });
    byId("svy-options")?.addEventListener("click", onOptionsClick as EventListener);
  }

  onSlideChange(({ index }) => {
    // 1 つ前で先読み。重い DPoP/トークン処理はアイドルへ。
    if (index === SVY_SLIDE_INDEX - 1) whenIdle(start);
    else if (index === SVY_SLIDE_INDEX) start();
  });
}
