/* ===================================================================
   NGSI-LD ライブデモ（リンクトデータ）。
   GeonicDB SDK（DPoP / PoW トークン交換）＋ WebSocket。

   左のフォーム送信が「カスタムデータモデル」の NGSI-LD エンティティ（type=Feedback）を
   作成する。各項目は NGSI-LD の構文要素に対応:
     - 所属 / 期待度        → Property（期待度は observedAt メタデータ付き）
     - 関心ユースケース     → Relationship（urn:ngsi-ld:UseCase:*）
     - お住まいの地域       → Relationship（urn:ngsi-ld:AdministrativeArea:*）
     - 会場の位置           → GeoProperty（固定座標）

   右はタブ切替で「注釈付き NGSI-LD エンティティ（送信前は最新の回答を表示）」
   「カスタムデータモデル（GET /custom-data-models/Feedback の実データ）」
   「集計結果（関心・所属・地域の 3 つの円グラフ）」を表示し、
   件数・集計は WebSocket の entityCreated でリアルタイム更新する。
   認可はデッキ共通の統合キー（VITE_GEONICDB_KEY / 統合ポリシー geonicdb-livedeck-deck）。
   Feedback の GET|POST ＋ WS ＋ custom-data-models の GET、origin 制限・DPoP 必須。
   =================================================================== */
import type GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "../lib/config";
import { createClient } from "../lib/client";
import { byId, escapeHtml, whenIdle } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";

