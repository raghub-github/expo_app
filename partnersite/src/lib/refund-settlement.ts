/**
 * Refund settlement-window logic (single source of truth).
 *
 * After a subscription refund is CONFIRMED by the gateway (refund_completed_at
 * set), merchants see settlement guidance. The initial 5–7 working-day message
 * changes after day 7, and all guidance auto-hides after 10 WORKING days.
 *
 * The whole calculation is done here so the Partner Portal and any future
 * platform compute an identical, deterministic, timezone-safe deadline. Working
 * days are evaluated in IST (Asia/Kolkata, fixed UTC+5:30, no DST) because that
 * is the platform + settlement timezone.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Day of week (0=Sun … 6=Sat) for a UTC instant, evaluated in IST. */
function istDayOfWeek(utcMs: number): number {
  return new Date(utcMs + IST_OFFSET_MS).getUTCDay();
}

function isWeekendIST(utcMs: number): boolean {
  const dow = istDayOfWeek(utcMs);
  return dow === 0 || dow === 6; // Sun or Sat
}

/**
 * The instant at which the settlement note should stop showing: the moment
 * `workingDays` business days (Mon–Fri, IST) after `completedAtIso`. Deterministic
 * — advances one calendar day at a time and only counts non-weekend days.
 * Returns null if the timestamp is missing/unparseable.
 */
export function settlementNoteVisibleUntil(
  completedAtIso: string | null | undefined,
  workingDays = 10
): string | null {
  if (!completedAtIso) return null;
  let ms = Date.parse(completedAtIso);
  if (!Number.isFinite(ms)) return null;
  let counted = 0;
  while (counted < workingDays) {
    ms += 24 * 60 * 60 * 1000;
    if (!isWeekendIST(ms)) counted++;
  }
  return new Date(ms).toISOString();
}

/**
 * Whether refund settlement guidance should be visible RIGHT NOW: the refund is
 * confirmed complete and is still inside the 10-working-day guidance window.
 */
export function isSettlementNoteVisible(
  completedAtIso: string | null | undefined,
  now: number = Date.now(),
  workingDays = 10
): boolean {
  const until = settlementNoteVisibleUntil(completedAtIso, workingDays);
  if (!until) return false;
  return now < Date.parse(until);
}
