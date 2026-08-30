/**
 * Food waiting start models (Step 3). Decides the FREE budget (seconds from rider arrival)
 * before waiting becomes billable, per the configured start mode. Pure + unit-testable.
 *
 *  FIXED_GRACE     — rider arrival + a fixed grace (the pre-Step-3 behavior).
 *  KPT_PLUS_GRACE  — waiting is billable only after the merchant's ORIGINAL kitchen-prep
 *                    commitment (orders_food.prep_ready_by_at, frozen at accept) + a grace.
 *                    Anchoring on the ORIGINAL (not the mutable expected_ready_at /
 *                    prep_time_minutes that "Need more time" inflates) means a merchant can
 *                    never defer its waiting responsibility by padding KPT after accepting
 *                    (audit §6). If the rider arrives before that point, the free budget
 *                    stretches to cover it; it never drops below the base grace.
 */

export type WaitingStartMode = "FIXED_GRACE" | "KPT_PLUS_GRACE";

export function normalizeWaitingStartMode(raw: unknown): WaitingStartMode {
  return String(raw ?? "").toUpperCase() === "KPT_PLUS_GRACE" ? "KPT_PLUS_GRACE" : "FIXED_GRACE";
}

/**
 * Effective free-wait budget in SECONDS, measured from rider arrival. Callers feed this to
 * the waiting engine as the free window; the amount/duration caps still apply on top.
 */
export function resolveFoodWaitingFreeBudgetSeconds(args: {
  startMode: WaitingStartMode;
  /** Base grace (minutes) — the FIXED_GRACE window and the floor for KPT_PLUS_GRACE. */
  freeMinutes: number;
  /** Extra grace (minutes) allowed after the original KPT commitment (KPT_PLUS_GRACE). */
  kptGraceMinutes: number;
  /** Rider reached-pickup time (ms epoch). */
  arrivalAtMs: number;
  /** Original accept-time prep-ready commitment (ms epoch); null → fall back to FIXED_GRACE. */
  originalPrepReadyByMs: number | null;
}): number {
  const baseFreeSec = Math.max(0, Math.round((Number(args.freeMinutes) || 0) * 60));

  if (
    args.startMode !== "KPT_PLUS_GRACE" ||
    args.originalPrepReadyByMs == null ||
    !Number.isFinite(args.originalPrepReadyByMs) ||
    !Number.isFinite(args.arrivalAtMs)
  ) {
    return baseFreeSec;
  }

  const kptGraceSec = Math.max(0, Math.round((Number(args.kptGraceMinutes) || 0) * 60));
  const chargeStartMs = args.originalPrepReadyByMs + kptGraceSec * 1000;
  const untilChargeStartSec = Math.max(0, Math.floor((chargeStartMs - args.arrivalAtMs) / 1000));
  // Never below the base grace — even a late-committed order gets the minimum free window.
  return Math.max(baseFreeSec, untilChargeStartSec);
}

/**
 * Bulk-order extra grace (Step 5). A large order (by value OR item count) legitimately needs
 * more prep time, so it gets extra free minutes before waiting is billable. Thresholds +
 * extra grace are configurable per rule; either threshold triggers (OR). Returns 0 grace
 * unless the order qualifies AND a positive extra-grace is configured.
 */
export function resolveBulkOrderExtraGraceMinutes(args: {
  orderValue: number | null | undefined;
  itemCount: number | null | undefined;
  valueThreshold: number | null | undefined;
  itemThreshold: number | null | undefined;
  extraGraceMinutes: number | null | undefined;
}): { isBulk: boolean; extraGraceMinutes: number } {
  const extra = Math.max(0, Number(args.extraGraceMinutes) || 0);
  if (extra <= 0) return { isBulk: false, extraGraceMinutes: 0 };
  const value = Number(args.orderValue) || 0;
  const items = Number(args.itemCount) || 0;
  const byValue =
    args.valueThreshold != null && Number(args.valueThreshold) > 0 && value >= Number(args.valueThreshold);
  const byItems =
    args.itemThreshold != null && Number(args.itemThreshold) > 0 && items >= Number(args.itemThreshold);
  const isBulk = byValue || byItems;
  return { isBulk, extraGraceMinutes: isBulk ? extra : 0 };
}
