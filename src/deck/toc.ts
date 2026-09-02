/* ===================================================================
   GeonicDB Presentation — 目次（Table of Contents）オーバーレイ
   - 全スライドを一覧し、任意のページへ直接ジャンプする
   - 開く: ☰ ボタン / ページ番号のクリック / G キー
   - 閉じる: ✕ / 背景クリック / Esc / 項目を選択（＝移動して閉じる）
   - 見出しは DOM から実行時に読むので、スライドを追加・並べ替えても
     目次側の更新は不要（見出しを持たないスライドだけ `data-toc` を付ける）
   =================================================================== */
import { byId } from "../lib/dom";

/** 目次の 1 行分に必要なスライドの情報（DOM から抽出した中間表現）。 */
export interface SlideMeta {
  /** `data-slide`。無ければ null。 */
  slug: string | null;
  /** 目次に出す見出し。 */
  title: string;
  /** Live Demo / Appendix / 用語集 のような区切りページか（＝目次の章の先頭）。 */
  divider: boolean;
  /** ライブデモを含むスライドか（`data-live="true"`）。 */
  live: boolean;
}

export interface TocItem {
  /** スライド番号（0 起点。URL の `#N` は +1）。 */
  index: number;
  title: string;
  live: boolean;
}

export interface TocGroup {
  label: string;
  items: TocItem[];
}

/** 最初の区切りページより前（＝本編）のグループ名。 */
export const TOC_MAIN_LABEL = "本編";

/** 見出しテキストの正規化（改行・連続空白・NBSP を 1 つの空白に潰す）。 */
export function normalizeTitle(raw: string): string {
  return raw.replace(/[\s ]+/g, " ").trim();
}

/**
 * スライドを区切りページごとに章立てする。
 *
 * 区切りページ（`.slide--appendix` 等）自体もその章の先頭項目として残すので、
 * 目次から区切りページへも飛べる。区切りが 1 つも無ければ全体が 1 章になる。
 */
export function groupSlides(metas: SlideMeta[]): TocGroup[] {
  const groups: TocGroup[] = [];
  metas.forEach((meta, index) => {
    if (groups.length === 0 || meta.divider) {
      groups.push({ label: meta.divider ? meta.title : TOC_MAIN_LABEL, items: [] });
    }
    groups[groups.length - 1].items.push({ index, title: meta.title, live: meta.live });
  });
  return groups;
}

/**
 * 目次内でフォーカスを動かす先の項目番号。
 *
 * 項目はグループをまたいで 1 本のリストとして扱い、端では止まる（回り込まない）。
 * `columns` は 1 行あたりの項目数（グリッドの列数）で、上下移動の歩幅になる。
 */
export function moveFocus(
  current: number,
  total: number,
  key: string,
  columns: number,
): number {
  if (total <= 0) return -1;
  // 列数が測れない（0・NaN）ときも 1 列として必ず動かす。
  const cols = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1;
  const clamp = (n: number): number => Math.max(0, Math.min(total - 1, n));
  switch (key) {
    case "ArrowRight":
      return clamp(current + 1);
    case "ArrowLeft":
      return clamp(current - 1);
    case "ArrowDown":
      return clamp(current + cols);
    case "ArrowUp":
      return clamp(current - cols);
    case "Home":
      return 0;
    case "End":
      return total - 1;
    default:
      return clamp(current);
  }
}

/** スライド要素 1 枚から目次用のメタ情報を読む（見出しは `data-toc` > h1/h2 > スラグ）。 */
export function readSlideMeta(slide: HTMLElement, index: number): SlideMeta {
  const slug = slide.getAttribute("data-slide");
  const explicit = slide.getAttribute("data-toc");
  const heading = slide.querySelector("h1, h2")?.textContent ?? "";
  const title =
    normalizeTitle(explicit ?? "") || normalizeTitle(heading) || slug || `ページ ${index + 1}`;
  return {
    slug,
    title,
    divider: slide.classList.contains("slide--appendix"),
    live: slide.getAttribute("data-live") === "true",
  };
}

/** デッキ側（slides.ts）から目次に渡す操作の窓口。 */
export interface TocController {
  slides: HTMLElement[];
  /** 現在のスライド番号（0 起点）。 */
  getCurrent(): number;
  /** 指定スライドへ移動する。 */
  go(index: number): void;
  /** 目次を開いたとき（自動再生の一時停止など）。 */
  onOpen?(): void;
  /** 目次を閉じたとき。 */
  onClose?(): void;
}

