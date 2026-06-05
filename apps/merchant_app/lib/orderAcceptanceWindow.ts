/** Partner Site parity — merchant must accept within platform window or order auto-cancels. */

export const AUTO_CANCEL_REASON = "Auto Cancelled";

export const DEFAULT_ACCEPTANCE_WINDOW_MINUTES = 5;

export function clampAcceptanceWindowMinutes(minutes: number | null | undefined): number {
  return Math.max(1, Math.min(180, Number(minutes) || DEFAULT_ACCEPTANCE_WINDOW_MINUTES));
}

export function acceptanceWindowMs(minutes: number | null | undefined): number {
  return clampAcceptanceWindowMinutes(minutes) * 60_000;
}

export function acceptDeadlineMs(createdAt: string, windowMinutes: number | null | undefined): number {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return Date.now();
  return created + acceptanceWindowMs(windowMinutes);
}

export function acceptSecondsLeft(
  createdAt: string,
  windowMinutes: number | null | undefined,
  nowMs: number
): number {
  const deadline = acceptDeadlineMs(createdAt, windowMinutes);
  return Math.max(0, Math.ceil((deadline - nowMs) / 1000));
}

export function formatAcceptCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function isCreatedPipelineStatus(pipelineStatus: string): boolean {
  const u = pipelineStatus.toUpperCase();
  return u === "CREATED" || u === "NEW" || u === "PLACED";
}

/** Shared across hook instances so only one PATCH runs per food order id. */
const autoCancelFiredFoodIds = new Set<number>();

export function claimAutoCancelFoodOrder(foodId: number): boolean {
  if (autoCancelFiredFoodIds.has(foodId)) return false;
  autoCancelFiredFoodIds.add(foodId);
  return true;
}

export function releaseAutoCancelFoodOrder(foodId: number): void {
  autoCancelFiredFoodIds.delete(foodId);
}
