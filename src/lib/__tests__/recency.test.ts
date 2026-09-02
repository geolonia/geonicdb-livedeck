import { afterEach, describe, expect, it, vi } from "vitest";
import {
  entityCreatedAt,
  FUTURE_SKEW_MS,
  isRecent,
  RECENT_WINDOW_MS,
  WEEK_WINDOW_MS,
} from "../recency";

const NOW = Date.parse("2026-09-03T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function freezeNow(): void {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}
afterEach(() => vi.useRealTimers());

/** Feedback の id 形式（`urn:ngsi-ld:Feedback:<base36 時刻>-<乱数>`）を作る。 */
function feedbackId(at: number): string {
  return "urn:ngsi-ld:Feedback:" + at.toString(36) + "-po7d75q6g9";
}

describe("entityCreatedAt", () => {
  it("prefers the createdAt system attribute", () => {
    expect(
      entityCreatedAt({ id: feedbackId(NOW - DAY), createdAt: "2026-09-01T00:00:00Z" }),
    ).toBe(Date.parse("2026-09-01T00:00:00Z"));
  });

  it("reads a nested attribute metadata path (expectation.observedAt)", () => {
    // Feedback は日時を属性のメタデータに持つ。`expectation` を先に `{ value }` として
    // 剥がしてしまうと期待度の数値になるので、途中は属性オブジェクトのまま辿る。
    const e = {
      id: feedbackId(0),
      expectation: { type: "Property", value: 5, observedAt: "2026-09-02T06:12:48.243Z" },
    };
    expect(entityCreatedAt(e, ["createdAt", "expectation.observedAt"])).toBe(
      Date.parse("2026-09-02T06:12:48.243Z"),
    );
  });

  it("unwraps a { value } attribute at the end of the path", () => {
    expect(entityCreatedAt({ drawnAt: { type: "Property", value: "2026-09-01T00:00:00Z" } })).toBe(
      Date.parse("2026-09-01T00:00:00Z"),
    );
  });

  it("falls back to the base36 timestamp embedded in the id", () => {
    const at = Date.parse("2026-08-28T03:04:05.000Z");
    expect(entityCreatedAt({ id: feedbackId(at) })).toBe(at);
  });

  it("treats an entity with no usable timestamp as very old", () => {
    expect(entityCreatedAt({})).toBe(0);
    // 末尾が base36 として読めない id（"not" 等は base36 として読めてしまうので記号で）。
    expect(entityCreatedAt({ id: "urn:ngsi-ld:Feedback:@@@-!!" })).toBe(0);
  });

  it("ignores an unparsable date and keeps looking", () => {
    const at = Date.parse("2026-08-28T03:04:05.000Z");
    expect(entityCreatedAt({ id: feedbackId(at), createdAt: "not a date" })).toBe(at);
  });

  it("does not throw when an intermediate path segment is missing", () => {
    expect(entityCreatedAt({ id: feedbackId(0) }, ["expectation.observedAt"])).toBe(0);
    expect(entityCreatedAt({ id: feedbackId(0), expectation: null }, ["expectation.observedAt"])).toBe(0);
  });
});

describe("isRecent", () => {
  it("keeps entities inside the 24h window and drops older ones", () => {
    freezeNow();
    expect(isRecent({ createdAt: new Date(NOW - HOUR).toISOString() })).toBe(true);
    expect(isRecent({ createdAt: new Date(NOW - 2 * DAY).toISOString() })).toBe(false);
    expect(RECENT_WINDOW_MS).toBe(DAY);
  });

  it("keeps a week of feedback and drops the presentation before that", () => {
    freezeNow();
    expect(WEEK_WINDOW_MS).toBe(7 * DAY);
    const props = ["createdAt", "expectation.observedAt"];
    const within = { id: feedbackId(NOW - 6 * DAY) };
    const older = { id: feedbackId(NOW - 8 * DAY) };
    expect(isRecent(within, WEEK_WINDOW_MS, props)).toBe(true);
    expect(isRecent(older, WEEK_WINDOW_MS, props)).toBe(false);
    // 24 時間だと前日のリハーサル分が落ちる。1 週間の窓ならそれも残る。
    expect(isRecent(within, RECENT_WINDOW_MS, props)).toBe(false);
  });

  it("is inclusive at the window boundary", () => {
    freezeNow();
    expect(isRecent({ id: feedbackId(NOW - WEEK_WINDOW_MS) }, WEEK_WINDOW_MS)).toBe(true);
    expect(isRecent({ id: feedbackId(NOW - WEEK_WINDOW_MS - 1) }, WEEK_WINDOW_MS)).toBe(false);
  });

  it("tolerates a device clock that runs slightly ahead", () => {
    // 来場者の端末が少し進んでいるだけで、その回答が集計から消えてはいけない。
    freezeNow();
    expect(isRecent({ id: feedbackId(NOW + 30 * 1000) }, WEEK_WINDOW_MS)).toBe(true);
    expect(isRecent({ id: feedbackId(NOW + FUTURE_SKEW_MS) }, WEEK_WINDOW_MS)).toBe(true);
  });

  it("drops timestamps far in the future so they cannot outlive the window", () => {
    // 未来日時を無条件に通すと、そのエンティティは窓から永久に落ちなくなる。
    freezeNow();
    expect(isRecent({ id: feedbackId(NOW + FUTURE_SKEW_MS + 1) }, WEEK_WINDOW_MS)).toBe(false);
    expect(isRecent({ id: feedbackId(NOW + 365 * DAY) }, WEEK_WINDOW_MS)).toBe(false);
    expect(
      isRecent({ createdAt: new Date(NOW + 30 * DAY).toISOString() }, RECENT_WINDOW_MS),
    ).toBe(false);
  });
});
