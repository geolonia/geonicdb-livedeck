/**
 * 会場投稿を NGSI-LD エンティティ（カスタムデータモデル Contribution）へ変換する
 * 純粋関数（DOM/SDK非依存・テスト容易性のため分離）。
 *
 * データ契約（ashigaru4 subtask_751b 確定分・叩き台から流用）:
 *   type: Contribution
 *   origin (Property/string, 必須)     — 出身地（都道府県/国レベル）
 *   specialty (Property/string, 必須)  — 名物
 *   hiddenSpot (Property/string, 任意) — 地元の隠れ名所
 *   seeded (Property/boolean, 必須)    — 主催者による事前仕込みか否か
 *   submittedAt (Property/string, 必須) — 送信時刻（ISO8601）
 */
import type { ContributionInput } from "./contributionValidation";

export const CORE_CONTEXT = "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.7.jsonld";

// サーバ登録済みのカスタムデータモデル（feedback.ts の FEEDBACK_MODEL に倣う）。
export const CONTRIBUTION_MODEL = {
  type: "Contribution",
  domain: "Survey",
  description: "FOSS4G Hiroshima 2026: 会場参加者の投稿（NGSI-LD リンクトデータデモ）",
  propertyDetails: {
    origin: { ngsiType: "Property", valueType: "string", example: "香川県", required: true, description: "出身地(都道府県/国レベル)" },
    specialty: { ngsiType: "Property", valueType: "string", example: "讃岐うどん", required: true, description: "その土地の名物" },
    hiddenSpot: { ngsiType: "Property", valueType: "string", example: "地元の展望台", required: false, description: "地元の人しか知らない隠れ名所" },
    seeded: { ngsiType: "Property", valueType: "boolean", example: false, required: true, description: "主催者による事前仕込みデータか否か" },
    submittedAt: { ngsiType: "Property", valueType: "string", example: "2026-09-03T13:45:00.000Z", required: true, description: "送信時刻(ISO8601)" },
  },
};

export interface BuildEntityOptions {
  /** 主催者による事前仕込みデータか（会場投稿は常に false）。 */
  seeded: boolean;
  /** 送信時刻(ISO8601)。呼び出し側が渡す(テスト容易性のため関数内で Date.now() を呼ばない)。 */
  submittedAt: string;
  /** エンティティ id(省略時は自動生成)。 */
  id?: string;
}

function genId(): string {
  let r = "";
  for (let i = 0; i < 10; i++) r += Math.floor(Math.random() * 36).toString(36);
  return "urn:ngsi-ld:" + CONTRIBUTION_MODEL.type + ":" + Date.now().toString(36) + "-" + r;
}

export function buildContributionEntity(
  input: ContributionInput,
  opts: BuildEntityOptions,
): Record<string, unknown> {
  const origin = input.origin.trim();
  const specialty = input.specialty.trim();
  const hiddenSpot = input.hiddenSpot.trim();

  const entity: Record<string, unknown> = {
    "@context": CORE_CONTEXT,
    id: opts.id ?? genId(),
    type: CONTRIBUTION_MODEL.type,
    origin: { type: "Property", value: origin },
    specialty: { type: "Property", value: specialty },
    seeded: { type: "Property", value: opts.seeded },
    submittedAt: { type: "Property", value: opts.submittedAt },
  };
  if (hiddenSpot) entity.hiddenSpot = { type: "Property", value: hiddenSpot };
  return entity;
}
