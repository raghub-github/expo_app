/**
 * Refund settlement-note timing (single source of truth).
 *
 * After a subscription refund is CONFIRMED by the gateway (`completed_at` set):
 *  - Days 0–4 (calendar): initial "credited within 5–7 working days" message
 *  - Days 4–5 (calendar): follow-up "contact bank/support if not reflected" message
 *  - After day 5: hide both messages
 *
 * Windows are plain calendar days from the completion instant (not business days),
 * so Partner Portal and API evaluate the same cutovers.
 */

/** Calendar days the first settlement message stays visible. */
export const SETTLEMENT_NOTE_INITIAL_DAYS = 4;

/** Extra calendar days the second settlement message stays visible after the first ends. */
export const SETTLEMENT_NOTE_FOLLOWUP_DAYS = 1;

/** Total calendar days from completion until all settlement notes hide. */
export const SETTLEMENT_NOTE_HIDE_AFTER_DAYS =
  SETTLEMENT_NOTE_INITIAL_DAYS + SETTLEMENT_NOTE_FOLLOWUP_DAYS;

export type SettlementNotePhase = 'initial' | 'followup' | 'hidden';

/**
 * Instant `calendarDays` after `completedAtIso`. Returns null if missing/unparseable.
 */
export function addCalendarDaysIso(
  completedAtIso: string | null | undefined,
  calendarDays: number
): string | null {
  if (!completedAtIso) return null;
  const ms = Date.parse(completedAtIso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + calendarDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Instant at which settlement guidance stops showing entirely
 * (`SETTLEMENT_NOTE_HIDE_AFTER_DAYS` calendar days after completion).
 */
export function settlementNoteVisibleUntil(
  completedAtIso: string | null | undefined,
  calendarDays: number = SETTLEMENT_NOTE_HIDE_AFTER_DAYS
): string | null {
  return addCalendarDaysIso(completedAtIso, calendarDays);
}

/**
 * Whether any settlement guidance should be visible right now.
 */
export function isSettlementNoteVisible(
  completedAtIso: string | null | undefined,
  now: number = Date.now(),
  calendarDays: number = SETTLEMENT_NOTE_HIDE_AFTER_DAYS
): boolean {
  const until = settlementNoteVisibleUntil(completedAtIso, calendarDays);
  if (!until) return false;
  return now < Date.parse(until);
}

/**
 * Which settlement message (if any) to show for a completed refund.
 */
export function getSettlementNotePhase(
  completedAtIso: string | null | undefined,
  now: number = Date.now()
): SettlementNotePhase {
  const initialUntil = addCalendarDaysIso(completedAtIso, SETTLEMENT_NOTE_INITIAL_DAYS);
  const hideUntil = addCalendarDaysIso(completedAtIso, SETTLEMENT_NOTE_HIDE_AFTER_DAYS);
  if (!initialUntil || !hideUntil) return 'hidden';
  if (now < Date.parse(initialUntil)) return 'initial';
  if (now < Date.parse(hideUntil)) return 'followup';
  return 'hidden';
}
