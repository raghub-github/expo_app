/** Display-only acceptance countdown — backend owns timeout / auto-cancel. */

export const AUTO_CANCEL_REASON = "Auto Cancelled";

export const DEFAULT_ACCEPTANCE_WINDOW_MINUTES = 5;

export function clampAcceptanceWindowMinutes(minutes: number | null | undefined): number {
  return Math.max(1, Math.min(180, Number(minutes) || DEFAULT_ACCEPTANCE_WINDOW_MINUTES));
}

export function acceptanceWindowMs(minutes: number | null | undefined): number {
  return clampAcceptanceWindowMinutes(minutes) * 60_000;
}

export function acceptDeadlineMs(
  createdAt: string,
  windowMinutes: number | null | undefined,
  responseDeadlineAt?: string | null
): number {
  if (responseDeadlineAt) {
    const deadline = new Date(responseDeadlineAt).getTime();
    if (Number.isFinite(deadline)) return deadline;
  }
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return Date.now();
  return created + acceptanceWindowMs(windowMinutes);
}

export function acceptSecondsLeft(
  createdAt: string,
  windowMinutes: number | null | undefined,
  nowMs: number,
  responseDeadlineAt?: string | null
): number {
  const deadline = acceptDeadlineMs(createdAt, windowMinutes, responseDeadlineAt);
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
