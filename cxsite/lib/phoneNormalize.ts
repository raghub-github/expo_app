/**
 * Normalizes mobile for public.customers.primary_mobile
 * Constraint: ^\+?[0-9]{10,15}$
 */
export function normalizePrimaryMobile(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let digitsOnly = trimmed.replace(/\D/g, '')
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    digitsOnly = digitsOnly.slice(1)
  }
  if (digitsOnly.length === 10) {
    return digitsOnly
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`
  }
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    return digitsOnly
  }

  const withPlus = trimmed.startsWith('+') ? trimmed.slice(1).replace(/\D/g, '') : ''
  if (withPlus.length >= 10 && withPlus.length <= 15 && trimmed.startsWith('+')) {
    return `+${withPlus}`
  }

  return null
}

/**
 * All plausible primary_mobile values in DB for the same Indian handset
 * (e.g. 7367878981 vs 917367878981 vs +917367878981) so lookups match real rows.
 */
export function primaryMobileLookupVariantsFromRaw(raw: string): string[] {
  const n = normalizePrimaryMobile(raw)
  if (!n) return []
  return primaryMobileLookupVariantsFromNormalized(n)
}

export function primaryMobileLookupVariantsFromNormalized(normalized: string): string[] {
  const d = normalized.replace(/^\+/, '')
  const out = new Set<string>()
  out.add(normalized)
  out.add(d)

  if (d.length === 10 && /^[6-9]\d{9}$/.test(d)) {
    out.add(`91${d}`)
    out.add(`+91${d}`)
  }
  if (d.length === 12 && d.startsWith('91')) {
    out.add(d)
    out.add(`+${d}`)
    out.add(d.slice(2))
  }

  return [...out]
}

/** MSG91 / SMS APIs: international digits without + (e.g. 917367878981) */
export function toMsg91MobileDigits(raw: string): string | null {
  const n = normalizePrimaryMobile(raw)
  if (!n) return null
  const d = n.replace(/^\+/, '')
  if (d.length === 10 && /^[6-9]\d{9}$/.test(d)) return `91${d}`
  if (d.length === 12 && d.startsWith('91')) return d
  if (d.length >= 10 && d.length <= 15) return d
  return null
}
