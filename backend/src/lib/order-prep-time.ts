export const PREP_TIME_MIN = 5;
export const PREP_TIME_MAX = 180;
export const PLATFORM_DEFAULT_PREP_MINUTES = 30;

export type PrepTimeSource = "merchant" | "store_default";

export function clampPrepMinutes(raw: unknown, fallback = PLATFORM_DEFAULT_PREP_MINUTES): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(PREP_TIME_MIN, Math.min(PREP_TIME_MAX, Math.round(n)));
}

export function resolveStoreDefaultPrepMinutes(storeAvgPrepMinutes: unknown): number {
  return clampPrepMinutes(storeAvgPrepMinutes, PLATFORM_DEFAULT_PREP_MINUTES);
}

export function computePrepReadyByAtIso(acceptedAtIso: string, prepMinutes: number): string {
  const base = new Date(acceptedAtIso).getTime();
  return new Date(base + clampPrepMinutes(prepMinutes) * 60_000).toISOString();
}

export type AcceptPrepCommitment = {
  prepMinutes: number;
  prepReadyByAt: string;
  prepTimeSource: PrepTimeSource;
};

export function resolveAcceptPrepCommitment(input: {
  acceptedAtIso: string;
  storeDefaultMinutes: number;
  bodyPrepMinutes?: unknown;
  existingOrderPrepMinutes?: unknown;
}): AcceptPrepCommitment {
  const storeDefault = clampPrepMinutes(input.storeDefaultMinutes);
  const hasBody =
    input.bodyPrepMinutes != null &&
    input.bodyPrepMinutes !== "" &&
    Number.isFinite(Number(input.bodyPrepMinutes));
  const prepMinutes = hasBody
    ? clampPrepMinutes(input.bodyPrepMinutes, storeDefault)
    : input.existingOrderPrepMinutes != null && Number(input.existingOrderPrepMinutes) > 0
      ? clampPrepMinutes(input.existingOrderPrepMinutes, storeDefault)
      : storeDefault;
  const prepTimeSource: PrepTimeSource = hasBody ? "merchant" : "store_default";
  return {
    prepMinutes,
    prepReadyByAt: computePrepReadyByAtIso(input.acceptedAtIso, prepMinutes),
    prepTimeSource,
  };
}

/** Customer / merchant working ready time after Need more time — now + extension. */
export function computeExpectedReadyAtFromNow(
  additionalMinutes: number,
  nowIso = new Date().toISOString()
): string {
  const add = clampPrepMinutes(additionalMinutes, 5);
  const nowMs = new Date(nowIso).getTime();
  return new Date(nowMs + add * 60_000).toISOString();
}
