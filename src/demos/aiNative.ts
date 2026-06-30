/* ===================================================================
   AI-native demo（スクリプト化アニメーション・ライブ API なし）。
   自然言語チャットで進む 3 ステップのストーリー:
     STEP 1  避難所のデータを作って            → エンティティが作成される
     STEP 2  アプリ用の API キーを発行して      → origin 制限・DPoP のキー
     STEP 3  避難所のアプリを作って             → アプリが組み上がる
   左のチャットと右のビルドパイプラインが連動し、最後にリセットしてループ。
   =================================================================== */
import { byId, qs } from "../lib/dom";
import { onSlideChange } from "../lib/slidechange";

// app-preview のピン位置（viewBox 360x220）。検索バー（上）と件数チップ / FAB（下隅）を避ける。
const APP_PINS: [number, number][] = [
  [70, 78], [160, 66], [250, 84], [320, 74], [110, 128], [205, 116], [292, 134], [150, 168],
];
const KEY_VALUE = "gdb_a9d3••••••••••••";

export function initAiNative(): void {
  // スライド reorder に強いよう、クラスから 0 始まり index を導出。
  const slides = Array.from(document.querySelectorAll(".slide"));
  const AI_SLIDE_INDEX = slides.indexOf(document.querySelector(".slide--ai") as Element);

  let gen = 0; // スライドを離れたとき、走行中ループをキャンセルするために increment
  let running = false;

  // アニメ全体の早送り係数（1 = 等速、小さいほど速い）。
  const SPEED = 0.6;
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms * SPEED));
  const alive = (my: number) => my === gen;
  const reduced = () =>
    !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stageEl = () => qs<HTMLElement>(".slide--ai .ai-stage");

  // ---- chat helpers ----
  function clearLog(): void {
    const l = byId("ai-log");
    if (l) l.innerHTML = "";
  }
  function addBubble(cls: string, html: string): HTMLElement | null {
    const l = byId("ai-log");
    if (!l) return null;
    const b = document.createElement("div");
    b.className = "ai-bubble " + cls;
    b.innerHTML = html;
    l.appendChild(b);
    return b;
  }
  function setInput(text: string): void {
    const el = byId("ai-input");
    if (el) el.textContent = text;
  }
  function fireSend(): void {
    const s = byId("ai-send");
    if (!s) return;
    s.classList.add("is-fire");
    setTimeout(() => s.classList.remove("is-fire"), 260);
  }
  async function typeInto(text: string, perChar: number, my: number): Promise<void> {
    for (let i = 1; i <= text.length; i++) {
      if (!alive(my)) return;
      setInput(text.slice(0, i));
      await sleep(perChar);
    }
  }
  // 入力 → 送信 → ユーザー吹き出しとして追加
  async function ask(text: string, my: number): Promise<void> {
    await typeInto(text, reduced() ? 0 : 50, my);
    if (!alive(my)) return;
    await sleep(reduced() ? 0 : 320);
    fireSend();
    addBubble("ai-bubble--user", text);
    setInput("");
    await sleep(reduced() ? 0 : 380);
  }
  // AI の「考え中」ドット → 完了で除去
  async function think(ms: number): Promise<void> {
    const t = addBubble(
      "ai-bubble--ai ai-bubble--typing",
      '<span class="ai-typing"><span></span><span></span><span></span></span>',
    );
    await sleep(reduced() ? 0 : ms);
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }
  const reply = (html: string) => addBubble("ai-bubble--ai", html);

  // ---- browser-preview helpers ----
  async function loadApp(my: number): Promise<void> {
    const prog = byId("ai-progress");
    if (prog) prog.classList.add("is-on");
    await sleep(reduced() ? 0 : 700);
    if (!alive(my)) return;

    const ph = byId("ai-ph");
    if (ph) ph.classList.add("is-hidden");
    const app = byId("ai-app");
    if (app) app.classList.add("is-on");
    if (prog) {
      prog.classList.remove("is-on");
      prog.classList.add("is-done");
    }
    await sleep(reduced() ? 0 : 320);
    if (!alive(my)) return;

    const pins = byId("ai-app-pins");
    if (pins) {
      let html = "";
      for (let i = 0; i < APP_PINS.length; i++) {
        const p = APP_PINS[i]!;
        // 外側 <g> が位置（SVG attr）、内側 .ai-pin が CSS のドロップアニメ。
        // CSS transform が位置 translate を上書きしないよう分離する。
        html +=
          '<g transform="translate(' + p[0] + "," + p[1] + ')">' +
          '<g class="ai-pin" style="--d:' + (i * 0.08).toFixed(2) + 's">' +
          '<path d="M0,0 C-7,-10 -7,-17 0,-17 C7,-17 7,-10 0,0 Z" fill="#39d6c6"></path>' +
          '<circle cx="0" cy="-11.5" r="3.4" fill="#0d0d14"></circle>' +
          "</g>" +
          "</g>";
      }
      pins.innerHTML = html;
    }
    await sleep(reduced() ? 0 : 350);
  }

  // ---- ループ間のリセット ----
  function reset(): void {
    clearLog();
    setInput("");
    const caret = byId("ai-caret");
    if (caret) caret.style.display = "";
    const ph = byId("ai-ph");
    if (ph) ph.classList.remove("is-hidden");
    const prog = byId("ai-progress");
    if (prog) prog.classList.remove("is-on", "is-done");
    const app = byId("ai-app");
    if (app) app.classList.remove("is-on");
    const pins = byId("ai-app-pins");
    if (pins) pins.innerHTML = "";
  }

  // ---- 1 周分のストーリー ----
  async function runStory(my: number): Promise<void> {
    reset();
    const hold = reduced() ? 800 : 1500;

    // STEP 1 — データ作成
    await ask("避難所のデータを作って", my);
    if (!alive(my)) return;
    await think(800);
    if (!alive(my)) return;
    reply('<span class="ai-ok">✓</span>避難所を <strong>10 件</strong> 作成しました');
    await sleep(reduced() ? 0 : 620);
    if (!alive(my)) return;

    // STEP 2 — API キー発行（チャット内にインライン表示）
    await ask("アプリのためのAPIキーを発行して", my);
    if (!alive(my)) return;
    await think(800);
    if (!alive(my)) return;
    reply(
      '<span class="ai-ok">✓</span>API キーを発行しました<br><code class="ai-key">' +
        KEY_VALUE +
        '</code> <span class="ai-mini">DPoP必須・origin制限</span>',
    );
    await sleep(reduced() ? 0 : 620);
    if (!alive(my)) return;

    // STEP 3 — アプリ生成 → ブラウザで読み込まれる
    await ask("避難所のアプリを作って", my);
    if (!alive(my)) return;
    await think(900);
    if (!alive(my)) return;
    reply('<span class="ai-ok">✓</span>避難所マップアプリができました');
    await loadApp(my);
    if (!alive(my)) return;

    // ホールド → フェードアウトして次ループへリセット
    await sleep(hold);
    if (!alive(my)) return;
    const stage = stageEl();
    if (stage && !reduced()) {
      stage.style.opacity = "0";
      // フェードは CSS の .ai-stage { transition: opacity .4s } と同期させるため早送り係数を掛けない。
      await new Promise<void>((r) => setTimeout(r, 400));
    }
    if (!alive(my)) {
      if (stage) stage.style.opacity = "";
      return;
    }
    reset();
    if (stage) stage.style.opacity = "";
  }

  async function loop(): Promise<void> {
    const my = gen;
    while (alive(my)) await runStory(my);
  }

  function start(): void {
    if (running) return;
    running = true;
    gen++;
    const stage = stageEl();
    if (stage) stage.style.opacity = "";
    reset();
    void loop();
  }
  function stop(): void {
    if (!running) return;
    running = false;
    gen++; // 走行中ループを次の alive() チェックでキャンセル
    const stage = stageEl();
    if (stage) stage.style.opacity = "";
    reset();
  }

  onSlideChange(({ index }) => {
    if (index === AI_SLIDE_INDEX) start();
    else stop();
  });
}
