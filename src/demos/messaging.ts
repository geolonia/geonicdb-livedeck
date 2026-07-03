/* ===================================================================
   メッセージング + ReactiveCore Rules ログ デモ（民間ユースケース）。
   GeonicDB SDK（DPoP）＋ WebSocket。

   「ランダム投稿」ボタンで 名前＋メッセージ（100字まで）を NGSI-LD エンティティ
   （type=geonicdb-livedeck-Message）として作成 → WebSocket で全員に配信。
   サーバ側の ReactiveCore Rules（geonicdb-livedeck-message-log）が作成を検知して
   ログ（type=geonicdb-livedeck-MessageLog）を自動生成し、それも WS で届く。
   メッセージ / ログをタブで切り替えて表示する。

   デモ登壇中のキーボード入力は難しいので、名前・本文はダミーからランダムに選ぶ。
   認可はデッキ共通の統合キー（VITE_GEONICDB_KEY / 統合ポリシー geonicdb-livedeck-deck）。
   Message の GET|POST、MessageLog の GET、WS を含む。
   =================================================================== */
import type GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "../lib/config";
import { createClient } from "../lib/client";
import { byId, escapeHtml, whenIdle } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface MsgEvent {
  entityId?: string;
  entityType?: string;
  entity?: Record<string, any>;
  data?: Record<string, any>;
}

const CORE_CONTEXT = "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.7.jsonld";

// デモ用ダミー（登壇中にキーボード入力しないで済むよう、ここから無作為に選ぶ）。
const NAMES = [
  "山田 太郎", "佐藤 花子", "鈴木 一郎", "田中 美咲", "高橋 健",
  "渡辺 さくら", "伊藤 大輔", "中村 由美", "小林 蓮", "加藤 結衣",
];
const TEXTS = [
  "はじめまして！このデモ面白いですね 👋",
  "リアルタイムで届いてる、すごい！",
  "GeonicDB 触ってみたくなりました",
  "WebSocket の反映が速いですね ⚡",
  "投稿がそのままログにも残るの便利",
  "NGSI-LD のエンティティとして保存されるとのこと",
  "ReactiveCore Rules でログ自動生成、なるほど",
  "マルチテナントで社内チャットにも使えそう",
  "地図デモの次はメッセージングですか！",
  "質問です：履歴はどのくらい残りますか？",
  "スマートシティの連絡基盤に良さそう 🏙",
  "こんにちは、テストで投稿してみます",
];

