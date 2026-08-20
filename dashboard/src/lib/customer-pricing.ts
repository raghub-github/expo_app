/**
 * Customer-facing price math — MUST match backend/src/modules/commission/pricing.ts.
 * Dashboard photo-review may markup nets for preview; live customer/menu/checkout
 * prices come from the backend canonical engine (Boost on CTM, then gross-up).
 * Do not use this module to apply merchant offers.
 */

export type Rounding = "NEAREST_RUPEE" | "NEAREST_PAISE";

export function customerPriceFromBase(
  basePaise: number,
  commissionPercent: number,
  rounding: Rounding = "NEAREST_RUPEE"
): { customerPaise: number; platformEarningPaise: number } {
  if (!Number.isFinite(basePaise) || basePaise < 0) {
    return { customerPaise: 0, platformEarningPaise: 0 };
  }
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent >= 100) {
    return { customerPaise: basePaise, platformEarningPaise: 0 };
  }

  const exact = (basePaise * 100) / (100 - commissionPercent);
  let customerPaise: number;
  if (rounding === "NEAREST_RUPEE") {
    customerPaise = Math.round(exact / 100) * 100;
  } else {
    customerPaise = Math.round(exact);
  }
  if (customerPaise < basePaise) customerPaise = basePaise;
  return { customerPaise, platformEarningPaise: customerPaise - basePaise };
}

/** Mark up merchant net rupees to customer-visible rupees (nearest rupee). */
export function markupCustomerPrice(netRupees: number, commissionPercent: number): number {
  if (!Number.isFinite(netRupees) || netRupees <= 0) return 0;
  if (!Number.isFinite(commissionPercent) || commissionPercent <= 0) {
    return Math.round(netRupees);
  }
  return customerPriceFromBase(Math.round(netRupees * 100), commissionPercent).customerPaise / 100;
}
