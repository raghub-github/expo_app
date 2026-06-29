/**
 * Customer-facing price math — mirrors backend/src/modules/commission/pricing.ts
 *   customer_price = merchant_net * 100 / (100 - commission_percent)
 */

export type Rounding = 'NEAREST_RUPEE' | 'NEAREST_PAISE'

export function customerPriceFromBase(
  basePaise: number,
  commissionPercent: number,
  rounding: Rounding = 'NEAREST_RUPEE'
): { customerPaise: number; platformEarningPaise: number } {
  if (!Number.isFinite(basePaise) || basePaise < 0) {
    throw new Error(`Invalid basePaise: ${basePaise}`)
  }
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent >= 100) {
    throw new Error(`Invalid commissionPercent: ${commissionPercent}`)
  }

  const exact = (basePaise * 100) / (100 - commissionPercent)
  let customerPaise: number
  if (rounding === 'NEAREST_RUPEE') {
    customerPaise = Math.round(exact / 100) * 100
  } else {
    customerPaise = Math.round(exact)
  }
  if (customerPaise < basePaise) customerPaise = basePaise
  return { customerPaise, platformEarningPaise: customerPaise - basePaise }
}

/** Mark up merchant net rupees to customer-visible rupees (nearest rupee). */
export function markupCustomerPrice(netRupees: number, commissionPercent: number): number {
  if (!Number.isFinite(netRupees) || netRupees <= 0) return 0
  return customerPriceFromBase(Math.round(netRupees * 100), commissionPercent).customerPaise / 100
}