/** WS / 楽観更新で共通に扱う、エンティティ風イベントの最小形。 */
interface FbEvent {
  entityId?: string;
  entityType?: string;
  entity?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

const CORE_CONTEXT = "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.7.jsonld";

// サーバ登録済みのカスタムデータモデル（custom-data-models get Feedback の定義部分と一致）。
// id / contextUrl / jsonSchema / タイムスタンプ等の自動生成フィールドは冗長なので表示しない。
const FEEDBACK_MODEL = {
  type: "Feedback",
  domain: "Survey",
  description: "geonicdb-livedeck: 発表フィードバック（NGSI-LD リンクトデータデモ）",
  propertyDetails: {
    role: { ngsiType: "Property", valueType: "string", example: "municipality", required: true, description: "回答者の所属" },
    expectation: { ngsiType: "Property", valueType: "number", example: 5, required: true, description: "GeonicDB への期待度(1-5)" },
    interestedIn: { ngsiType: "Relationship", valueType: "uri", example: "urn:ngsi-ld:UseCase:disaster", required: true, description: "関心のあるユースケースへの参照" },
    region: { ngsiType: "Relationship", valueType: "uri", example: "urn:ngsi-ld:AdministrativeArea:13", required: true, description: "お住まいの地域への参照" },
    location: { ngsiType: "GeoProperty", valueType: "geojson", example: { type: "Point", coordinates: [134.0475, 34.34] }, required: true, description: "会場の位置" },
  },
};

// 集計結果タブの選択肢と色（キー・ラベルは左フォームの選択肢と一致させる）。
const USECASE_PREFIX = "urn:ngsi-ld:UseCase:";
const REGION_PREFIX = "urn:ngsi-ld:AdministrativeArea:";
const PIE_COLORS = ["#fc6c00", "#39d6c6", "#fba40c", "#e8401e", "#c89bff", "#6b7a90"];
const INTERESTS = [
  { key: "disaster", label: "防災・減災", color: PIE_COLORS[0] },
  { key: "environment", label: "環境モニタリング", color: PIE_COLORS[1] },
  { key: "mobility", label: "交通・モビリティ", color: PIE_COLORS[2] },
  { key: "energy", label: "エネルギー", color: PIE_COLORS[3] },
  { key: "opendata", label: "オープンデータ", color: PIE_COLORS[4] },
];
const ROLES = [
  { key: "municipality", label: "自治体", color: PIE_COLORS[0] },
  { key: "sier", label: "SIer・受託開発", color: PIE_COLORS[1] },
  { key: "startup", label: "スタートアップ", color: PIE_COLORS[2] },
  { key: "research", label: "研究・教育", color: PIE_COLORS[3] },
  { key: "other", label: "その他", color: PIE_COLORS[4] },
];

/** 円グラフの 1 スライス。 */
interface PieItem {
  key: string;
  label: string;
  color: string;
  n: number;
}
/** 1 回答が各グラフに与える集計キー（bump 対象の伝搬用）。 */
interface TallyKeys {
  interest?: string;
  role?: string;
  region?: string;
}

export function initFeedback(): void {
  const FB = config.demos.feedback;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const FB_SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--fb") as Element);

  let db: GeonicDB | null = null;
  let started = false;
  let stars = 5; // 期待度の初期値
  const seen: Record<string, true> = Object.create(null); // feedback id -> true（件数の冪等集計）
  const seenChart: Record<string, true> = Object.create(null); // feedback id -> true（集計結果の冪等集計）
  const interestCounts: Record<string, number> = Object.create(null); // usecase key -> 件数
  const roleCounts: Record<string, number> = Object.create(null); // role key -> 件数
  const regionCounts: Record<string, number> = Object.create(null); // 都道府県コード -> 件数
  INTERESTS.forEach((o) => (interestCounts[o.key] = 0));
  ROLES.forEach((o) => (roleCounts[o.key] = 0));

  // ---- helpers ----
  const sel = (id: string) => byId<HTMLSelectElement>(id);
  const nowIso = () => new Date().toISOString();

  function setConn(state: "on" | "off" | "wait"): void {
    const dot = byId("fb-dot");
    const conn = byId("fb-conn");
    if (dot) dot.className = "rsv-live__dot rsv-live__dot--" + state;
    if (conn)
      conn.textContent =
        state === "on" ? "リアルタイム接続中" : state === "off" ? "切断 — 再接続中…" : "接続中…";
  }
  function setCount(): void {
    const el = byId("fb-count");
    if (el) el.textContent = "これまでの回答 " + Object.keys(seen).length + " 件";
  }
  // 送信の成否はメッセージではなくボタン内の表示で示す（数秒で元に戻る）。
  const SUBMIT_LABEL = "▶ NGSI-LD で送信";
  let btnTimer = 0;
  function buttonState(cls: "is-ok" | "is-err", label: string): void {
    const btn = byId("fb-submit");
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

  // ---- 期待度（星）----
  function paintStars(): void {
    byId("fb-expect")
      ?.querySelectorAll<HTMLElement>(".fb-star")
      .forEach((b) => {
        const v = Number(b.getAttribute("data-val"));
        b.classList.toggle("is-on", v <= stars); // 見た目は選択値までを塗る
        b.setAttribute("aria-checked", v === stars ? "true" : "false"); // 選択値のみ checked
      });
  }
  function onStarsClick(ev: MouseEvent): void {
    const btn = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".fb-star");
    if (!btn) return;
    stars = Number(btn.getAttribute("data-val")) || stars;
    paintStars();
  }

  // ---- NGSI-LD エンティティの組み立て（カスタムデータモデル）----
  function genId(): string {
    let r = "";
    for (let i = 0; i < 10; i++) r += Math.floor(Math.random() * 36).toString(36);
    return "urn:ngsi-ld:" + FB.type + ":" + Date.now().toString(36) + "-" + r;
  }
  function buildEntity(): Record<string, unknown> {
    const role = sel("fb-role")?.value ?? "other";
    const interest = sel("fb-interest")?.value ?? "disaster";
    const region = sel("fb-region")?.value ?? "37";
    return {
      "@context": CORE_CONTEXT,
      id: genId(),
      type: FB.type,
      role: { type: "Property", value: role },
      expectation: { type: "Property", value: stars, observedAt: nowIso() },
      interestedIn: { type: "Relationship", object: "urn:ngsi-ld:UseCase:" + interest },
      region: { type: "Relationship", object: "urn:ngsi-ld:AdministrativeArea:" + region },
      location: {
        type: "GeoProperty",
        value: { type: "Point", coordinates: FB.venue.coordinates },
      },
    };
  }

  // ---- 注釈付き JSON ----
  // キー/文字列/数値/リテラルを色分けし、構文要素の行末にチップを差し込む。
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
    if (line.indexOf('"type": "' + FB.type + '"') >= 0)
      return '<span class="fb-tag fb-tag--ctx">🧩 カスタムデータモデル</span>';
    if (/"type": "Relationship"/.test(line))
      return '<span class="fb-tag fb-tag--rel">🔗 他エンティティへの参照</span>';
    if (/"type": "GeoProperty"/.test(line))
      return '<span class="fb-tag fb-tag--geo">📍 位置をネイティブ表現</span>';
    if (/"observedAt"/.test(line))
      return '<span class="fb-tag fb-tag--prop">🏷 値＋メタデータ</span>';
    return "";
  }
  function renderJson(entity: Record<string, unknown>): void {
    const pre = byId("fb-json");
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
  // カスタムデータモデルを表示（注釈チップなしの素のハイライト）。
  function renderModelObj(model: unknown): void {
    const pre = byId("fb-model");
    if (!pre) return;
    // 巨大な派生スキーマ(jsonSchema)は省いて読みやすくする。
    let view = model;
    if (model && typeof model === "object") {
      const m = { ...(model as Record<string, unknown>) };
      delete m.jsonSchema;
      view = m;
    }
    pre.innerHTML = JSON.stringify(view, null, 2).split("\n").map(highlightLine).join("\n");
  }
  // まず埋め込み定義を即時表示し、API から取得できたら実データに差し替える。
  function loadModel(): void {
    renderModelObj(FEEDBACK_MODEL);
    if (!db) return;
    db.request("GET", "/custom-data-models/" + FB.type)
      .then((live) => renderModelObj(live))
      .catch((e: unknown) => console.warn("[feedback] custom-data-model fetch failed", e));
  }
  // タブ切り替え（NGSI-LD エンティティ / カスタムデータモデル）。
  function initTabs(): void {
    const root = document.querySelector(".slide--fb");
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

  // ---- 件数集計（WS / 起動時ロード）----
  function tally(id?: string): void {
    if (!id || seen[id]) return;
    seen[id] = true;
    setCount();
  }
  function evtId(evt: FbEvent | null): string | undefined {
    if (!evt) return undefined;
    if (evt.entity && typeof evt.entity.id === "string") return evt.entity.id;
    return evt.entityId;
  }
  // WS イベントからエンティティ形を復元する（entity か data + entityId のどちらでも）。
  function evtEntity(evt: FbEvent | null): Record<string, unknown> | null {
    if (!evt) return null;
    if (evt.entity && evt.entity.id) return evt.entity;
    const e: Record<string, unknown> = {};
    if (evt.data) for (const k in evt.data) e[k] = evt.data[k];
    e.id = evt.entityId;
    e.type = evt.entityType || FB.type;
    return e.id ? e : null;
  }

  // ---- 集計結果タブ（関心・所属・地域の 3 つのドーナツ円グラフ）----
  // Relationship の object からプレフィックスを外してキーを取り出す。
  function relKey(attr: unknown, prefix: string): string | null {
    const obj =
      attr && typeof attr === "object" && "object" in attr
        ? (attr as { object: unknown }).object
        : null;
    if (typeof obj !== "string" || !obj.startsWith(prefix)) return null;
    return obj.slice(prefix.length);
  }
  // 1 回答を 3 つの集計へ反映（id で冪等）。反映できたキーを返す。
  function chartTally(e: Record<string, unknown> | null): TallyKeys | null {
    const id = e?.id as string | undefined;
    if (!e || !id || seenChart[id]) return null;
    const keys: TallyKeys = {};
    const interest = relKey(e.interestedIn, USECASE_PREFIX);
    if (interest && interest in interestCounts) {
      interestCounts[interest] += 1;
      keys.interest = interest;
    }
    const roleAttr = e.role as { value?: unknown } | undefined;
    const role = roleAttr && typeof roleAttr.value === "string" ? roleAttr.value : null;
    if (role && role in roleCounts) {
      roleCounts[role] += 1;
      keys.role = role;
    }
    const region = relKey(e.region, REGION_PREFIX);
    if (region && /^\d{2}$/.test(region)) {
      regionCounts[region] = (regionCounts[region] ?? 0) + 1;
      keys.region = region;
    }
    if (!keys.interest && !keys.role && !keys.region) return null;
    seenChart[id] = true;
    return keys;
  }

  // 都道府県コード -> 名称（左フォームの選択肢から一度だけ読む。データの二重管理を避ける）。
  let regionNames: Record<string, string> | null = null;
  function regionName(code: string): string {
    if (!regionNames) {
      regionNames = Object.create(null) as Record<string, string>;
      document
        .querySelectorAll<HTMLOptionElement>("#fb-region option")
        .forEach((o) => (regionNames![o.value] = o.textContent ?? o.value));
    }
    return regionNames[code] ?? code;
  }
  // 地域は回答のあった都道府県のみを多い順に（10% 未満の丸めは groupSmall が行う）。
  function regionItems(): PieItem[] {
    return Object.entries(regionCounts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code, n], i) => ({
        key: code,
        label: regionName(code),
        color: PIE_COLORS[i % (PIE_COLORS.length - 1)],
        n,
      }));
  }

