/**
 * Single source of truth for converting merchant base price → customer price.
 *
 * Why this lives in its own tiny module:
 * the same math is called from menu reads, billing pipeline, order placement
 * snapshot writer, and admin previews. Drift between any two of these creates
 * settlement bugs that are very expensive to clean up.
 *
 * Formula:
 *   customer_price = merchant_base * 100 / (100 - commission_percent)
 *   platform_earning = customer_price - merchant_base
 *
 * All math is performed in integer paise to avoid float drift. NUMERIC(12,2)
 * columns in the DB store rupees; callers convert at the boundary.
 */

export type Rounding = "NEAREST_RUPEE" | "NEAREST_PAISE";

export type CustomerPrice = {
  customerPaise: number;
  platformEarningPaise: number;
};

/**
 * @param basePaise merchant's desired payout, in paise (integer)
 * @param commissionPercent 0..<100, e.g. 15 = 15%
 * @param rounding how to snap the final customer price (default: nearest rupee
 *        so the customer sees clean integers like ₹177 not ₹176.47)
 */
export function customerPriceFromBase(
  basePaise: number,
  commissionPercent: number,
  rounding: Rounding = "NEAREST_RUPEE",
): CustomerPrice {
  if (!Number.isFinite(basePaise) || basePaise < 0) {
    throw new Error(`Invalid basePaise: ${basePaise}`);
  }
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent >= 100) {
    throw new Error(`Invalid commissionPercent: ${commissionPercent}`);
  }

  // exact (still float, but only used for rounding step)
  const exact = (basePaise * 100) / (100 - commissionPercent);
  let customerPaise: number;
  if (rounding === "NEAREST_RUPEE") {
    customerPaise = Math.round(exact / 100) * 100;
  } else {
    customerPaise = Math.round(exact);
  }
  // Ensure customer pays at least the base (defensive against weird zero/near-zero edge cases).
  if (customerPaise < basePaise) customerPaise = basePaise;
  const platformEarningPaise = customerPaise - basePaise;
  return { customerPaise, platformEarningPaise };
}

/** Convenience: rupees → paise (handles common float oddities like 99.99 * 100 = 9998.999…). */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convenience: paise → rupees as a decimal string fit for NUMERIC(12,2) columns. */
export function paiseToRupeesStr(paise: number): string {
  return (paise / 100).toFixed(2);
}