export function initMessaging(): void {
  const MS = config.demos.messaging;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--msg") as Element);

  let db: GeonicDB | null = null;
  let started = false;
  let tab: "messages" | "logs" = "messages";

  const messages: Record<string, any> = Object.create(null); // id -> message entity
  const logs: Record<string, any> = Object.create(null); // id -> log entity
  const msgOrder: string[] = []; // 到着順（新しいものを上に表示）
  const logOrder: string[] = [];

  const attrVal = (a: any): any =>
    a && typeof a === "object" && "value" in a ? a.value : a;
  const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

  // ---- 投稿 -------------------------------------------------------
  function genId(): string {
    return (
      "urn:ngsi-ld:" + MS.messageType + ":" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }
  function post(): void {
    if (!db) return;
    const name = rand(NAMES);
    const text = rand(TEXTS).slice(0, MS.maxLen); // 100字まで
    const entity: Record<string, any> = {
      "@context": CORE_CONTEXT,
      id: genId(),
      type: MS.messageType,
      name: { type: "Property", value: name },
      text: { type: "Property", value: text },
    };
    if (ingest(entity)) render(); // 楽観表示（WS エコーは id 冪等）
    db.createEntity(entity).catch((err: unknown) => {
      console.warn("[messaging] create failed", err);
      delete messages[entity.id as string];
      const i = msgOrder.indexOf(entity.id as string);
      if (i >= 0) msgOrder.splice(i, 1);
      render();
    });
  }

  // ---- 取り込み（メッセージ / ログを型で振り分け）----------------
  function ingest(e: Record<string, any> | null): boolean {
    const id = e?.id as string | undefined;
    const type = e?.type as string | undefined;
    if (!e || !id) return false;
    if (type === MS.logType || String(id).indexOf(MS.logType) >= 0) {
      if (logs[id]) return false;
      logs[id] = e;
      logOrder.unshift(id);
      return true;
    }
    // それ以外はメッセージ扱い
    if (messages[id]) return false;
    messages[id] = e;
    msgOrder.unshift(id);
    return true;
  }

  // ---- 表示 -------------------------------------------------------
  function setCounts(): void {
    const c = byId("msg-count");
    if (c) c.textContent = String(msgOrder.length);
    const l = byId("msg-log-count");
    if (l) l.textContent = String(logOrder.length);
  }
  function renderMessages(): void {
    const feed = byId("msg-feed");
    if (!feed) return;
    feed.innerHTML =
      msgOrder
        .map((id) => messages[id])
        .map((m) => {
          const name = escapeHtml(attrVal(m.name) ?? "名無し");
          const text = escapeHtml(attrVal(m.text) ?? "");
          return (
            '<div class="msg-item"><div class="msg-item__name">' + name +
            '</div><div class="msg-item__text">' + text + "</div></div>"
          );
        })
        .join("") || '<p class="msg-empty">「＋ ランダム投稿」で投稿してみてください</p>';
  }
  function renderLogs(): void {
    const feed = byId("msg-logs");
    if (!feed) return;
    feed.innerHTML =
      logOrder
        .map((id) => logs[id])
        .map((l) => {
          const summary = escapeHtml(attrVal(l.summary) ?? attrVal(l.action) ?? "ログ");
          const action = escapeHtml(attrVal(l.action) ?? "");
          return (
            '<div class="msg-log"><span class="msg-log__tag">' + (action || "log") +
            '</span><span class="msg-log__summary">' + summary + "</span></div>"
          );
        })
        .join("") || '<p class="msg-empty">投稿すると ReactiveCore Rules がログを生成します</p>';
  }
  function render(): void {
    setCounts();
    if (tab === "messages") renderMessages();
    else renderLogs();
  }
  function switchTab(next: "messages" | "logs"): void {
    tab = next;
    document.querySelectorAll<HTMLElement>(".slide--msg .msg-tab").forEach((t) => {
      t.classList.toggle("is-active", t.getAttribute("data-tab") === next);
    });
    const feed = byId("msg-feed");
    const logsEl = byId("msg-logs");
    if (feed) feed.hidden = next !== "messages";
    if (logsEl) logsEl.hidden = next !== "logs";
    render();
  }

  // ---- データ取得 / WS -------------------------------------------
  function evtEntity(evt: MsgEvent | null): Record<string, any> | null {
    if (!evt) return null;
    if (evt.entity && evt.entity.id) return evt.entity;
    const e: Record<string, any> = {};
    if (evt.data) for (const k in evt.data) e[k] = evt.data[k];
    e.id = evt.entityId;
    e.type = evt.entityType;
    return e.id ? e : null;
  }
  function onCreated(evt: MsgEvent): void {
    if (ingest(evtEntity(evt))) render();
  }
  function load(): Promise<void> {
    const p1 = db!.getEntities({ type: MS.messageType, limit: 1000 }).then((res) => {
      (Array.isArray(res) ? res : []).forEach((e) => ingest(e));
    });
    const p2 = db!.getEntities({ type: MS.logType, limit: 1000 }).then((res) => {
      (Array.isArray(res) ? res : []).forEach((e) => ingest(e));
    });
    return Promise.all([p1, p2]).then(() => render());
  }
  function connect(): void {
    db!.on("entityCreated", (evt) => onCreated(evt as unknown as MsgEvent));
    db!.on("error", (err) => console.warn("[messaging] ws", err));
    db!.subscribe({ entityTypes: [MS.messageType, MS.logType] });
    db!.connect().catch((err: unknown) => console.warn("[messaging] connect failed", err));
  }

  // ---- 起動 -------------------------------------------------------
  function start(): void {
    if (started) return;
    started = true;
    db = createClient(); // デッキ共通の統合キー
    document.querySelectorAll<HTMLElement>(".slide--msg .msg-tab").forEach((t) => {
      t.addEventListener("click", () =>
        switchTab((t.getAttribute("data-tab") as "messages" | "logs") || "messages"),
      );
    });
    byId("msg-post")?.addEventListener("click", post);
    render();
    connect(); // 先に購読してから既存を取得（取りこぼし防止）
    load().catch((err: unknown) => console.error("[messaging]", err));
  }

  onSlideChange(({ index }) => {
    if (index === SLIDE_INDEX - 1) whenIdle(start); // 1 つ前で先読み
    else if (index === SLIDE_INDEX) start();
  });
}
