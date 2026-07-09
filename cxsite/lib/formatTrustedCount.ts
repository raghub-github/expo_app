/** Offset always added to live DB total for display (marketing floor). */
export const TRUSTED_COUNT_DISPLAY_OFFSET = 2000

/**
 * Compact count for “Trusted by over X Indians”.
 * Live total gets +2000 first, then:
 *   2016 → "2.02K"
 *  12000 → "12K"
 * 100000+ → "1 LAKH" / "10 LAKH"
 */
export function formatTrustedIndianCount(total: number): string {
  const n = Math.max(0, Math.floor(total))

  if (n >= 100_000) {
    const lakhs = n / 100_000
    if (lakhs >= 10) return `${Math.floor(lakhs)} LAKH`
    const rounded = Math.floor(lakhs * 10) / 10
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} LAKH`
  }

  if (n >= 1_000) {
    const k = n / 1_000
    if (k >= 10) {
      const rounded = Math.round(k * 10) / 10
      return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}K`
    }
    const rounded = Math.round(k * 100) / 100
    return `${rounded.toFixed(2)}K`
  }

  return n.toLocaleString('en-IN')
}

/** Apply marketing offset then format (no trailing "+"). */
export function formatTrustedBannerCount(liveTotal: number): string {
  return formatTrustedIndianCount(liveTotal + TRUSTED_COUNT_DISPLAY_OFFSET)
}
