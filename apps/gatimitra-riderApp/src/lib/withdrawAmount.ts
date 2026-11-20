/**
 * Pure rules behind the rider withdrawal sheet and the Withdraw button — kept
 * free of React so they are unit-tested (withdrawAmount.test.ts).
 */

export function roundRupees(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** "₹2,271" / "₹2,271.50" (no trailing .00). */
export function formatRupeesShort(n: number): string {
  const v = roundRupees(n);
  const body = Number.isInteger(v)
    ? v.toLocaleString("en-IN")
    : v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${body}`;
}

/** "₹2,271.00" — balances. */
export function formatRupeesFull(n: number): string {
  return `₹${roundRupees(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Amount as typed into the input: "2271" / "2271.5" (no trailing zeros). */
export function formatAmountForInput(n: number): string {
  return String(roundRupees(n));
}

/**
 * Keep only what an amount field may hold: digits and one dot with at most two
 * decimals. Pasted "₹1,000.509" → "1000.50". Leading zeros collapse ("007" → "7").
 */
export function sanitizeAmountInput(raw: string): string {
  let s = String(raw ?? "").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  const [intPart, decPart] = s.split(".");
  const int = (intPart ?? "").replace(/^0+(?=\d)/, "");
  if (decPart === undefined) return int;
  return `${int === "" ? "0" : int}.${decPart.slice(0, 2)}`;
}

export function parseAmount(raw: string): number {
  const n = parseFloat(String(raw ?? ""));
  return Number.isFinite(n) && n > 0 ? roundRupees(n) : 0;
}

/** The most a single request may take: withdrawable, capped by the per-request max. */
export function maxWithdrawalLimit(withdrawable: number, maxPerRequest: number): number {
  return roundRupees(Math.min(Math.max(0, withdrawable), Math.max(0, maxPerRequest)));
}

/**
 * Quick-pick amounts: round steps between min and limit plus "Max". Sorted,
 * unique, never below the minimum or above the limit; empty when the limit is
 * below the minimum (nothing can be withdrawn).
 */
export function quickAmountOptions(minAmount: number, limit: number): number[] {
  const min = Math.max(0, minAmount);
  const max = roundRupees(limit);
  if (max < min || max <= 0) return [];
  const steps = [500, 1000, 2000, 5000];
  const picks = new Set<number>();
  for (const s of steps) if (s >= min && s < max) picks.add(s);
  picks.add(max);
  return [...picks].sort((a, b) => a - b).slice(-4);
}

export type WithdrawValidation =
  | { ok: true; message: null }
  | { ok: false; reason: "empty" | "below_min" | "above_limit" | "unavailable"; message: string };

export function validateWithdrawAmount(
  amount: number,
  minAmount: number,
  limit: number
): WithdrawValidation {
  const a = roundRupees(amount);
  if (limit < minAmount) {
    return {
      ok: false,
      reason: "unavailable",
      message: `You need at least ${formatRupeesShort(minAmount)} to withdraw.`,
    };
  }
  if (a <= 0) return { ok: false, reason: "empty", message: `Enter an amount from ${formatRupeesShort(minAmount)}.` };
  if (a < minAmount) {
    return { ok: false, reason: "below_min", message: `Minimum withdrawal is ${formatRupeesShort(minAmount)}.` };
  }
  if (a > limit) {
    return { ok: false, reason: "above_limit", message: `You can withdraw up to ${formatRupeesShort(limit)}.` };
  }
  return { ok: true, message: null };
}

export type WithdrawButtonState =
  | { kind: "loading"; label: string }
  | { kind: "ready"; label: string }
  | { kind: "pending"; label: string; progress: number }
  | { kind: "blocked"; label: string };

/**
 * What the Withdraw button shows. `pending` = amount/balance below the minimum
 * (progress toward it); `blocked` = not allowed for another reason (frozen,
 * over the limit, nothing to withdraw).
 */
export function withdrawButtonState(input: {
  current: number;
  minAmount: number;
  readyLabel: string;
  loading?: boolean;
  disabled?: boolean;
  blockedLabel?: string;
}): WithdrawButtonState {
  if (input.loading) return { kind: "loading", label: "Processing…" };
  const min = Math.max(0, input.minAmount);
  const value = Math.max(0, roundRupees(input.current));
  const met = min <= 0 || Math.round(value * 100) >= Math.round(min * 100);
  if (!met) {
    const short = roundRupees(min - value);
    return {
      kind: "pending",
      label:
        value > 0
          ? `Add ${formatRupeesShort(short)} more · min ${formatRupeesShort(min)}`
          : `Minimum ${formatRupeesShort(min)}`,
      progress: min > 0 ? Math.min(1, value / min) : 0,
    };
  }
  if (input.disabled) return { kind: "blocked", label: input.blockedLabel?.trim() || input.readyLabel };
  return { kind: "ready", label: input.readyLabel.trim() || "Withdraw" };
}