  // 全体の 10% 未満のスライスは「その他」（グレー）に集約する。
  // スライス数の上限（色数）を超えた分も同様に丸める。
  const OTHER_KEY = "__other";
  const OTHER_SHARE = 0.1;
  function groupSmall(items: PieItem[]): PieItem[] {
    const t = items.reduce((s, it) => s + it.n, 0);
    if (t === 0) return [];
    const major = items.filter((it) => it.n / t >= OTHER_SHARE);
    const shown = major.slice(0, PIE_COLORS.length - 1);
    const restN = t - shown.reduce((s, it) => s + it.n, 0);
    if (restN > 0)
      shown.push({
        key: OTHER_KEY,
        label: "その他",
        color: PIE_COLORS[PIE_COLORS.length - 1],
        n: restN,
      });
    return shown;
  }

  // ドーナツ円グラフ。セグメントは固定数の circle を使い回し、stroke-dasharray/-offset の
  // 更新を CSS transition で滑らかに見せる。凡例は「バンド上の％ラベル＋グラフ下の色チップ」
  // の 2 段構え（％はスライスが細いと重なるため 6% 以上のみ表示）。
  const PIE_R = 70;
  const PIE_C = 2 * Math.PI * PIE_R;
  const PIE_SLICES = PIE_COLORS.length;
  const PIE_MIN_LABEL = 0.06;
  function renderPie(svgId: string, chipsId: string, items: PieItem[]): void {
    const svg = document.getElementById(svgId);
    const chips = byId(chipsId);
    if (!svg || !chips) return;
    if (!svg.childElementCount) {
      let circles = '<circle class="fb-pie__ring" cx="100" cy="100" r="' + PIE_R + '"/>';
      for (let i = 0; i < PIE_SLICES; i++)
        circles +=
          '<circle class="fb-pie__seg" data-idx="' + i + '" cx="100" cy="100" r="' + PIE_R +
          '" stroke="transparent" stroke-dasharray="0 ' + PIE_C +
          '" transform="rotate(-90 100 100)"/>';
      svg.innerHTML = circles + '<g class="fb-pie__labels"></g>';
    }
    const t = items.reduce((s, it) => s + it.n, 0);
    let acc = 0; // 累積割合（次セグメントの開始位置）
    let labels = "";
    for (let i = 0; i < PIE_SLICES; i++) {
      const seg = svg.querySelector('.fb-pie__seg[data-idx="' + i + '"]');
      if (!seg) continue;
      const it = items[i];
      const frac = it && t > 0 ? it.n / t : 0;
      seg.setAttribute("stroke", it ? it.color : "transparent");
      seg.setAttribute("stroke-dasharray", frac * PIE_C + " " + (PIE_C - frac * PIE_C));
      seg.setAttribute("stroke-dashoffset", String(-acc * PIE_C));
      if (frac >= PIE_MIN_LABEL) {
        // スライス中央角のバンド上に％を重ねる（12時起点・時計回り）
        const a = (acc + frac / 2) * 2 * Math.PI - Math.PI / 2;
        const x = 100 + PIE_R * Math.cos(a);
        const y = 100 + PIE_R * Math.sin(a);
        labels +=
          '<text x="' + x.toFixed(1) + '" y="' + (y + 4.5).toFixed(1) + '">' +
          Math.round(frac * 100) + "%</text>";
      }
      acc += frac;
    }
    const labelsEl = svg.querySelector(".fb-pie__labels");
    if (labelsEl) labelsEl.innerHTML = labels;
    chips.innerHTML = items
      .filter((it) => it.n > 0)
      .map(
        (it) =>
          '<span class="fb-pie-chip"><span class="fb-pie-chip__dot" style="background:' +
          it.color + '"></span>' + escapeHtml(it.label) + "</span>",
      )
      .join("");
  }
  function renderChart(): void {
    const totalEl = byId("fb-chart-total");
    if (totalEl) {
      const t = Object.keys(seenChart).length;
      totalEl.textContent = t ? "（全 " + t + " 件）" : "";
    }
    renderPie(
      "fb-pie-interest",
      "fb-chips-interest",
      groupSmall(INTERESTS.map((o) => ({ ...o, n: interestCounts[o.key] ?? 0 }))),
    );
    renderPie(
      "fb-pie-role",
      "fb-chips-role",
      groupSmall(ROLES.map((o) => ({ ...o, n: roleCounts[o.key] ?? 0 }))),
    );
    renderPie("fb-pie-region", "fb-chips-region", groupSmall(regionItems()));
  }