export interface Toc {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

/** 何も無いときのダミー（`#toc` が無い場合でもデッキ側を分岐させないため）。 */
const NOOP_TOC: Toc = {
  open: () => {},
  close: () => {},
  toggle: () => {},
  isOpen: () => false,
};

/** 目次オーバーレイを組み立て、開閉・ジャンプを有効化する。 */
export function initToc(ctrl: TocController): Toc {
  const rootEl = byId("toc");
  const bodyEl = byId("tocBody");
  if (!rootEl || !bodyEl) return NOOP_TOC;
  const root: HTMLElement = rootEl;
  const body: HTMLElement = bodyEl;

  const openBtns = Array.from(document.querySelectorAll<HTMLElement>("[data-toc-open]"));
  const closeBtn = byId<HTMLButtonElement>("tocClose");

  // ===== 一覧の組み立て（スライド構成は実行時に固定なので 1 回だけ） =====
  const groups = groupSlides(ctrl.slides.map((s, i) => readSlideMeta(s, i)));
  const total = ctrl.slides.length;
  const itemBtns: HTMLButtonElement[] = [];

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "toc__group";

    const label = document.createElement("h3");
    label.className = "toc__group-label";
    label.textContent = group.label;
    section.appendChild(label);

    const list = document.createElement("div");
    list.className = "toc__grid";
    for (const item of group.items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toc__item";
      btn.dataset.index = String(item.index);

      const num = document.createElement("span");
      num.className = "toc__num mono";
      num.textContent = String(item.index + 1);
      btn.appendChild(num);

      const text = document.createElement("span");
      text.className = "toc__label";
      text.textContent = item.title;
      btn.appendChild(text);

      if (item.live) {
        const badge = document.createElement("span");
        badge.className = "toc__live mono";
        badge.textContent = "LIVE";
        btn.appendChild(badge);
      }

      btn.addEventListener("click", () => {
        ctrl.go(item.index);
        close();
      });
      list.appendChild(btn);
      itemBtns.push(btn);
    }
    section.appendChild(list);
    body.appendChild(section);
  }

  // ===== 開閉 =====
  let open = false;
  let lastFocused: HTMLElement | null = null;

  /** 現在のスライドに対応する項目を強調する。 */
  function markCurrent(): HTMLButtonElement | null {
    const current = ctrl.getCurrent();
    let active: HTMLButtonElement | null = null;
    itemBtns.forEach((btn) => {
      const isCurrent = Number(btn.dataset.index) === current;
      btn.classList.toggle("is-current", isCurrent);
      if (isCurrent) {
        btn.setAttribute("aria-current", "true");
        active = btn;
      } else {
        btn.removeAttribute("aria-current");
      }
    });
    return active;
  }

  function setOpenState(next: boolean): void {
    open = next;
    root.hidden = !next;
    root.classList.toggle("is-open", next);
    document.body.classList.toggle("has-toc", next);
    openBtns.forEach((b) => b.setAttribute("aria-expanded", String(next)));
  }

  function openToc(): void {
    if (open) return;
    lastFocused = document.activeElement as HTMLElement | null;
    setOpenState(true);
    ctrl.onOpen?.();
    const active = markCurrent();
    (active ?? itemBtns[0] ?? closeBtn)?.focus();
    active?.scrollIntoView({ block: "center" });
  }

  function close(): void {
    if (!open) return;
    setOpenState(false);
    ctrl.onClose?.();
    // 目次を開く前にフォーカスしていた要素へ戻す（キーボード操作の迷子を防ぐ）。
    (lastFocused ?? openBtns[0] ?? null)?.focus?.();
    lastFocused = null;
  }

  function toggle(): void {
    if (open) close();
    else openToc();
  }

  openBtns.forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", toggle);
  });
  closeBtn?.addEventListener("click", close);

  // 背景（パネルの外）クリックで閉じる。
  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });

  // ===== 目次内のキーボード操作 =====
  // 開いている間はデッキ側のキー操作（← → / Space 等）より先に処理する。
  root.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      // オーバーレイの外（背後のボタン）へフォーカスが逃げないように回り込ませる。
      const focusables = [...itemBtns, ...(closeBtn ? [closeBtn] : [])];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      return;
    }
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const from = itemBtns.indexOf(document.activeElement as HTMLButtonElement);
    const next = moveFocus(from < 0 ? 0 : from, itemBtns.length, e.key, columnCount());
    itemBtns[next]?.focus();
    itemBtns[next]?.scrollIntoView({ block: "nearest" });
  });

  /** グリッドの列数（上下キーの歩幅）。1 行に並ぶ項目数を実測する。 */
  function columnCount(): number {
    const grid = body.querySelector<HTMLElement>(".toc__grid");
    if (!grid || grid.children.length === 0) return 1;
    const top = (grid.children[0] as HTMLElement).offsetTop;
    let cols = 0;
    for (const child of Array.from(grid.children) as HTMLElement[]) {
      if (child.offsetTop !== top) break;
      cols++;
    }
    return Math.max(1, cols);
  }

  // 総ページ数はスライド数と一致する（一覧の取りこぼしに気付けるように）。
  if (itemBtns.length !== total) {
    console.warn(`[toc] 目次の項目数 ${itemBtns.length} がスライド数 ${total} と一致しません`);
  }

  return { open: openToc, close, toggle, isOpen: () => open };
}
