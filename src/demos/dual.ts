/* ===================================================================
   標準API（デュアルプロトコル）デモ。
   GeonicDB SDK（DPoP）で「同じ実体」を NGSI-LD（/ngsi-ld/v1/entities/{id}）と
   NGSIv2（/v2/entities/{id}）の両標準 API から取得し、生レスポンスを左右に並べる。
   読み取り専用（readonly キー。ポリシーで /ngsi-ld/** と /v2/** の GET を許可）。
   =================================================================== */
import type GeonicDB from "@geolonia/geonicdb-sdk";
import { config } from "../lib/config";
import { createClient } from "../lib/client";
import { byId, escapeHtml, whenIdle } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";

export function initDual(): void {
  const DD = config.demos.dual;
  const slides = Array.from(document.querySelectorAll(".slide"));
  const DUAL_SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--dual") as Element);

  let db: GeonicDB | null = null;
  let started = false;
  let running = false;

  // 最小限の JSON シンタックスハイライト（キー / 文字列 / 数値 / リテラル）。
  function hl(obj: unknown): string {
    const json = escapeHtml(JSON.stringify(obj, null, 2));
    return json.replace(
      /("(\\.|[^"\\])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
      (m) => {
        let cls = "j-num";
        if (/^"/.test(m)) cls = /:$/.test(m) ? "j-key" : "j-str";
        else if (/true|false|null/.test(m)) cls = "j-lit";
        return '<span class="' + cls + '">' + m + "</span>";
      },
    );
  }

  function setReq(): void {
    const ld = byId("dual-ld-req");
    if (ld) ld.textContent = "GET /ngsi-ld/v1/entities/" + DD.ldId;
    const v2 = byId("dual-v2-req");
    if (v2) v2.textContent = "GET /v2/entities/" + DD.v2Id;
  }

  function flash(el: HTMLElement | null, html: string): void {
    if (!el) return;
    el.innerHTML = html;
    el.classList.remove("is-fresh");
    void el.offsetWidth;
    el.classList.add("is-fresh");
  }

  function run(): void {
    if (!db || running) return;
    running = true;
    const btn = byId<HTMLButtonElement>("dual-run");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "取得中…";
    }
    const ldOut = byId("dual-ld-json");
    const v2Out = byId("dual-v2-json");
    if (ldOut) ldOut.textContent = "取得中…";
    if (v2Out) v2Out.textContent = "取得中…";

    // NGSI-LD ルートは %xx をデコードするので URN を encode。NGSIv2 ルートはデコード
    // しないため、v2 の id はエンコード不要な文字だけにしてある。
    const ld = db.request("GET", "/ngsi-ld/v1/entities/" + encodeURIComponent(DD.ldId));
    const v2 = db.request("GET", "/v2/entities/" + DD.v2Id);

    ld.then((r) => flash(ldOut, hl(r))).catch((e: unknown) => {
      if (ldOut) ldOut.textContent = "エラー: " + errMsg(e);
    });
    v2.then((r) => flash(v2Out, hl(r))).catch((e: unknown) => {
      if (v2Out) v2Out.textContent = "エラー: " + errMsg(e);
    });

    Promise.all([ld, v2])
      .catch(() => {})
      .then(() => {
        running = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "↻ 再取得";
        }
      });
  }

  function start(): void {
    if (started) return;
    started = true;
    setReq();
    db = createClient("readonly");
    run(); // 初回表示で自動取得
    byId<HTMLButtonElement>("dual-run")?.addEventListener("click", run);
  }

  onSlideChange(({ index }) => {
    if (index === DUAL_SLIDE_INDEX - 1) whenIdle(start); // 1 つ前のスライドで先読み
    else if (index === DUAL_SLIDE_INDEX) start();
  });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
