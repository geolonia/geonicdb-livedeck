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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * 未来側に許す時計ずれ。
 *
 * 作成時刻は**投稿した端末の時計**（`observedAt` / id 埋め込みの `Date.now()`）なので、
 * 来場者のスマホが数十秒進んでいるだけで、表示側から見ると未来の投稿になる。
 * 未来を一律に弾くと、その回答が集計から消えてしまう（登壇中に一番困る壊れ方）。
 * 一方で、日時を大きく未来にしたエンティティは窓から永久に落ちなくなるため、
 * 「ずれとしてありえる範囲」だけを許して、それを越える未来は古いものと同様に除外する。
 */
export const FUTURE_SKEW_MS = 5 * MINUTE_MS;

/** 蓄積系デモ（messaging / collab）の初期ロード対象ウィンドウ（直近 24 時間）。 */
export const RECENT_WINDOW_MS = DAY_MS;

/**
 * フィードバック（アンケート）の初期ロード・集計対象ウィンドウ（直近 1 週間）。
 *
 * 集計の円グラフは「今回の聴衆の傾向」を見せるものなので、過去の登壇分まで
 * 混ぜると傾向が薄まる。一方で 24 時間だと前日のリハーサル分が落ちるため、
 * 1 週間を採る。
 */
export const WEEK_WINDOW_MS = 7 * DAY_MS;

// 作成時刻の推定に使う日時プロパティ（優先順）。
// createdAt: NGSI-LD のシステム属性（返れば最も正確）。drawnAt: collab の作図時刻。
// 「作成時刻」で絞る意図なので modifiedAt（更新時刻）は含めない。
const DEFAULT_DATE_PROPS = ["createdAt", "drawnAt"];

/** NGSI-LD 属性値（`{ value }` ラッパ）を剥がす。ラッパでなければそのまま返す。 */
function attrVal(a: unknown): unknown {
  return a && typeof a === "object" && "value" in a ? (a as { value: unknown }).value : a;
}

/**
 * `dateProps` の 1 要素を辿って日時候補を取り出す。
 *
 * `"createdAt"` のような直下のプロパティに加え、`"expectation.observedAt"` の
 * ドット区切りで**属性のメタデータ**（NGSI-LD の `observedAt` 等）も指せる。
 * 途中のセグメントは NGSI-LD 属性オブジェクトそのものを辿り、最後の値だけ
 * `{ value }` ラッパを剥がす（`expectation` を先に剥がすと数値になってしまう）。
 */
function propAt(e: Record<string, unknown>, path: string): unknown {
  let cur: unknown = e;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return attrVal(cur);
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
    const v = propAt(e, p);
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
 *
 * 経過時間が `windowMs` 以下であることに加え、**未来に振れすぎていない**ことも見る
 * （`FUTURE_SKEW_MS` を越える未来の日時は、窓から永久に落ちなくなるので除外する）。
 */
export function isRecent(
  e: Record<string, unknown>,
  windowMs: number = RECENT_WINDOW_MS,
  dateProps?: string[],
): boolean {
  const age = Date.now() - entityCreatedAt(e, dateProps);
  return age >= -FUTURE_SKEW_MS && age <= windowMs;
}
