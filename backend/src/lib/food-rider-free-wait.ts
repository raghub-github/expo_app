/**
 * Shared free-wait budget after rider reaches merchant (food pickup).
 * Keep in sync with rider FOOD_PICKUP_TIMER_BUDGET_SECONDS (180).
 */
export const FOOD_RIDER_FREE_WAIT_SECONDS = 180;

export function resolveRiderFreeWaitSnapshot(args: {
  arrived: boolean;
  live: boolean;
  anchorAt: string | null;
  finalizedSeconds: number | null;
  nowMs?: number;
  freeWaitSeconds?: number;
}): {
  freeWaitSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  priority: boolean;
  phase: "idle" | "countdown" | "waiting";
} {
  const free = Math.max(
    0,
    Math.floor(args.freeWaitSeconds ?? FOOD_RIDER_FREE_WAIT_SECONDS)
  );
  if (!args.arrived || !args.anchorAt) {
    return {
      freeWaitSeconds: free,
      elapsedSeconds: 0,
      remainingSeconds: free,
      priority: false,
      phase: "idle",
    };
  }
  const now = args.nowMs ?? Date.now();
  let elapsed = 0;
  if (args.live) {
    const anchorMs = new Date(args.anchorAt).getTime();
    elapsed = Number.isFinite(anchorMs)
      ? Math.max(0, Math.floor((now - anchorMs) / 1000))
      : 0;
  } else if (args.finalizedSeconds != null && Number.isFinite(args.finalizedSeconds)) {
    elapsed = Math.max(0, Math.floor(args.finalizedSeconds));
  }
  const remaining = Math.max(0, free - elapsed);
  const priority = elapsed >= free;
  return {
    freeWaitSeconds: free,
    elapsedSeconds: elapsed,
    remainingSeconds: remaining,
    priority,
    phase: priority ? "waiting" : "countdown",
  };
}
