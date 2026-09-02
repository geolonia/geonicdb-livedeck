/* ===================================================================
   FOSS4G Hiroshima 2026 会場投稿デモ（NGSI-LD ライブデモ・feedback.ts の
   構成に倣う）。認証なし・スマホ前提・日英併記。

   左のフォーム送信が「カスタムデータモデル」の NGSI-LD エンティティ
   （type=Contribution）を作成する。第一段(必須): 出身地＋名物。
   第二段(任意): 地元の隠れ名所。主催者による事前仕込み投稿は
   seeded=true として区別する（会場のデータと偽らない）。

   右はタブ切替で「集計結果（出身地・名物の件数上位）」
   「NGSI-LD エンティティ（送信前は最新の投稿を表示）」
   「カスタムデータモデル（GET /custom-data-models/Contribution）」を
   表示し、件数・集計は WebSocket の entityCreated でリアルタイム更新する。
   認可は Contribution 専用の integration key（テナント foss4g_2026・
   ENTERPRISE契約。デッキ共通の config.key/miya とは別物)。
   =================================================================== */
import type GeonicDB from "@geolonia/geonicdb-sdk";
import { createContributionClient } from "../lib/client";
import { byId, escapeHtml, whenIdle } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";
import { waitAuthJitter, withAuthRetry } from "../lib/authGate";
import { validateContribution, type ContributionInput, type ContributionField } from "./contributionValidation";
import { buildContributionEntity, CONTRIBUTION_MODEL } from "./contributionEntity";

