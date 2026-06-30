/* ===================================================================
   NGSI-LD ライブデモ（リンクトデータ）。
   GeonicDB SDK（DPoP / PoW トークン交換）＋ WebSocket。

   左のフォーム送信が「カスタムデータモデル」の NGSI-LD エンティティ（type=Feedback）を
   作成する。各項目は NGSI-LD の構文要素に対応:
     - 所属 / 期待度        → Property（期待度は observedAt メタデータ付き）
     - 関心ユースケース     → Relationship（urn:ngsi-ld:UseCase:*）
     - お住まいの地域       → Relationship（urn:ngsi-ld:AdministrativeArea:*）
     - 会場の位置           → GeoProperty（固定座標）
     - 型と語彙             → カスタム @context（独自データモデル）

   右には作成結果を「ナレッジグラフ（回答→他エンティティの参照）」と
   「注釈付き NGSI-LD JSON」で表示し、件数は WebSocket の entityCreated で集計する。
   POST 権限はアンケートと同じ survey キーを流用（origin 制限あり）。
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

export function initFeedback(): void {
  const FB = config.demos.feedback;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const FB_SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--fb") as Element);

  let db: GeonicDB | null = null;
  let started = false;
  let stars = 5; // 期待度の初期値
  const seen: Record<string, true> = Object.create(null); // feedback id -> true（件数の冪等集計）

  // ---- helpers ----
  const sel = (id: string) => byId<HTMLSelectElement>(id);
  const selText = (id: string) => {
    const el = sel(id);
    return el ? el.options[el.selectedIndex]?.text ?? "" : "";
  };
  const nowIso = () => new Date().toISOString();

  function setConn(state: "on" | "off" | "wait"): void {
    const dot = byId("fb-dot");
    const conn = byId("fb-conn");
    if (dot) dot.className = "rsv-live__dot rsv-live__dot--" + state;
    if (conn)
      conn.textContent =
        state === "on" ? "リアルタイム接続中" : state === "off" ? "切断 — 再接続中…" : "接続中…";
  }
  function setMsg(text: string, kind?: string): void {
    const el = byId("fb-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "fb-msg" + (kind ? " fb-msg--" + kind : "");
  }
  function setCount(): void {
    const el = byId("fb-count");
    if (el) el.textContent = "これまでの回答 " + Object.keys(seen).length + " 件";
  }

  // ---- 期待度（星）----
  function paintStars(): void {
    byId("fb-expect")
      ?.querySelectorAll<HTMLElement>(".fb-star")
      .forEach((b) => {
        const v = Number(b.getAttribute("data-val"));
        b.classList.toggle("is-on", v <= stars);
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

  // ---- ナレッジグラフ ----
  // 中央: 回答(Feedback)。右上: 地域(AdministrativeArea)。右下: ユースケース(UseCase)。
  // 送信のたびにエッジを描き直してリンクト構造を直感的に見せる。
  function node(x: number, y: number, w: number, h: number, t1: string, t2: string, cls: string): string {
    return (
      '<g class="fb-gnode ' + cls + '">' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="9"></rect>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + 19) + '" class="fb-gn-type">' + escapeHtml(t1) + "</text>" +
      '<text x="' + (x + w / 2) + '" y="' + (y + 37) + '" class="fb-gn-val">' + escapeHtml(t2) + "</text>" +
      "</g>"
    );
  }
  function renderGraph(): void {
    const svg = byId("fb-graph");
    if (!svg) return;
    const region = selText("fb-region");
    const interest = selText("fb-interest");
    // 座標（viewBox 560x150）
    const fb = { x: 30, y: 50, w: 160, h: 50 };
    const rg = { x: 380, y: 12, w: 165, h: 50 };
    const uc = { x: 380, y: 88, w: 165, h: 50 };
    const edges =
      '<path class="fb-edge fb-edge--rel" d="M' + (fb.x + fb.w) + "," + (fb.y + 18) +
      " C300," + (fb.y + 10) + " 320," + (rg.y + rg.h / 2) + " " + rg.x + "," + (rg.y + rg.h / 2) + '"></path>' +
      '<text class="fb-elabel" x="300" y="40">region</text>' +
      '<path class="fb-edge fb-edge--rel" d="M' + (fb.x + fb.w) + "," + (fb.y + 32) +
      " C300," + (fb.y + 40) + " 320," + (uc.y + uc.h / 2) + " " + uc.x + "," + (uc.y + uc.h / 2) + '"></path>' +
      '<text class="fb-elabel" x="296" y="112">interestedIn</text>';
    svg.innerHTML =
      edges +
      node(fb.x, fb.y, fb.w, fb.h, "Feedback", "📍 location", "fb-gnode--self") +
      node(rg.x, rg.y, rg.w, rg.h, "AdministrativeArea", region, "fb-gnode--ref") +
      node(uc.x, uc.y, uc.w, uc.h, "UseCase", interest, "fb-gnode--ref");
    // 再描画でエッジ draw アニメを発火
    svg.classList.remove("is-drawn");
    void (svg as unknown as HTMLElement).offsetWidth;
    svg.classList.add("is-drawn");
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

  // ---- 送信 ----
  function submit(): void {
    if (!db) return;
    const entity = buildEntity();
    const btn = byId<HTMLButtonElement>("fb-submit");
    if (btn) btn.disabled = true;
    setMsg("送信中…");
    db.createEntity(entity)
      .then(() => {
        setMsg("作成しました ✓ — WebSocket で受信し件数に反映されます", "ok");
        renderJson(entity);
        renderGraph();
        tally(entity.id as string); // 楽観集計。WS エコー（同 id）は冪等。
      })
      .catch((err: unknown) => {
        setMsg("失敗: " + (err instanceof Error ? err.message : String(err)), "err");
      })
      .finally(() => {
        if (btn) btn.disabled = false;
      });
  }

  function load(): Promise<void> {
    return db!.getEntities({ type: FB.type, limit: 1000 }).then((res) => {
      (Array.isArray(res) ? res : []).forEach((e) => tally(e.id as string));
    });
  }

  function connect(): void {
    db!.on("entityCreated", (evt) => tally(evtId(evt as unknown as FbEvent)));
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
    renderGraph(); // 送信前でも構造（雛形）を見せる
    setCount();
    db = createClient("feedback");
    load()
      .then(connect)
      .catch((err: unknown) => {
        console.error("[feedback]", err);
        connect();
      });
    byId("fb-expect")?.addEventListener("click", onStarsClick as EventListener);
    byId("fb-region")?.addEventListener("change", renderGraph);
    byId("fb-interest")?.addEventListener("change", renderGraph);
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
