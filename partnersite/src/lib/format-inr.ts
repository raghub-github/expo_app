/** INR display for partner wallet / payments (en-IN locale, ₹ symbol). */
export function formatInr(
  amount: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const min = options?.minimumFractionDigits ?? 2;
  const max = options?.maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** Shorter axis labels (no decimals). */
export function formatInrCompact(amount: number): string {
  if (amount >= 100_000) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
