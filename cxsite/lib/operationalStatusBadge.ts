/**
 * Styling for merchant_stores.operational_status on listing cards (OPEN vs CLOSED).
 */

export function isOperationalClosedStatus(status: string): boolean {
  const u = status.trim().toUpperCase()
  if (u === 'OPEN' || u === 'OPERATIONAL') return false
  return u === 'CLOSED' || u === 'TEMPORARILY_CLOSED' || u.includes('CLOSED')
}

export function isOperationalOpenStatus(status: string): boolean {
  const u = status.trim().toUpperCase()
  return u === 'OPEN' || u === 'OPERATIONAL'
}

/** Tailwind classes for pill badge: green open, red closed, slate unknown. */
export function operationalStatusPillClassName(status: string): string {
  if (isOperationalClosedStatus(status)) {
    return 'border-red-800/35 bg-red-600 text-white'
  }
  if (isOperationalOpenStatus(status)) {
    return 'border-emerald-800/35 bg-[#109D4C] text-white'
  }
  return 'border-slate-500/40 bg-slate-600 text-white'
}
