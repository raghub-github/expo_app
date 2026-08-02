/**
 * Merchant free-wait window after rider reaches store.
 * Matches rider pickup timer budget (3 min) — after this, wait is "overdue"
 * and the order card shows PRIORITY.
 */

export const FOOD_RIDER_FREE_WAIT_SECONDS = 180;

export type RiderFreeWaitPhase = "countdown" | "waiting" | "idle";

export function resolveRiderFreeWaitPhase(args: {
  arrived: boolean;
  live: boolean;
  elapsedSeconds: number | null | undefined;
  freeWaitSeconds?: number | null;
}): RiderFreeWaitPhase {
  if (!args.arrived) return "idle";
  const free = Math.max(
    0,
    Math.floor(Number(args.freeWaitSeconds ?? FOOD_RIDER_FREE_WAIT_SECONDS) || FOOD_RIDER_FREE_WAIT_SECONDS)
  );
  const elapsed =
    args.elapsedSeconds != null && Number.isFinite(args.elapsedSeconds)
      ? Math.max(0, Math.floor(args.elapsedSeconds))
      : 0;
  if (!args.live && elapsed <= 0) return "idle";
  if (elapsed < free) return "countdown";
  return "waiting";
}

export function riderWaitIsPriority(args: {
  arrived: boolean;
  elapsedSeconds: number | null | undefined;
  freeWaitSeconds?: number | null;
}): boolean {
  return resolveRiderFreeWaitPhase({
    arrived: args.arrived,
    live: true,
    elapsedSeconds: args.elapsedSeconds,
    freeWaitSeconds: args.freeWaitSeconds,
  }) === "waiting";
}

export function freeWaitRemainingSeconds(
  elapsedSeconds: number | null | undefined,
  freeWaitSeconds: number = FOOD_RIDER_FREE_WAIT_SECONDS
): number {
  const free = Math.max(0, Math.floor(freeWaitSeconds));
  const elapsed =
    elapsedSeconds != null && Number.isFinite(elapsedSeconds)
      ? Math.max(0, Math.floor(elapsedSeconds))
      : 0;
  return Math.max(0, free - elapsed);
}

/** MM:SS for countdown / wait badges. */
export function formatMmSs(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 0..1 how much of free wait has been consumed. */
export function freeWaitProgress(
  elapsedSeconds: number | null | undefined,
  freeWaitSeconds: number = FOOD_RIDER_FREE_WAIT_SECONDS
): number {
  const free = Math.max(1, Math.floor(freeWaitSeconds));
  const elapsed =
    elapsedSeconds != null && Number.isFinite(elapsedSeconds)
      ? Math.max(0, Math.floor(elapsedSeconds))
      : 0;
  return Math.min(1, elapsed / free);
}
