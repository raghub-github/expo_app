/**
 * Money helpers — integer paise (1/100th of an INR rupee) is the canonical
 * unit everywhere in the platform. Floats only appear in UI formatting.
 *
 * Why integer paise:
 *   - Avoids 0.1 + 0.2 = 0.30000000000000004 floating-point drift in totals
 *   - Same convention Razorpay uses in `order.amount` and webhook payloads
 *   - Trivially round-trips through Postgres NUMERIC and JSONB
 */

/** ₹ 99.50 → 9950 paise. Defensive against weird floats like 99.4999999. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

/** 9950 paise → "99.50" string fit for NUMERIC(12,2) columns. */
export function paiseToRupeesStr(paise: number): string {
  if (!Number.isFinite(paise)) return "0.00";
  return (paise / 100).toFixed(2);
}

/** 9950 paise → "₹99.50" for UI labels. */
export function formatINR(paise: number): string {
  if (!Number.isFinite(paise)) return "₹0";
  const rupees = paise / 100;
  // en-IN locale gets the lakh/crore comma grouping correct.
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Sum a list of paise values, ignoring non-finite entries. */
export function sumPaise(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}
