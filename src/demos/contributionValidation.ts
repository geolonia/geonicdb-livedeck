/**
 * 会場投稿フォームのバリデーション（純粋関数・DOM/SDK非依存）。
 * 認証なしの公開フォームゆえ、上限文字数は不正投稿対策も兼ねる。
 */
export interface ContributionInput {
  origin: string;
  specialty: string;
  hiddenSpot: string;
}

export type ContributionField = keyof ContributionInput;

export interface ValidationResult {
  ok: boolean;
  errors: Partial<Record<ContributionField, string>>;
}

export const ORIGIN_MAX = 40;
export const SPECIALTY_MAX = 60;
export const HIDDEN_SPOT_MAX = 120;

export function validateContribution(input: ContributionInput): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  const origin = input.origin.trim();
  const specialty = input.specialty.trim();
  const hiddenSpot = input.hiddenSpot.trim();

  if (!origin) errors.origin = "出身地を入力してください";
  else if (origin.length > ORIGIN_MAX) errors.origin = `出身地は${ORIGIN_MAX}文字以内で入力してください`;

  if (!specialty) errors.specialty = "名物を入力してください";
  else if (specialty.length > SPECIALTY_MAX) errors.specialty = `名物は${SPECIALTY_MAX}文字以内で入力してください`;

  // hiddenSpot は第二段(任意)のため空は許容する。
  if (hiddenSpot.length > HIDDEN_SPOT_MAX)
    errors.hiddenSpot = `隠れ名所は${HIDDEN_SPOT_MAX}文字以内で入力してください`;

  return { ok: Object.keys(errors).length === 0, errors };
}
