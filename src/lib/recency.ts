/**
 * ライブ蓄積デモの初期ロードを「直近ウィンドウ」に限定するための時刻ヘルパ。
 *
 * ユーザーが投稿できる蓄積系デモ（survey / messaging / collab）は、起動時に全履歴を
 * 取得するとデモを重ねるほどデータが溜まって初期表示が重く・古い投稿で画面が埋まる。
 * そこで取得結果を作成時刻でフィルタし、直近ウィンドウ内のものだけを表示する。
 * （WebSocket でのリアルタイム受信分はフィルタ対象外＝従来どおり表示する。）
 *
 * もともと共同編集 GIS（collab）が持っていた `featureTs` + ウィンドウ判定を
 * ここへ抽出し、各デモで再利用できるようにしたもの。
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 蓄積系デモ（survey / messaging / collab）の初期ロード対象ウィンドウ（直近 24 時間）。 */
export const RECENT_WINDOW_MS = DAY_MS;

// 作成時刻の推定に使う日時プロパティ（優先順）。
// createdAt: NGSI-LD のシステム属性（返れば最も正確）。drawnAt: collab の作図時刻。
// 「作成時刻」で絞る意図なので modifiedAt（更新時刻）は含めない。
const DEFAULT_DATE_PROPS = ["createdAt", "drawnAt"];

/** NGSI-LD 属性値（`{ value }` ラッパ）を剥がす。ラッパでなければそのまま返す。 */
function attrVal(a: unknown): unknown {
  return a && typeof a === "object" && "value" in a ? (a as { value: unknown }).value : a;
}

/**
 * エンティティの作成時刻（epoch ミリ秒）を推定する。
 *
 * 1. `dateProps` のプロパティを順に見て、ISO 日時としてパースできればそれを使う。
 * 2. どれも取れなければ id 末尾に埋め込まれた base36 時刻を使う
 *    （各デモの genId が `...:<Date.now().toString(36)>-<rand>` で生成している）。
 * 3. いずれも取れなければ 0（＝非常に古いものとして扱われフィルタで除外される）。
 */
export function entityCreatedAt(
  e: Record<string, unknown>,
  dateProps: string[] = DEFAULT_DATE_PROPS,
): number {
  for (const p of dateProps) {
    const v = attrVal(e[p]);
    if (v != null) {
      const t = Date.parse(String(v));
      if (!isNaN(t)) return t;
    }
  }
  const local = String(e?.id ?? "").split(":").pop() ?? "";
  const ts = parseInt(local.split("-")[0] ?? "", 36);
  return isNaN(ts) ? 0 : ts;
}

/**
 * エンティティが直近ウィンドウ内に作成されたか。
 * 初期ロードした一覧を `.filter(isRecent)` で絞る用途を想定。
 */
export function isRecent(
  e: Record<string, unknown>,
  windowMs: number = RECENT_WINDOW_MS,
  dateProps?: string[],
): boolean {
  return Date.now() - entityCreatedAt(e, dateProps) <= windowMs;
}
