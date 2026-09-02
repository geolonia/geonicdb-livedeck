/**
 * 認証ハンドシェイクの「一斉集中」を散らし、詰まったら諦めずに待ち直す。
 *
 * ## なぜ必要か
 *
 * SDK の API キー認証は 1 クライアントあたり必ず 2 往復する:
 *
 *   POST /auth/nonce  →（端末で PoW を解く）→ POST /oauth/token
 *
 * どちらも GeonicDB の**制御プレーン**（`/auth` `/oauth` 専用の Lambda）で、
 * そこには 2 種類の壁がある。
 *
 * 1. **予約同時実行数**（`ControlPlaneReservedConcurrency`）。溢れた分は Lambda が
 *    スロットルするが、クライアントへは **429 ではなく HTTP 500
 *    (`InternalServerErrorException`)** で返る。「サーバーが壊れた」ように見える。
 * 2. **送信元 IP 単位のレート制限**。識別子は `sourceIp` なので、**会場 Wi-Fi や
 *    キャリア CGNAT のように多数の端末が 1 つの IP を共有すると、上限が
 *    「その場の全員分の合計」に効く**。
 *
 * 実測（2026-09-02 / staging・1 IP から `POST /auth/nonce` を 200 並列）:
 * 500 が 93 件（スロットル）、429 が 72 件、成功相当が 35 件。**17.5% しか通らない。**
 *
 * そして SDK は nonce / token 取得の失敗をリトライしない（`AuthenticationError` を
 * 投げて終わる）。会場で「今アクセスしてください」と言った直後の一波は、この形の
 * まま参加者の画面のエラーになる。
 *
 * ## 何をするか
 *
 * - **ジッタ**: 最初のリクエストを 0〜`authJitterMaxMs()` ミリ秒ランダムに遅らせ、
 *   波を平らにする（同時 200 → 秒あたり数十に落ちる）。
 * - **リトライ**: それでも 429 / 5xx / ネットワーク断で落ちたら、指数バックオフ
 *   ＋ジッタで数回やり直す。`Retry-After` があれば従う。
 *
 * 発表者自身の画面まで待たせたくない場合は URL に `?nojitter` を付ける
 * （リトライは残る）。既定値は `VITE_AUTH_JITTER_MS` で上書きできる。
 */

/** ジッタ既定の上限（ミリ秒）。会場 200 名を約 8 秒に散らす。 */
export const DEFAULT_AUTH_JITTER_MS = 8000;

/** リトライの既定試行回数（初回を含む）。 */
export const DEFAULT_AUTH_ATTEMPTS = 5;

/** バックオフの基準（ミリ秒）。実際の待ちは base * 2^(n-1) + ランダム。 */
const BACKOFF_BASE_MS = 1000;

/** バックオフ 1 回あたりの上限（ミリ秒）。会場デモでこれ以上待たせない。 */
const BACKOFF_CAP_MS = 15000;

function readEnvJitterMs(): number | null {
  const raw = import.meta.env.VITE_AUTH_JITTER_MS;
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

/** 現在の URL のクエリ文字列。DOM の無い環境（テスト）では空文字。 */
function currentSearch(): string {
  return typeof location === "undefined" ? "" : location.search;
}

/**
 * ジッタの上限（ミリ秒）。`?nojitter` が付いていれば 0。
 *
 * 0 を返した場合 {@link waitAuthJitter} は即座に解決する（待たない）。
 */
export function authJitterMaxMs(search: string = currentSearch()): number {
  if (new URLSearchParams(search).has("nojitter")) return 0;
  return readEnvJitterMs() ?? DEFAULT_AUTH_JITTER_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 0〜上限のランダム時間だけ待つ。上限 0 なら待たない。 */
export function waitAuthJitter(
  maxMs: number = authJitterMaxMs(),
  rand: () => number = Math.random,
): Promise<void> {
  if (maxMs <= 0) return Promise.resolve();
  return sleep(Math.floor(rand() * maxMs));
}

/**
 * 「時間を置けば直る」失敗か。
 *
 * SDK は nonce / token 取得の失敗を `AuthenticationError` に包んでしまい
 * （`statusCode` は 401 になる）、本当の原因はメッセージにしか残らないため、
 * ステータスとメッセージの両方を見る。**401/403 のような恒久的な失敗
 * （キーが無効・origin 不許可）はリトライしない** — 何度やっても同じで、
 * 制御プレーンを余計に詰まらせるだけ。
 */
export function isRetryableAuthFailure(err: unknown): boolean {
  if (!err) return false;

  const status = (err as { statusCode?: unknown }).statusCode;
  if (typeof status === "number" && (status === 429 || (status >= 500 && status <= 599))) {
    return true;
  }

  const message = err instanceof Error ? err.message : String(err);

  // SDK が包んだ nonce / token 取得失敗。末尾のステータスで判定する。
  const wrapped = /(?:Nonce|Token) request failed:\s*(\d{3})/.exec(message);
  if (wrapped) {
    const code = Number(wrapped[1]);
    return code === 429 || (code >= 500 && code <= 599);
  }

  // fetch 自体の失敗（機内モード解除直後・会場 Wi-Fi の一時断）。
  if (err instanceof TypeError) return true;
  return /NetworkError|Failed to fetch|network error|load failed/i.test(message);
}

/** `Retry-After` 由来の待ち時間（秒）。SDK の `RateLimitError` が持つ。 */
function retryAfterMs(err: unknown): number | null {
  const retryAfter = (err as { retryAfter?: unknown }).retryAfter;
  if (typeof retryAfter !== "number" || !Number.isFinite(retryAfter) || retryAfter <= 0) {
    return null;
  }
  return Math.min(retryAfter * 1000, BACKOFF_CAP_MS);
}

export interface AuthRetryOptions {
  /** 初回を含む試行回数。既定 {@link DEFAULT_AUTH_ATTEMPTS}。 */
  attempts?: number;
  /** ログ用のラベル。 */
  label?: string;
  /** テスト用の乱数源。 */
  rand?: () => number;
}

/**
 * 429 / 5xx / ネットワーク断に限って指数バックオフ＋ジッタでやり直す。
 *
 * 恒久的な失敗（400/401/403 等）は 1 回で諦めてそのまま投げる。
 */
export async function withAuthRetry<T>(
  fn: () => Promise<T>,
  options: AuthRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_AUTH_ATTEMPTS);
  const rand = options.rand ?? Math.random;
  const label = options.label ?? "auth";

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !isRetryableAuthFailure(err)) throw err;
      const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
      const delay = retryAfterMs(err) ?? backoff + Math.floor(rand() * BACKOFF_BASE_MS);
      console.warn(
        "[" + label + "] retrying in " + delay + "ms (attempt " + attempt + "/" + attempts + ")",
        err,
      );
      await sleep(delay);
    }
  }
  // 到達しない（ループ内で return か throw する）が、型を閉じるために残す。
  throw lastError;
}
