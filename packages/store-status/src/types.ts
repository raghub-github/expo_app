/**
 * Schedule phase enum — the exact value the backend tick writes to
 * `merchant_stores.live_schedule_phase`. Keep this string-literal union
 * in lock-step with the DB CHECK constraint in migration 0381.
 */
export type LiveSchedulePhase =
  /** Today is configured as off / day-closed in operating hours. */
  | "OFF_DAY"
  /** Between two configured slots (e.g. morning slot ended, evening slot hasn't started). */
  | "BREAK"
  /** Open right now, but a break starts within the pre-break warning window. */
  | "PRE_BREAK"
  /** Currently inside a configured open slot. */
  | "WITHIN_SLOT"
  /** Today has slots but now isn't in any of them (before first or after last). */
  | "OUTSIDE_HOURS"
  /** No operating hours row exists for this store. */
  | "NO_HOURS";

/** The full set of inputs `formatStoreStatusLabel` needs. */
export type LiveStoreStatusInput = {
  /** The phase column. NULL ⇒ tick hasn't seen this store yet. */
  phase: LiveSchedulePhase | null;
  /** ISO timestamp of the next OPEN transition, or null when already open. */
  nextOpenAt: string | null;
  /** ISO timestamp of the next CLOSED transition, or null when already closed. */
  nextCloseAt: string | null;
  /**
   * True when the schedule says the store SHOULD be open but the
   * merchant has manually closed it (toggle off, manual_close_until in
   * future, block_auto_open). Drives the "Closed by merchant" UI hint.
   */
  manualOverrideActive: boolean;
  /**
   * Whether the store is actually accepting orders right now.
   * This is what's shown to the customer; it folds the schedule AND
   * the manual override into one boolean. Backend writes this as
   * `operational_status === 'OPEN'`.
   */
  isOpenNow: boolean;
  /**
   * IANA timezone (e.g. "Asia/Kolkata"). Used for formatting times in
   * the label. Defaults to Asia/Kolkata if not provided.
   */
  timezone?: string;
};

/** Output of `formatStoreStatusLabel`. */
export type LiveStoreStatusLabel = {
  /**
   * A one-line, customer-facing summary. Examples:
   *   "Open · closes at 22:30"
   *   "Closed by merchant · schedule open until 22:30"
   *   "Closed · opens at 11:30 tomorrow"
   *   "On break · reopens at 18:00"
   *   "Closed today · opens Mon 11:30"
   *   "Hours not set"
   */
  primary: string;
  /**
   * Short status word for chip rendering. UPPER-CASE for the dashboard
   * pill component. One of: OPEN | CLOSED | BREAK | UNKNOWN.
   */
  chip: "OPEN" | "CLOSED" | "BREAK" | "UNKNOWN";
  /**
   * Optional secondary line for places with room for two lines.
   * Examples:
   *   "Reopens at 18:00 (after break)"
   *   "Override by merchant"
   */
  secondary?: string;
  /**
   * Whether to render a live countdown next to the primary line.
   * The caller is responsible for the ticking clock; this is just a
   * hint. ISO target time + a verb ("Opens in", "Closes in",
   * "Reopens in").
   */
  countdown?: { targetIso: string; verb: "Opens in" | "Closes in" | "Reopens in" };
};
