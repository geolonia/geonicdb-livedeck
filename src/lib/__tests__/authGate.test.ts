import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AUTH_JITTER_MS,
  authJitterMaxMs,
  isRetryableAuthFailure,
  waitAuthJitter,
  withAuthRetry,
} from "../authGate";

/** SDK の `GeonicDBError` 系を模した最小のエラー（`statusCode` を持つ）。 */
function sdkError(message: string, statusCode: number, extra?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

describe("authJitterMaxMs", () => {
  it("既定は 8 秒", () => {
    expect(authJitterMaxMs("")).toBe(DEFAULT_AUTH_JITTER_MS);
  });

  it("?nojitter で 0（発表者の画面を待たせない）", () => {
    expect(authJitterMaxMs("?nojitter")).toBe(0);
    expect(authJitterMaxMs("?autoplay=5&nojitter")).toBe(0);
  });
});

describe("waitAuthJitter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("上限 0 なら待たない", async () => {
    let done = false;
    void waitAuthJitter(0).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it("0〜上限のランダム時間だけ待つ", async () => {
    let done = false;
    void waitAuthJitter(8000, () => 0.5).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(3999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});

describe("isRetryableAuthFailure", () => {
  it.each([429, 500, 502, 503, 504])("statusCode %i はリトライする", (status) => {
    expect(isRetryableAuthFailure(sdkError("boom", status))).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422])(
    "statusCode %i はリトライしない（何度やっても同じ）",
    (status) => {
      expect(isRetryableAuthFailure(sdkError("nope", status))).toBe(false);
    }
  );

  // ここが本命。SDK は nonce / token 取得の失敗を AuthenticationError(401) に
  // 包んでしまうので、statusCode だけ見ると「恒久的な失敗」に見えてしまう。
  // 実際の原因（Lambda スロットルの 500 / レート制限の 429）はメッセージにしか残らない。
  it("SDK が包んだ nonce 取得失敗（500）は statusCode 401 でもリトライする", () => {
    expect(isRetryableAuthFailure(sdkError("Nonce request failed: 500", 401))).toBe(true);
  });

  it("SDK が包んだ token 取得失敗（429）も同様", () => {
    expect(isRetryableAuthFailure(sdkError("Token request failed: 429", 401))).toBe(true);
  });

  it("包まれた失敗でも 400 番台（鍵が無効・origin 不許可）はリトライしない", () => {
    expect(isRetryableAuthFailure(sdkError("Nonce request failed: 400", 401))).toBe(false);
    expect(isRetryableAuthFailure(sdkError("Token request failed: 403", 401))).toBe(false);
  });

  it("fetch 自体の失敗はリトライする", () => {
    expect(isRetryableAuthFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableAuthFailure(new Error("NetworkError when attempting to fetch"))).toBe(true);
  });

  it("null / undefined / 素の Error はリトライしない", () => {
    expect(isRetryableAuthFailure(null)).toBe(false);
    expect(isRetryableAuthFailure(undefined)).toBe(false);
    expect(isRetryableAuthFailure(new Error("validation failed"))).toBe(false);
  });
});

describe("withAuthRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("成功すればそのまま返す（待たない）", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withAuthRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("リトライ可能な失敗はバックオフしてやり直す", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(sdkError("Nonce request failed: 500", 401))
      .mockResolvedValue("ok");
    const promise = withAuthRetry(fn, { rand: () => 0 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("リトライ不能な失敗は 1 回で諦めて投げる（制御プレーンを余計に叩かない）", async () => {
    const fn = vi.fn().mockRejectedValue(sdkError("Invalid or inactive API key", 400));
    await expect(withAuthRetry(fn, { attempts: 5 })).rejects.toThrow("Invalid or inactive API key");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("attempts を使い切ったら最後のエラーを投げる", async () => {
    const fn = vi.fn().mockRejectedValue(sdkError("throttled", 500));
    const promise = withAuthRetry(fn, { attempts: 3, rand: () => 0 });
    const assertion = expect(promise).rejects.toThrow("throttled");
    // 1000ms（1 回目）+ 2000ms（2 回目）
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("Retry-After（秒）があればバックオフより優先する", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(sdkError("Rate limit exceeded", 429, { retryAfter: 3 }))
      .mockResolvedValue("ok");
    const promise = withAuthRetry(fn, { rand: () => 0 });
    // バックオフなら 1000ms で再試行するが、Retry-After: 3 なので 3000ms 待つ。
    await vi.advanceTimersByTimeAsync(2999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("Retry-After が長すぎる場合は 15 秒で打ち切る（会場で待たせない）", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(sdkError("Rate limit exceeded", 429, { retryAfter: 600 }))
      .mockResolvedValue("ok");
    const promise = withAuthRetry(fn, { rand: () => 0 });
    await vi.advanceTimersByTimeAsync(15000);
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("attempts=1 ならリトライしない", async () => {
    const fn = vi.fn().mockRejectedValue(sdkError("throttled", 500));
    await expect(withAuthRetry(fn, { attempts: 1 })).rejects.toThrow("throttled");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