  // ---- 送信 ----
  function submit(): void {
    if (!db) return;
    const entity = buildEntity();
    const btn = byId<HTMLButtonElement>("fb-submit");
    if (btnTimer) window.clearTimeout(btnTimer);
    if (btn) {
      btn.disabled = true;
      btn.classList.remove("is-ok", "is-err");
      btn.textContent = "送信中…";
    }
    db.createEntity(entity)
      .then(() => {
        renderJson(entity);
        tally(entity.id as string); // 楽観集計。WS エコー（同 id）は冪等。
        if (chartTally(entity)) renderChart();
        buttonState("is-ok", "✓ 作成しました"); // 成功はボタン内に表示
      })
      .catch((err: unknown) => {
        console.warn("[feedback] create failed", err);
        buttonState("is-err", "✗ 作成に失敗"); // 失敗もボタン内に表示
      })
      .finally(() => {
        if (btn) btn.disabled = false;
      });
  }

  // 並べ替え用のタイムスタンプ（expectation.observedAt、無ければ id を使う）。
  function latestTs(e: Record<string, unknown>): string {
    const exp = e.expectation as { observedAt?: unknown } | undefined;
    if (exp && typeof exp.observedAt === "string") return exp.observedAt;
    return typeof e.id === "string" ? e.id : "";
  }
  function load(): Promise<void> {
    return db!.getEntities({ type: FB.type, limit: 1000 }).then((res) => {
      const list = Array.isArray(res) ? res : [];
      list.forEach((e) => {
        tally(e.id as string);
        chartTally(e);
      });
      renderChart();
      // デフォルト表示として、最後（最新）の回答エンティティを出す。
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
      const fe = evt as unknown as FbEvent;
      tally(evtId(fe));
      if (chartTally(evtEntity(fe))) renderChart();
    });
    db!.on("connected", () => setConn("on"));
    db!.on("open", () => setConn("on"));
    db!.on("disconnected", () => setConn("off"));
    db!.on("close", () => setConn("off"));
    db!.on("error", (err) => console.warn("[feedback] ws", err));
    db!.subscribe({ entityTypes: [FB.type] });
    db!.connect().catch((err: unknown) => {
      console.warn("[feedback] connect failed", err);
      setConn("off");
    });
  }

  function start(): void {
    if (started) return;
    started = true;
    paintStars();
    initTabs();
    setCount();
    renderChart();
    db = createClient();
    loadModel(); // 埋め込み即時表示 → API 実データに差し替え
    load()
      .then(connect)
      .catch((err: unknown) => {
        console.error("[feedback]", err);
        connect();
      });
    byId("fb-expect")?.addEventListener("click", onStarsClick as EventListener);
    byId("fb-form")?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      submit();
    });
  }

  onSlideChange(({ index }) => {
    if (index === FB_SLIDE_INDEX - 1) whenIdle(start); // 1 つ前で先読み
    else if (index === FB_SLIDE_INDEX) start();
  });
}
