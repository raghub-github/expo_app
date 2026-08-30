/**
 * Rider waiting-decision engine (Step 4). When the rider's wait crosses the decision
 * threshold and the order still isn't ready, the rider is asked to CONTINUE or CANCEL —
 * but a non-response NEVER auto-cancels. Instead we re-ask the same prompt every 10 minutes
 * for up to a 30-minute window, then STOP prompting and leave the order for ops/merchant
 * escalation. Pure + unit-testable; the sweep + endpoints drive it.
 */

/** Re-ask cadence while the rider hasn't decided. */
export const WAITING_DECISION_REPROMPT_INTERVAL_MIN = 10;
/** How long (from the first prompt) we keep re-asking before we stop. */
export const WAITING_DECISION_WINDOW_MIN = 30;

export type WaitingDecisionAction = "NONE" | "PROMPT" | "STOP";

export type WaitingDecisionInput = {
  /** Current rider wait (minutes) since reaching pickup — 0 once the order is READY. */
  waitMinutes: number;
  /** Threshold: the first prompt fires when waitMinutes reaches this (the included-wait limit). */
  promptAfterMinutes: number;
  /** The rider already chose continue/cancel — stop everything. */
  riderDecided: boolean;
  /** How many prompts have already been sent for this order. */
  promptsSent: number;
  /** Minutes since the last prompt (null when none sent yet). */
  minutesSinceLastPrompt: number | null;
  /** Minutes since the first prompt (null when none sent yet). */
  minutesSinceFirstPrompt: number | null;
  intervalMin?: number;
  windowMin?: number;
};

/**
 * Decide what to do this sweep tick. Never returns "cancel" — a non-responding rider is
 * re-prompted, then left alone. The caller cancels ONLY on an explicit rider CANCEL action.
 */
export function resolveRiderWaitingDecision(
  input: WaitingDecisionInput
): { action: WaitingDecisionAction; reason: string } {
  if (input.riderDecided) return { action: "NONE", reason: "already_decided" };
  if (!(input.waitMinutes >= input.promptAfterMinutes)) {
    return { action: "NONE", reason: "below_threshold" };
  }

  const interval = input.intervalMin ?? WAITING_DECISION_REPROMPT_INTERVAL_MIN;
  const window = input.windowMin ?? WAITING_DECISION_WINDOW_MIN;

  // First prompt — the moment waiting crosses the decision threshold.
  if (input.promptsSent <= 0) return { action: "PROMPT", reason: "first_prompt" };

  // Past the re-ask window → stop prompting. NEVER auto-cancel; ops/merchant nudges continue.
  if ((input.minutesSinceFirstPrompt ?? 0) >= window) {
    return { action: "STOP", reason: "window_elapsed" };
  }

  // Re-ask every `interval` minutes while still unanswered and inside the window.
  if ((input.minutesSinceLastPrompt ?? 0) >= interval) {
    return { action: "PROMPT", reason: "reprompt" };
  }

  return { action: "NONE", reason: "within_interval" };
}