/** WS / 楽観更新で共通に扱う、エンティティ風イベントの最小形。 */
interface CbEvent {
  entityId?: string;
  entityType?: string;
  entity?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/** 集計の 1 行（出身地・名物どちらの棒グラフにも使う）。 */
interface BarItem {
  key: string;
  n: number;
  seeded: boolean;
}

const TOP_N = 8;

export function initContribution(): void {
  const slides = Array.from(document.querySelectorAll(".slide"));
  const CB_SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--cb") as Element);

  let db: GeonicDB | null = null;
  let started = false;
  const seen: Record<string, true> = Object.create(null); // id -> true（総件数の冪等集計）
  const seenChart: Record<string, true> = Object.create(null); // id -> true（集計の冪等反映）
  let realCount = 0;
  let seededCount = 0;
  const originCounts: Record<string, { n: number; seeded: boolean }> = Object.create(null);
  const specialtyCounts: Record<string, { n: number; seeded: boolean }> = Object.create(null);

  // ---- helpers ----
  const input = (id: string) => byId<HTMLInputElement>(id);
  const nowIso = () => new Date().toISOString();

  function setConn(state: "on" | "off" | "wait"): void {
    const dot = byId("cb-dot");
    const conn = byId("cb-conn");
    if (dot) dot.className = "rsv-live__dot rsv-live__dot--" + state;
    if (conn)
      conn.textContent =
        state === "on" ? "リアルタイム接続中" : state === "off" ? "切断 — 再接続中…" : "接続中…";
  }
  function setCount(): void {
    const el = byId("cb-count");
    if (!el) return;
    // 仕込み投稿は「会場からの投稿」と別枠で明示する（会場のデータと偽らない）。
    el.textContent =
      "会場からの投稿 " + realCount + " 件" + (seededCount ? "（仕込み " + seededCount + " 件）" : "");
  }
  const SUBMIT_LABEL = "▶ 投稿する / Submit";
  let btnTimer = 0;
  function buttonState(cls: "is-ok" | "is-err", label: string): void {
    const btn = byId("cb-submit");
    if (!btn) return;
    btn.classList.remove("is-ok", "is-err");
    btn.classList.add(cls);
    btn.textContent = label;
    if (btnTimer) window.clearTimeout(btnTimer);
    btnTimer = window.setTimeout(() => {
      btn.classList.remove("is-ok", "is-err");
      btn.textContent = SUBMIT_LABEL;
    }, 2400);
  }

  // ---- バリデーションエラー表示 ----
  function renderErrors(errors: Partial<Record<ContributionField, string>>): void {
    (["origin", "specialty", "hiddenSpot"] as ContributionField[]).forEach((field) => {
      const el = byId("cb-err-" + field);
      if (el) el.textContent = errors[field] ?? "";
      const fieldInput = input("cb-" + field);
      if (fieldInput) fieldInput.setAttribute("aria-invalid", errors[field] ? "true" : "false");
    });
  }

  // ---- 送信 ----
  function readInput(): ContributionInput {
    return {
      origin: input("cb-origin")?.value ?? "",
      specialty: input("cb-specialty")?.value ?? "",
      hiddenSpot: input("cb-hiddenSpot")?.value ?? "",
    };
  }
  function submit(): void {
    const raw = readInput();
    const result = validateContribution(raw);
    renderErrors(result.errors);
    if (!result.ok) return;
    if (!db) return;
    const entity = buildContributionEntity(raw, { seeded: false, submittedAt: nowIso() });
    const btn = byId<HTMLButtonElement>("cb-submit");
    if (btnTimer) window.clearTimeout(btnTimer);
    if (btn) {
      btn.disabled = true;
      btn.classList.remove("is-ok", "is-err");
      btn.textContent = "送信中… / Sending…";
    }
    const client = db;
    // 投稿の一波もスロットル (429 / 500) を踏む。参加者に「失敗」と出す前に
    // バックオフで数回やり直す — 会場では画面を見て諦められてしまうため。
    withAuthRetry(() => client.createEntity(entity), { label: "contribution:submit", attempts: 3 })
      .then(() => {
        renderJson(entity);
        tally(entity);
        buttonState("is-ok", "✓ 投稿しました / Submitted");
        byId<HTMLFormElement>("cb-form")?.reset();
      })
      .catch((err: unknown) => {
        console.warn("[contribution] create failed", err);
        buttonState("is-err", "✗ 投稿に失敗 / Failed");
      })
      .finally(() => {
        if (btn) btn.disabled = false;
      });
  }

  // ---- 注釈付き JSON（feedback.ts と同じ配色規則） ----
  function highlightLine(line: string): string {
    return escapeHtml(line).replace(
      /(&quot;(\\.|[^&\\])*?&quot;(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?)/g,
      (m) => {
        let cls = "j-num";
        if (/^&quot;/.test(m)) cls = /:$/.test(m) ? "j-key" : "j-str";
        else if (/true|false|null/.test(m)) cls = "j-lit";
        return '<span class="' + cls + '">' + m + "</span>";
      },
    );
  }
  function tagFor(line: string): string {
    if (line.indexOf('"type": "' + CONTRIBUTION_MODEL.type + '"') >= 0)
      return '<span class="fb-tag fb-tag--ctx">🧩 カスタムデータモデル</span>';
    if (/"seeded": true/.test(line))
      return '<span class="fb-tag cb-tag--seed">🌱 仕込み(事前投入)</span>';
    return "";
  }
  function renderJson(entity: Record<string, unknown>): void {
    const pre = byId("cb-json");
    if (!pre) return;
    const lines = JSON.stringify(entity, null, 2).split("\n");
    pre.innerHTML = lines
      .map((ln) => {
        const tag = tagFor(ln);
        return highlightLine(ln) + (tag ? " " + tag : "");
      })
      .join("\n");
    pre.classList.remove("is-fresh");
    void pre.offsetWidth;
    pre.classList.add("is-fresh");
  }
  function renderModelObj(model: unknown): void {
    const pre = byId("cb-model");
    if (!pre) return;
    let view = model;
    if (model && typeof model === "object") {
      const m = { ...(model as Record<string, unknown>) };
      delete m.jsonSchema;
      view = m;
    }
    pre.innerHTML = JSON.stringify(view, null, 2).split("\n").map(highlightLine).join("\n");
  }
  function loadModel(): void {
    renderModelObj(CONTRIBUTION_MODEL);
    if (!db) return;
    db.request("GET", "/custom-data-models/" + CONTRIBUTION_MODEL.type)
      .then((live) => renderModelObj(live))
      .catch((e: unknown) => console.warn("[contribution] custom-data-model fetch failed", e));
  }
  function initTabs(): void {
    const root = document.querySelector(".slide--cb");
    if (!root) return;
    const tabs = Array.from(root.querySelectorAll<HTMLElement>(".fb-tab"));
    const panels = Array.from(root.querySelectorAll<HTMLElement>(".fb-panel"));
    tabs.forEach((t) =>
      t.addEventListener("click", () => {
        const panel = t.getAttribute("data-panel");
        tabs.forEach((x) => x.classList.toggle("is-active", x === t));
        panels.forEach((p) => {
          p.hidden = p.getAttribute("data-panel") !== panel;
        });
      }),
    );
  }

  // ---- 件数・集計（WS / 起動時ロード）----
  function entityField(e: Record<string, unknown>, key: string): string | undefined {
    const attr = e[key] as { value?: unknown } | undefined;
    return attr && typeof attr.value === "string" ? attr.value : undefined;
  }
  function entitySeeded(e: Record<string, unknown>): boolean {
    const attr = e.seeded as { value?: unknown } | undefined;
    return attr?.value === true;
  }
  function bump(map: Record<string, { n: number; seeded: boolean }>, key: string | undefined, seeded: boolean): void {
    if (!key) return;
    const cur = map[key] ?? { n: 0, seeded };
    cur.n += 1;
    if (seeded) cur.seeded = true; // 同名の仕込み投稿が1件でもあれば区別バッジを出す
    map[key] = cur;
  }
  function tally(e: Record<string, unknown> | null): void {
    const id = e?.id as string | undefined;
    if (!e || !id || seen[id]) return;
    seen[id] = true;
    const seeded = entitySeeded(e);
    if (seeded) seededCount += 1;
    else realCount += 1;
    setCount();
    if (!seenChart[id]) {
      seenChart[id] = true;
      bump(originCounts, entityField(e, "origin"), seeded);
      bump(specialtyCounts, entityField(e, "specialty"), seeded);
      renderChart();
    }
  }
  function evtEntity(evt: CbEvent | null): Record<string, unknown> | null {
    if (!evt) return null;
    if (evt.entity && evt.entity.id) return evt.entity;
    const e: Record<string, unknown> = {};
    if (evt.data) for (const k in evt.data) e[k] = evt.data[k];
    e.id = evt.entityId;
    e.type = evt.entityType || CONTRIBUTION_MODEL.type;
    return e.id ? e : null;
  }

  // ---- 集計結果タブ（出身地・名物の件数上位バー）----
  function topItems(map: Record<string, { n: number; seeded: boolean }>): BarItem[] {
    return Object.entries(map)
      .map(([key, v]) => ({ key, n: v.n, seeded: v.seeded }))
      .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
      .slice(0, TOP_N);
  }
  function renderBars(listId: string, items: BarItem[]): void {
    const list = byId(listId);
    if (!list) return;
    const max = items.reduce((m, it) => Math.max(m, it.n), 0) || 1;
    list.innerHTML = items
      .map(
        (it) =>
          '<div class="cb-bar-row">' +
          '<span class="cb-bar-label">' +
          escapeHtml(it.key) +
          (it.seeded ? ' <span class="cb-tag--seed">🌱仕込み</span>' : "") +
          "</span>" +
          '<span class="cb-bar-track"><span class="cb-bar-fill" style="width:' +
          Math.round((it.n / max) * 100) +
          '%"></span></span>' +
          '<span class="cb-bar-n">' +
          it.n +
          "</span></div>",
      )
      .join("");
  }
  function renderChart(): void {
    const totalEl = byId("cb-chart-total");
    if (totalEl) {
      const t = Object.keys(seenChart).length;
      totalEl.textContent = t ? "（全 " + t + " 件）" : "";
    }
    renderBars("cb-bars-origin", topItems(originCounts));
    renderBars("cb-bars-specialty", topItems(specialtyCounts));
  }

  function latestTs(e: Record<string, unknown>): string {
    const attr = e.submittedAt as { value?: unknown } | undefined;
    return typeof attr?.value === "string" ? attr.value : typeof e.id === "string" ? e.id : "";
  }
  function load(): Promise<void> {
    return db!.getEntities({ type: CONTRIBUTION_MODEL.type, limit: 1000 }).then((res) => {
      const list = Array.isArray(res) ? res : [];
      list.forEach((e) => tally(e));
      let latest: Record<string, unknown> | null = null;
      let best = "";
      for (const e of list) {
        const t = latestTs(e);
        if (t > best) {
          best = t;
          latest = e;
        }
      }
      if (latest) renderJson(latest);
    });
  }

  function connect(): void {
    db!.on("entityCreated", (evt) => {
      const ce = evt as unknown as CbEvent;
      tally(evtEntity(ce));
    });
    db!.on("connected", () => setConn("on"));
    db!.on("open", () => setConn("on"));
    db!.on("disconnected", () => setConn("off"));
    db!.on("close", () => setConn("off"));
    db!.on("error", (err) => console.warn("[contribution] ws", err));
    db!.subscribe({ entityTypes: [CONTRIBUTION_MODEL.type] });
    db!.connect().catch((err: unknown) => {
      console.warn("[contribution] connect failed", err);
      setConn("off");
    });
  }

  function start(): void {
    if (started) return;
    started = true;
    initTabs();
    setCount();
    renderChart();
    db = createContributionClient();
    // 会場の全員が同じ瞬間にこのスライドを開くと、SDK の認証ハンドシェイク
    // (/auth/nonce → /oauth/token) が一斉に制御プレーンへ集中して詰まる
    // (実測: 200 並列で 17.5% しか通らない)。最初のリクエストをランダムに
    // 遅らせて波を平らにし、それでも 429/5xx で落ちたらバックオフで待ち直す。
    // 発表者の画面だけ即座に出したいときは URL に ?nojitter を付ける。
    waitAuthJitter()
      .then(() => {
        loadModel();
        return withAuthRetry(load, { label: "contribution" });
      })
      .then(connect)
      .catch((err: unknown) => {
        console.error("[contribution]", err);
        connect();
      });
    byId("cb-form")?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      submit();
    });
  }

  onSlideChange(({ index }) => {
    if (index === CB_SLIDE_INDEX - 1) whenIdle(start);
    else if (index === CB_SLIDE_INDEX) start();
  });
}
